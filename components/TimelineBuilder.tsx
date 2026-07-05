"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { bumpVibe } from "@/lib/vibeBus";

// Timeline Builder — six shuffled events from the Rust history engine
// (rust/history.rs), reordered by hand until they read oldest-to-newest.
// Scored by correctly-ordered pairs (Kendall tau against true chronology).

type Engine = {
  memory: WebAssembly.Memory;
  tl_deal: (seed: number) => void;
  tl_event: (k: number) => number;
  tl_score: (
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    p4: number,
    p5: number
  ) => number;
  event_name: (i: number) => number;
  event_year: (i: number) => number;
};

type Card = {
  pos: number; // position in the dealt hand (0..5) — what tl_score wants
  name: string;
  year: number;
};

const BEST_KEY = "history-tl-best";
const PAIRS = 15;

const fmtYear = (y: number) => (y < 0 ? `${-y} BC` : y >= 1000 ? `${y}` : `AD ${y}`);

const verdict = (s: number) =>
  s === PAIRS
    ? "flawless chronology"
    : s >= 12
      ? "historian adjacent"
      : s >= 8
        ? "directionally correct"
        : "time is a circle, apparently";

export function TimelineBuilder() {
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hand, setHand] = useState<Card[]>([]); // display order, earliest at top
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(null);

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  const deal = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.tl_deal((Date.now() & 0xffffffff) >>> 0);
    setHand(
      Array.from({ length: 6 }, (_, k) => {
        const idx = e.tl_event(k);
        return { pos: k, name: readStr(e.event_name(idx)), year: e.event_year(idx) };
      })
    );
    setRevealed(false);
    setScore(null);
  }, [readStr]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch("/history.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        engineRef.current = (await WebAssembly.instantiate(buf)).instance
          .exports as unknown as Engine;
        deal();
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    try {
      const v = localStorage.getItem(BEST_KEY);
      if (v !== null && Number.isFinite(parseInt(v, 10))) setBest(parseInt(v, 10));
    } catch {
      // private mode etc. — the best score just stays session-only
    }
    return () => {
      cancelled = true;
    };
  }, [deal]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (revealed || j < 0 || j >= hand.length) return;
    setHand((h) => {
      const next = [...h];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    bumpVibe("gamer", 2);
  };

  const check = () => {
    const e = engineRef.current;
    if (!e || revealed || hand.length !== 6) return;
    const p = hand.map((c) => c.pos);
    const s = e.tl_score(p[0], p[1], p[2], p[3], p[4], p[5]);
    if (s < 0) return; // engine rejected the permutation; shouldn't happen
    setScore(s);
    setRevealed(true);
    bumpVibe("gamer", s === PAIRS ? 30 : 6 + Math.floor(s / 3));
    if (best === null || s > best) {
      setBest(s);
      try {
        localStorage.setItem(BEST_KEY, String(s));
      } catch {
        // storage refused; nothing to do
      }
    }
  };

  const btn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition ${
      active
        ? "border-accent bg-accent-soft text-accent"
        : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  if (failed)
    return <p className="font-mono text-sm text-muted">the history engine didn&apos;t load.</p>;
  if (!ready)
    return (
      <div className="grid h-40 place-items-center rounded-2xl border border-line bg-surface">
        <p className="animate-pulse font-mono text-sm text-muted">shuffling the centuries…</p>
      </div>
    );

  // true chronological rank of each dealt card (years are unique by deal)
  const rank = new Map<number, number>();
  [...hand].sort((a, b) => a.year - b.year).forEach((c, i) => rank.set(c.pos, i));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={deal} className={btn(false)}>new hand</button>
        <span className="font-mono text-[11px] text-muted">
          {best !== null ? `best ${best}/${PAIRS}` : "no best yet"}
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          earliest on top · latest on the bottom
        </p>

        <div className="flex flex-col gap-2">
          {hand.map((card, i) => {
            const correct = revealed && rank.get(card.pos) === i;
            const cardTone = revealed
              ? correct
                ? "border-moss bg-surface-2"
                : "border-accent bg-surface-2"
              : "border-line bg-surface-2";
            return (
              <motion.div
                key={card.pos}
                layout
                transition={{ type: "spring", stiffness: 550, damping: 38 }}
                className={`flex items-center gap-3 rounded-xl border p-2.5 sm:p-3 ${cardTone}`}
              >
                <span className="w-4 text-center font-mono text-[10px] text-muted/70">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={revealed || i === 0}
                    aria-label={`move "${card.name}" earlier`}
                    className="grid h-6 w-7 place-items-center rounded-md border border-line font-mono text-[11px] text-muted transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={revealed || i === hand.length - 1}
                    aria-label={`move "${card.name}" later`}
                    className="grid h-6 w-7 place-items-center rounded-md border border-line font-mono text-[11px] text-muted transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-fg">{card.name}</p>
                  {revealed && (
                    <p
                      className={`mt-0.5 font-mono text-[11px] ${
                        correct ? "text-moss" : "text-accent"
                      }`}
                    >
                      {fmtYear(card.year)} ·{" "}
                      {correct ? "right slot" : `belongs in slot ${rank.get(card.pos)! + 1}`}
                    </p>
                  )}
                </div>
                {revealed && (
                  <span
                    aria-hidden
                    className={`font-mono text-sm font-bold ${
                      correct ? "text-moss" : "text-accent"
                    }`}
                  >
                    {correct ? "✓" : "✗"}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-4 text-center">
          {!revealed ? (
            <button
              onClick={check}
              className="rounded-lg bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90"
            >
              check my timeline
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="font-mono text-sm text-fg">
                <span className={score === PAIRS ? "text-moss" : "text-accent"}>
                  {score}/{PAIRS}
                </span>{" "}
                pairs in order — {verdict(score ?? 0)}
              </p>
              <button
                onClick={deal}
                className="rounded-lg bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90"
              >
                new hand
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">kendall tau, in Rust</p>
        <p>
          six events make fifteen pairs. the engine counts how many pairs you put in the right
          order — the Kendall tau rank statistic, moonlighting as a history quiz.
        </p>
        <p>
          shuffling at random averages 7.5 of 15, so &quot;directionally correct&quot; starts at 8.
          the deal never repeats a year; there is always exactly one right answer.
        </p>
        <p>
          swapping two adjacent cards changes exactly one pair — every move is worth exactly one
          point, up or down.
        </p>
      </div>
    </div>
  );
}
