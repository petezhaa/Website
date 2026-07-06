"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// Nim — combinatorial game theory with a Rust engine (rust/nim.rs). Take any
// number of stones from one pile; last stone wins. The bot plays Bouton's
// 1901 theorem; the math panel shows you the XOR it's playing.

type Engine = {
  new_game: (seed: number, casual: number) => void;
  pile_count: () => number;
  pile: (i: number) => number;
  nim_sum: () => number;
  winner: () => number;
  take: (p: number, n: number) => number;
  bot_move: () => number;
};

const PILE_NAMES = ["A", "B", "C", "D", "E"];

export function NimGame() {
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [piles, setPiles] = useState<number[]>([]);
  const [hover, setHover] = useState<{ p: number; n: number } | null>(null);
  const [busy, setBusy] = useState(false); // bot "thinking"
  const [winner, setWinner] = useState(-1);
  const [note, setNote] = useState("take stones from one pile. last stone wins.");
  const [casual, setCasual] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [nimSum, setNimSum] = useState(0);
  const [record, setRecord] = useState({ you: 0, bot: 0 });

  const sync = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setPiles(Array.from({ length: e.pile_count() }, (_, i) => e.pile(i)));
    setNimSum(e.nim_sum());
    setWinner(e.winner());
  }, []);

  const newGame = useCallback(
    (cas: boolean) => {
      const e = engineRef.current;
      if (!e) return;
      e.new_game((Date.now() & 0xffffffff) >>> 0, cas ? 1 : 0);
      setNote("your move. take stones from one pile — last stone wins.");
      setBusy(false);
      sync();
    },
    [sync]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch("/nim.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        engineRef.current = (await WebAssembly.instantiate(buf)).instance
          .exports as unknown as Engine;
        engineRef.current.new_game((Date.now() & 0xffffffff) >>> 0, 0);
        setReady(true);
        sync();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  const play = (p: number, n: number) => {
    const e = engineRef.current;
    if (!e || busy || e.winner() >= 0) return;
    if (!e.take(p, n)) return;
    bumpVibe("gamer", 6);
    setHover(null);
    sync();
    if (e.winner() === 0) {
      setNote("you took the last stone. you beat the theorem-bot.");
      setRecord((r) => ({ ...r, you: r.you + 1 }));
      bumpVibe("gamer", 25);
      if (!casual) foundSecret("bouton"); // beat perfect play = knew the theorem
      return;
    }
    // the bot replies after a beat, so it reads as a turn
    setBusy(true);
    setTimeout(() => {
      const mv = e.bot_move();
      setBusy(false);
      sync();
      if (mv >= 0) {
        const bp = Math.floor(mv / 100);
        const bn = mv % 100;
        if (e.winner() === 1) {
          setNote(`bot takes ${bn} from pile ${PILE_NAMES[bp]} — and the last stone. XOR wins again.`);
          setRecord((r) => ({ ...r, bot: r.bot + 1 }));
        } else {
          setNote(`bot takes ${bn} from pile ${PILE_NAMES[bp]}. your move.`);
        }
      }
    }, 550);
  };

  const btn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
      active
        ? "border-accent bg-accent-soft text-accent"
        : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  if (failed)
    return <p className="text-sm text-muted">the Nim engine didn&apos;t load.</p>;
  if (!ready)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">counting stones…</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => newGame(casual)} className={btn(false)}>new game</button>
        <button
          onClick={() => { setCasual(false); newGame(false); }}
          className={btn(!casual)}
          title="the bot plays Bouton's theorem, flawlessly"
        >
          perfect bot
        </button>
        <button
          onClick={() => { setCasual(true); newGame(true); }}
          className={btn(casual)}
          title="the bot blunders sometimes"
        >
          casual bot
        </button>
        <button onClick={() => setShowMath((s) => !s)} className={btn(showMath)}>
          show the math
        </button>
        <span className="font-mono text-[11px] text-muted">
          you {record.you} · bot {record.bot}
        </span>
      </div>

      {/* the piles */}
      <div className="panel p-6">
        <div className="flex items-end justify-center gap-8 sm:gap-14" style={{ minHeight: 240 }}>
          {piles.map((count, p) => (
            <div key={p} className="flex flex-col items-center gap-2">
              <div
                className="flex flex-col-reverse items-center gap-1.5"
                onMouseLeave={() => setHover(null)}
              >
                {Array.from({ length: count }, (_, k) => {
                  // clicking stone k takes it and every stone above it
                  const taking = count - k;
                  const selected = hover && hover.p === p && taking <= hover.n;
                  return (
                    <button
                      key={k}
                      onMouseEnter={() => setHover({ p, n: count - k })}
                      onClick={() => play(p, count - k)}
                      disabled={busy || winner >= 0}
                      aria-label={`take ${count - k} from pile ${PILE_NAMES[p]}`}
                      className={`h-6 w-10 rounded-full border transition sm:h-7 sm:w-12 ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-surface-2 hover:border-accent/60"
                      } ${busy || winner >= 0 ? "cursor-default opacity-80" : "cursor-pointer"}`}
                      style={{
                        boxShadow: selected ? "none" : "inset 0 -2px 0 rgba(0,0,0,0.08)",
                      }}
                    />
                  );
                })}
                {count === 0 && (
                  <span className="text-[10px] text-muted/60">empty</span>
                )}
              </div>
              <span className="font-mono text-[11px] text-muted">
                {PILE_NAMES[p]} · {count}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-muted">
          {busy ? "bot is XOR-ing…" : note}
        </p>
        {hover && !busy && winner < 0 && (
          <p className="text-center text-[10px] text-accent">
            take {hover.n} from pile {PILE_NAMES[hover.p]}
          </p>
        )}
        {winner >= 0 && (
          <div className="mt-3 text-center">
            <button
              onClick={() => newGame(casual)}
              className="btn-solid px-5 py-2 text-xs font-bold uppercase tracking-wider"
            >
              play again
            </button>
          </div>
        )}
      </div>

      {/* the math: pile sizes in binary and their XOR */}
      {showMath && (
        <div className="rounded-md border border-accent/40 bg-surface p-4 font-mono text-[12px]">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-accent">
            the nim-sum (XOR of the piles, in binary)
          </p>
          <table className="tabular-nums">
            <tbody>
              {piles.map((count, p) => (
                <tr key={p} className="text-muted">
                  <td className="pr-3">{PILE_NAMES[p]}</td>
                  <td className="pr-4 text-right text-fg">{count}</td>
                  <td className="tracking-[0.35em]">{count.toString(2).padStart(4, "0")}</td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <td className="pr-3 pt-1 text-muted">XOR</td>
                <td className={`pr-4 pt-1 text-right font-bold ${nimSum === 0 ? "text-moss" : "text-accent"}`}>
                  {nimSum}
                </td>
                <td className={`pt-1 tracking-[0.35em] ${nimSum === 0 ? "text-moss" : "text-accent"}`}>
                  {nimSum.toString(2).padStart(4, "0")}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 max-w-xl leading-relaxed text-muted">
            {nimSum === 0
              ? "nim-sum 0: whoever must move from here loses against perfect play. if it's your turn, stall and pray."
              : "nim-sum ≠ 0: there is exactly one kind of winning move — shrink a pile so the XOR becomes 0. find it."}
          </p>
        </div>
      )}

      <div className="panel p-4 text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">combinatorial game theory, in Rust</p>
        <p>Bouton (1901): a Nim position is lost for the player to move ⇔ the XOR of the pile sizes is 0.</p>
        <p>the bot just plays that theorem — when the nim-sum is s ≠ 0, some pile has pᵢ ⊕ s &lt; pᵢ, and shrinking it to pᵢ ⊕ s zeroes the sum.</p>
        <p>every game starts winnable (nim-sum ≠ 0, you move first). beat the perfect bot and you&apos;ve re-derived a 125-year-old theorem.</p>
      </div>
    </div>
  );
}
