// Nim — combinatorial game theory in Rust, compiled straight to wasm32 with
// rustc (no cargo, no wasm-bindgen), same recipe as bench.rs:
//
//   rustc --target wasm32-unknown-unknown --crate-type cdylib -C opt-level=z
//         -C lto=fat -C codegen-units=1 -C panic=abort -C strip=symbols
//         -o public/nim.bin rust/nim.rs
//
// Normal play: take any number of stones from ONE pile; whoever takes the
// last stone wins. The whole theory is one line (Bouton, 1901): a position is
// losing exactly when the XOR of the pile sizes — the nim-sum — is zero. The
// bot plays that theorem. In "perfect" mode it never blunders, so the only
// way to win is to out-XOR it. Games start with nim-sum != 0 and you move
// first, so perfect play always beats the bot. That's the lesson.

#![allow(static_mut_refs)]

const MAXP: usize = 5;

static mut PILES: [i32; MAXP] = [0; MAXP];
static mut NP: usize = 0;
static mut TURN: i32 = 0; // 0 you, 1 bot
static mut WINNER: i32 = -1; // -1 in progress, 0 you, 1 bot
static mut CASUAL: i32 = 0; // casual bot blunders sometimes
static mut RNG: u32 = 0x2545f491;

fn rnd(n: u32) -> u32 {
    unsafe {
        let mut x = RNG;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        RNG = if x == 0 { 0x9e3779b9 } else { x };
        RNG % n.max(1)
    }
}

fn xor_all() -> i32 {
    unsafe {
        let mut s = 0;
        for i in 0..NP {
            s ^= PILES[i];
        }
        s
    }
}

fn done() -> bool {
    unsafe { (0..NP).all(|i| PILES[i] == 0) }
}

#[no_mangle]
pub extern "C" fn new_game(seed: u32, casual: i32) {
    unsafe {
        RNG = if seed == 0 { 0x2545f491 } else { seed };
        CASUAL = casual;
        NP = 3 + rnd(2) as usize; // 3 or 4 piles
        for i in 0..NP {
            PILES[i] = 3 + rnd(7) as i32; // 3..=9 stones
        }
        // guarantee a winnable start: nim-sum must be nonzero for the
        // first player (you). If it lands on zero, nudge one pile.
        if xor_all() == 0 {
            let p = rnd(NP as u32) as usize;
            if PILES[p] > 1 {
                PILES[p] -= 1;
            } else {
                PILES[p] += 1;
            }
        }
        TURN = 0;
        WINNER = -1;
    }
}

#[no_mangle]
pub extern "C" fn pile_count() -> i32 {
    unsafe { NP as i32 }
}

#[no_mangle]
pub extern "C" fn pile(i: i32) -> i32 {
    unsafe {
        if i >= 0 && (i as usize) < NP {
            PILES[i as usize]
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn nim_sum() -> i32 {
    xor_all()
}

#[no_mangle]
pub extern "C" fn turn() -> i32 {
    unsafe { TURN }
}

#[no_mangle]
pub extern "C" fn winner() -> i32 {
    unsafe { WINNER }
}

/// your move: take n stones from pile p. returns 1 if legal, 0 otherwise.
#[no_mangle]
pub extern "C" fn take(p: i32, n: i32) -> i32 {
    unsafe {
        if WINNER >= 0 || TURN != 0 {
            return 0;
        }
        if p < 0 || (p as usize) >= NP || n < 1 || n > PILES[p as usize] {
            return 0;
        }
        PILES[p as usize] -= n;
        if done() {
            WINNER = 0; // you took the last stone
        } else {
            TURN = 1;
        }
        1
    }
}

/// the bot moves. returns pile*100 + taken, or -1 if it isn't the bot's turn.
/// perfect mode plays Bouton's strategy: if the nim-sum s != 0, some pile has
/// PILES[p] ^ s < PILES[p]; shrinking it to PILES[p] ^ s zeroes the sum.
#[no_mangle]
pub extern "C" fn bot_move() -> i32 {
    unsafe {
        if WINNER >= 0 || TURN != 1 {
            return -1;
        }
        let s = xor_all();
        let mut p: usize = 0;
        let mut n: i32 = 1;
        let blunder = CASUAL != 0 && rnd(10) < 4; // casual: ~40% random move
        if s != 0 && !blunder {
            for i in 0..NP {
                let target = PILES[i] ^ s;
                if target < PILES[i] {
                    p = i;
                    n = PILES[i] - target;
                    break;
                }
            }
        } else {
            // zero position (bot is theoretically lost) or a casual blunder:
            // take a random legal bite and hope the human slips
            let mut nonempty = [0usize; MAXP];
            let mut cnt = 0;
            for i in 0..NP {
                if PILES[i] > 0 {
                    nonempty[cnt] = i;
                    cnt += 1;
                }
            }
            p = nonempty[rnd(cnt as u32) as usize];
            // stalling bite: small when losing, random when blundering
            n = if blunder {
                1 + rnd(PILES[p] as u32) as i32
            } else {
                1
            };
        }
        PILES[p] -= n;
        if done() {
            WINNER = 1;
        } else {
            TURN = 0;
        }
        (p as i32) * 100 + n
    }
}
