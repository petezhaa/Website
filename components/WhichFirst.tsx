"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// Which came first?, streak mode against the history engine (rust/history.rs).
// Two events, click the earlier one. The engine deals pairs whose year gap
// shrinks as your streak grows, 400 years at first, down to a floor of 15, 
// so the easy centuries run out exactly when you start feeling confident.

type Engine = {
  memory: WebAssembly.Memory;
  n_events: () => number;
  event_name: (i: number) => number;
  event_year: (i: number) => number;
  wf_start: (seed: number) => void;
  wf_a: () => number;
  wf_b: () => number;
  wf_answer: (pickedA: number) => number;
  wf_streak: () => number;
  wf_best: () => number;
  wf_alive: () => number;
};

const BEST_KEY = "history-wf-best";

function formatYear(y: number): string {
  if (y < 0) return `${-y} BC`;
  if (y < 1000) return `AD ${y}`;
  return String(y);
}

// mirror of the engine's gap schedule: target = max(400 / (streak+1), 15)
function gapTarget(streak: number): number {
  return Math.max(Math.floor(400 / (streak + 1)), 15);
}

function gapLabel(streak: number): string {
  const t = gapTarget(streak);
  if (t >= 300) return "centuries apart. warm-up.";
  if (t >= 120) return "a century or so apart";
  if (t >= 55) return "decades apart now";
  if (t > 15) return "a few decades. read carefully.";
  return "floor reached: mere years apart";
}

type Pair = { aName: string; bName: string };
type Over = {
  aName: string;
  bName: string;
  aYear: number;
  bYear: number;
  picked: "a" | "b";
  finalStreak: number;
};

export function WhichFirst() {
  const engineRef = useRef<Engine | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pair, setPair] = useState<Pair | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState<Over | null>(null);
  const [flash, setFlash] = useState(false);
  const [nEvents, setNEvents] = useState(0);

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  const sync = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setPair({ aName: readStr(e.event_name(e.wf_a())), bName: readStr(e.event_name(e.wf_b())) });
    setStreak(e.wf_streak());
  }, [readStr]);

  const newGame = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.wf_start((Date.now() & 0xffffffff) >>> 0);
    setOver(null);
    setFlash(false);
    sync();
  }, [sync]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch("/history.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance
          .exports as unknown as Engine;
        engineRef.current = eng;
        eng.wf_start((Date.now() & 0xffffffff) >>> 0);
        setNEvents(eng.n_events());
        setBest(Number(localStorage.getItem(BEST_KEY)) || 0);
        setReady(true);
        sync();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [sync]);

  const pick = (side: "a" | "b") => {
    const e = engineRef.current;
    if (!e || over || !e.wf_alive()) return;
    // capture the dealt pair before wf_answer replaces it
    const a = e.wf_a();
    const b = e.wf_b();
    if (e.wf_answer(side === "a" ? 1 : 0)) {
      bumpVibe("gamer", 6);
      if (e.wf_streak() >= 10) foundSecret("chronologist");
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 400);
      sync(); // deal is already done engine-side; show the new pair now
    } else {
      const finalStreak = e.wf_streak();
      setOver({
        aName: readStr(e.event_name(a)),
        bName: readStr(e.event_name(b)),
        aYear: e.event_year(a),
        bYear: e.event_year(b),
        picked: side,
        finalStreak,
      });
      const prev = Number(localStorage.getItem(BEST_KEY)) || 0;
      if (finalStreak > prev) {
        localStorage.setItem(BEST_KEY, String(finalStreak));
        setBest(finalStreak);
      }
      bumpVibe("gamer", Math.min(4 + finalStreak * 2, 25));
    }
  };

  const btn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
      active
        ? "border-accent bg-accent-soft text-accent"
        : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  if (failed)
    return <p className="text-sm text-muted">the history engine didn&apos;t load.</p>;
  if (!ready || !pair)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">shuffling the timeline…</p>
      </div>
    );

  // log-scaled tension: 0 at a 400-year gap, 1 at the 15-year floor
  const tight = Math.min(1, 1 - Math.log(gapTarget(streak) / 15) / Math.log(400 / 15));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={newGame} className={btn(false)}>restart</button>
        <span className="text-[11px] text-muted">
          streak{" "}
          <span className={`font-bold transition-colors duration-300 ${flash ? "text-moss" : "text-fg"}`}>
            {over ? over.finalStreak : streak}
          </span>{" "}
          · best {best}
        </span>
      </div>

      <div
        className={`panel p-4 transition-colors duration-300 sm:p-6 ${
          flash ? "border-moss/70" : ""
        }`}
      >
        {!over ? (
          <>
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-muted">
              which came first?
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {([
                ["a", pair.aName],
                ["b", pair.bName],
              ] as const).map(([side, name]) => (
                <button
                  key={side}
                  onClick={() => pick(side)}
                  aria-label={`${name} came first`}
                  className="min-h-[7rem] cursor-pointer rounded-md border border-line bg-surface-2 px-6 py-8 text-center text-lg font-bold leading-snug text-fg transition hover:border-accent hover:bg-accent-soft sm:min-h-[9rem] sm:px-8 sm:text-xl"
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-muted">gap</span>
              <div className="h-1 flex-1 overflow-hidden rounded-md bg-line/60">
                <div
                  className="h-full rounded-md bg-accent transition-all duration-500"
                  style={{ width: `${Math.round(tight * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted">{gapLabel(streak)}</span>
            </div>
            <p className="mt-2 text-center text-[10px] text-muted/70">
              fair warning: the year gap tightens as your streak grows.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
              wrong. here are the receipts
            </p>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {([
                ["a", over.aName, over.aYear],
                ["b", over.bName, over.bYear],
              ] as const).map(([side, name, year]) => {
                const earlier =
                  (over.aYear < over.bYear ? "a" : "b") === side;
                return (
                  <div
                    key={side}
                    className={`rounded-md border px-6 py-6 text-center ${
                      earlier ? "border-moss/60" : "border-accent/50"
                    }`}
                  >
                    <p className="text-lg font-bold leading-snug text-fg">{name}</p>
                    <p
                      className={`mt-2 font-mono text-[11px] font-bold ${
                        earlier ? "text-moss" : "text-accent"
                      }`}
                    >
                      {formatYear(year)}
                      {earlier
                        ? ", earlier"
                        : over.picked === side
                          ? ", your pick"
                          : ""}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted">
              streak ended at <span className="font-bold text-fg">{over.finalStreak}</span> · best{" "}
              <span className="font-bold text-fg">{best}</span>
            </p>
            <button
              onClick={newGame}
              className="btn-solid px-5 py-2 text-xs font-bold uppercase tracking-wider"
            >
              play again
            </button>
          </div>
        )}
      </div>

      <div className="panel p-4 text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">chronology under pressure, in Rust</p>
        <p>
          {nEvents} events in the wasm engine&apos;s table, one rule: click the earlier one.
          each deal targets a year gap of max(400 / (streak + 1), 15), round one might be
          the fall of Rome versus Columbus; by streak ten it&apos;s the telephone versus the
          Wright brothers.
        </p>
        <p>years before year 1 are BC. the engine never deals a tie, so there is always a right answer.</p>
      </div>
    </div>
  );
}
