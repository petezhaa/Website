// The board game Go, written in Go. (The pun is the whole point.)
// Compiled to WebAssembly with the standard toolchain:
//
//	GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o ../public/goban.wasm
//
// The engine owns the rules: legality (occupied / suicide / simple ko),
// capture resolution by flood-filled liberties, pass, area scoring, and a
// greedy little opponent. TypeScript owns the wood and the stones.
package main

import (
	"math/rand"
	"syscall/js"
)

const N = 9

// 0 empty, 1 black (you), 2 white (the bot)
var (
	board    [N * N]int
	prev     [N * N]int // previous position, for simple-ko
	hasPrev  bool
	captures = map[int]int{1: 0, 2: 0}
	rng      = rand.New(rand.NewSource(42))
)

func idx(x, y int) int { return y*N + x }

func neighbors(i int) []int {
	x, y := i%N, i/N
	out := make([]int, 0, 4)
	if x > 0 {
		out = append(out, i-1)
	}
	if x < N-1 {
		out = append(out, i+1)
	}
	if y > 0 {
		out = append(out, i-N)
	}
	if y < N-1 {
		out = append(out, i+N)
	}
	return out
}

// group returns the connected group containing i and whether it has a liberty.
func group(b *[N * N]int, i int) (stones []int, alive bool) {
	color := b[i]
	seen := make(map[int]bool)
	stack := []int{i}
	seen[i] = true
	for len(stack) > 0 {
		s := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		stones = append(stones, s)
		for _, nb := range neighbors(s) {
			if b[nb] == 0 {
				alive = true
			} else if b[nb] == color && !seen[nb] {
				seen[nb] = true
				stack = append(stack, nb)
			}
		}
	}
	return stones, alive
}

// tryPlay simulates color playing at i on a copy; reports legality,
// the resulting position, and how many stones it captures.
func tryPlay(i, color int) (ok bool, next [N * N]int, caps int) {
	if board[i] != 0 {
		return false, next, 0
	}
	next = board
	next[i] = color
	opp := 3 - color
	// capture any adjacent opponent group left without liberties
	for _, nb := range neighbors(i) {
		if next[nb] == opp {
			if stones, alive := group(&next, nb); !alive {
				for _, s := range stones {
					next[s] = 0
					caps++
				}
			}
		}
	}
	// suicide is illegal
	if _, alive := group(&next, i); !alive {
		return false, next, 0
	}
	// simple ko: may not recreate the previous whole-board position
	if hasPrev && next == prev {
		return false, next, 0
	}
	return true, next, caps
}

func commit(next [N * N]int, color, caps int) {
	prev = board
	hasPrev = true
	board = next
	captures[color] += caps
}

// the bot: capture if it can, save itself from atari if it must,
// otherwise a random sensible point (not filling its own one-point eyes).
func botMove() int {
	type cand struct{ i, score int }
	var best []cand
	for i := 0; i < N*N; i++ {
		ok, next, caps := tryPlay(i, 2)
		if !ok {
			continue
		}
		score := caps * 100
		// don't fill your own eye
		eye := true
		for _, nb := range neighbors(i) {
			if board[nb] != 2 {
				eye = false
			}
		}
		if eye {
			continue
		}
		// does this move leave the new group in atari? mildly avoid
		if stones, _ := group(&next, i); len(stones) > 0 {
			libs := 0
			for _, s := range stones {
				for _, nb := range neighbors(s) {
					if next[nb] == 0 {
						libs++
					}
				}
			}
			if libs <= 1 {
				score -= 50
			}
		}
		// slight pull toward the middle
		x, y := i%N, i/N
		dx, dy := x-N/2, y-N/2
		score -= (dx*dx + dy*dy) / 4
		score += rng.Intn(8)
		best = append(best, cand{i, score})
	}
	if len(best) == 0 {
		return -1 // pass
	}
	top := best[0]
	for _, c := range best[1:] {
		if c.score > top.score {
			top = c
		}
	}
	return top.i
}

// area scoring: stones + empty regions bordered by exactly one color
func score() (black, white int) {
	seen := make(map[int]bool)
	for i := 0; i < N*N; i++ {
		switch board[i] {
		case 1:
			black++
		case 2:
			white++
		case 0:
			if seen[i] {
				continue
			}
			region := []int{i}
			seen[i] = true
			stack := []int{i}
			touch := map[int]bool{}
			for len(stack) > 0 {
				s := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				for _, nb := range neighbors(s) {
					if board[nb] == 0 && !seen[nb] {
						seen[nb] = true
						region = append(region, nb)
						stack = append(stack, nb)
					} else if board[nb] != 0 {
						touch[board[nb]] = true
					}
				}
			}
			if touch[1] && !touch[2] {
				black += len(region)
			} else if touch[2] && !touch[1] {
				white += len(region)
			}
		}
	}
	return black, white
}

func boardJS() js.Value {
	arr := make([]interface{}, N*N)
	for i, v := range board {
		arr[i] = v
	}
	return js.ValueOf(arr)
}

func main() {
	api := map[string]interface{}{
		"size": js.FuncOf(func(js.Value, []js.Value) interface{} { return N }),
		"reset": js.FuncOf(func(js.Value, []js.Value) interface{} {
			board = [N * N]int{}
			hasPrev = false
			captures = map[int]int{1: 0, 2: 0}
			return nil
		}),
		"board": js.FuncOf(func(js.Value, []js.Value) interface{} { return boardJS() }),
		// play(x, y): you move; the bot replies. returns
		// {ok, botX, botY, botPassed, capsBlack, capsWhite}
		"play": js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
			i := idx(args[0].Int(), args[1].Int())
			ok, next, caps := tryPlay(i, 1)
			if !ok {
				return js.ValueOf(map[string]interface{}{"ok": false})
			}
			commit(next, 1, caps)
			res := map[string]interface{}{"ok": true, "botPassed": true, "botX": -1, "botY": -1}
			if b := botMove(); b >= 0 {
				if ok2, next2, caps2 := tryPlay(b, 2); ok2 {
					commit(next2, 2, caps2)
					res["botPassed"] = false
					res["botX"] = b % N
					res["botY"] = b / N
				}
			}
			res["capsBlack"] = captures[1]
			res["capsWhite"] = captures[2]
			return js.ValueOf(res)
		}),
		"pass": js.FuncOf(func(js.Value, []js.Value) interface{} {
			res := map[string]interface{}{"botPassed": true, "botX": -1, "botY": -1}
			if b := botMove(); b >= 0 {
				if ok, next, caps := tryPlay(b, 2); ok {
					commit(next, 2, caps)
					res["botPassed"] = false
					res["botX"] = b % N
					res["botY"] = b / N
				}
			}
			// the bot's reply can capture, so the counters ride along here too
			res["capsBlack"] = captures[1]
			res["capsWhite"] = captures[2]
			return js.ValueOf(res)
		}),
		"score": js.FuncOf(func(js.Value, []js.Value) interface{} {
			b, w := score()
			return js.ValueOf(map[string]interface{}{"black": b, "white": w})
		}),
	}
	js.Global().Set("GoEngine", js.ValueOf(api))
	select {} // keep the Go runtime alive for the callbacks
}
