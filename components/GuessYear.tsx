"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// Guess the Year, history on a slider, scored by a Rust engine
// (rust/history.rs → /history.bin). Six events, 20 seconds each. The engine
// grades on a curve that widens with age: the pyramid forgives a century,
// the iPhone does not.

type Engine = {
  memory: WebAssembly.Memory;
  event_name: (i: number) => number;
  event_year: (i: number) => number;
  gy_start: (seed: number) => void;
  gy_round: () => number;
  gy_rounds: () => number;
  gy_event: () => number;
  gy_submit: (guess: number, elapsedMs: number) => number;
  gy_total: () => number;
  gy_finished: () => number;
  gy_next: () => number;
};

const YEAR_MIN = -2600;
const YEAR_MAX = 2026;
const ROUND_MS = 20_000;
const BEST_KEY = "history-gy-best";

// era ticks, a linear slider wearing a nonlinear costume
const TICKS = [
  { v: -2500, label: "2500 BC" },
  { v: 1, label: "1 AD" },
  { v: 1000, label: "1000" },
  { v: 1500, label: "1500" },
  { v: 1800, label: "1800" },
  { v: 1900, label: "1900" },
  { v: 2000, label: "2000" },
];

function fmtYear(y: number): string {
  if (y < 0) return `${-y} BC`;
  if (y === 0) return "1 BC"; // there is no year zero; the slider hasn't heard
  if (y < 1000) return `AD ${y}`;
  return String(y);
}

type Phase = "guess" | "reveal" | "done";

export function GuessYear() {
  const engineRef = useRef<Engine | null>(null);
  const roundStartRef = useRef(0);
  const lockedRef = useRef(false); // guards the click-vs-timeout photo finish
  const lockRef = useRef<(auto?: boolean) => void>(() => {});

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gameId, setGameId] = useState(0);
  const [phase, setPhase] = useState<Phase>("guess");
  const [round, setRound] = useState(0);
  const [roundsTotal, setRoundsTotal] = useState(6);
  const [eventName, setEventName] = useState("");
  const [guess, setGuess] = useState(1000);
  const [timeLeft, setTimeLeft] = useState(20);
  const [last, setLast] = useState({ pts: 0, actual: 0, guess: 0 });
  const [shownPts, setShownPts] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [total, setTotal] = useState(0);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const readStr = useCallback((ptr: number): string => {
    const e = engineRef.current;
    if (!e) return "";
    const bytes = new Uint8Array(e.memory.buffer);
    let end = ptr;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(ptr, end));
  }, []);

  const startGame = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.gy_start((Date.now() & 0xffffffff) >>> 0);
    setRound(0);
    setRoundsTotal(e.gy_rounds());
    setTotal(0);
    setGuess(1000);
    setNewBest(false);
    setTimedOut(false);
    setEventName(readStr(e.event_name(e.gy_event())));
    setPhase("guess");
    setGameId((g) => g + 1);
  }, [readStr]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch("/history.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        engineRef.current = (await WebAssembly.instantiate(buf)).instance
          .exports as unknown as Engine;
        setBest(Number(localStorage.getItem(BEST_KEY)) || 0);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // deal the first hand once the engine is up
  useEffect(() => {
    if (ready) startGame();
  }, [ready, startGame]);

  const lockIn = useCallback(
    (auto = false) => {
      const e = engineRef.current;
      if (!e || phase !== "guess" || lockedRef.current) return;
      lockedRef.current = true;
      const elapsed = auto
        ? ROUND_MS
        : Math.min(performance.now() - roundStartRef.current, ROUND_MS);
      const pts = e.gy_submit(guess, elapsed);
      setLast({ pts, actual: e.event_year(e.gy_event()), guess });
      setTotal(e.gy_total());
      setTimedOut(auto);
      setPhase("reveal");
      bumpVibe("gamer", 6);
    },
    [phase, guess]
  );
  lockRef.current = lockIn;

  // 20s countdown; at zero the slider speaks for you
  useEffect(() => {
    if (!ready || phase !== "guess") return;
    roundStartRef.current = performance.now();
    lockedRef.current = false;
    setTimeLeft(20);
    const id = window.setInterval(() => {
      const elapsed = performance.now() - roundStartRef.current;
      setTimeLeft(Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000)));
      if (elapsed >= ROUND_MS) lockRef.current(true);
    }, 100);
    return () => window.clearInterval(id);
  }, [ready, phase, round, gameId]);

  // count the points up instead of just stating them
  useEffect(() => {
    if (phase !== "reveal") return;
    const target = last.pts;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setShownPts(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, last]);

  const next = useCallback(() => {
    const e = engineRef.current;
    if (!e || phase !== "reveal") return;
    if (e.gy_finished()) {
      const prev = Number(localStorage.getItem(BEST_KEY)) || 0;
      const nb = total > prev;
      if (nb) localStorage.setItem(BEST_KEY, String(total));
      setBest(Math.max(prev, total));
      setNewBest(nb);
      setPhase("done");
      bumpVibe("gamer", 15);
      return;
    }
    e.gy_next();
    setRound(e.gy_round());
    setGuess(1000);
    setTimedOut(false);
    setEventName(readStr(e.event_name(e.gy_event())));
    setPhase("guess");
  }, [phase, total, readStr]);

  const btn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
      active
        ? "border-accent bg-accent-soft text-accent"
        : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  if (failed)
    return <p className="text-sm text-muted">the history engine didn&apos;t load.</p>;
  if (!ready)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">excavating the timeline…</p>
      </div>
    );

  // engine floors exact elapsed and only pays when close; stay under, never over-promise
  const bonusForSpeed = Math.max(0, Math.floor(((timeLeft - 1) / 20) * 100));
  const diff = Math.abs(last.guess - last.actual);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={startGame} className={btn(false)}>new game</button>
        <span className="text-[11px] text-muted">
          round {Math.min(round + 1, roundsTotal)} / {roundsTotal} · total {total}
          {best > 0 && ` · best ${best}`}
        </span>
      </div>

      <div className="panel p-6">
        {phase !== "done" && (
          <>
            <div className="flex items-baseline justify-between gap-4 text-[11px] text-muted">
              <span>when did this happen?</span>
              {phase === "guess" && (
                <span className={timeLeft <= 5 ? "font-bold text-accent" : ""}>
                  {timeLeft}s · +{bonusForSpeed} if close
                </span>
              )}
            </div>
            <h3 className="mt-2 text-2xl leading-snug tracking-tight sm:text-3xl">
              {eventName}
            </h3>
          </>
        )}

        {phase === "guess" && (
          <div className="mt-6">
            <input
              type="range"
              min={YEAR_MIN}
              max={YEAR_MAX}
              step={1}
              value={guess}
              onChange={(e) => setGuess(Number(e.target.value))}
              className="w-full touch-none accent-accent"
              aria-label="your year guess"
              aria-valuetext={fmtYear(guess)}
            />
            {/* era ticks, staggered so the crowded modern end stays legible */}
            <div className="relative h-11">
              {TICKS.map((t, i) => (
                <span
                  key={t.v}
                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${((t.v - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%` }}
                >
                  <span className="h-1.5 w-px bg-line" />
                  <span
                    className="whitespace-nowrap font-mono text-[9px] tabular-nums text-muted/70"
                    style={{ marginTop: 2 + (i % 3) * 11 }}
                  >
                    {t.label}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-2xl tabular-nums text-accent">
                {fmtYear(guess)}
              </span>
              <button
                onClick={() => lockIn()}
                className="btn-solid px-5 py-2 text-xs font-bold uppercase tracking-wider"
              >
                lock it in
              </button>
            </div>
          </div>
        )}

        {phase === "reveal" && (
          <div className="mt-6 flex flex-col items-center gap-1 text-center">
            {timedOut && (
              <p className="text-[10px] text-muted">
                time ran out, the slider answered for you.
              </p>
            )}
            <p className="font-mono font-bold text-4xl tracking-tight text-accent">
              {fmtYear(last.actual)}
            </p>
            <p className="text-[11px] text-muted">
              you said {fmtYear(last.guess)}, {" "}
              {diff === 0
                ? "dead on."
                : diff <= 2
                  ? `off by ${diff}, inside the bullseye.`
                  : `off by ${diff.toLocaleString()} years.`}
            </p>
            <p
              className={`mt-2 font-mono text-3xl font-bold tabular-nums ${
                last.pts >= 800 ? "text-moss" : "text-fg"
              }`}
            >
              +{shownPts}
            </p>
            <button
              onClick={next}
              className="btn-term mt-3 px-5 py-2.5 text-xs font-bold uppercase tracking-wider"
            >
              {engineRef.current?.gy_finished() ? "final tally" : "next event"}
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
              final tally
            </p>
            <p className="font-mono font-bold text-5xl tracking-tight">
              {total}
              <span className="text-2xl text-muted"> / 6000</span>
            </p>
            <p className="text-[11px] text-muted">
              {newBest ? (
                <span className="font-bold text-moss">new best.</span>
              ) : (
                `best ${best}`
              )}
            </p>
            <button
              onClick={startGame}
              className="btn-solid mt-2 px-5 py-2 text-xs font-bold uppercase tracking-wider"
            >
              play again
            </button>
          </div>
        )}
      </div>

      <div className="panel p-4 text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">forgiving chronology, in Rust</p>
        <p>the engine (rust/history.rs → wasm) grades on a curve: half points when you&apos;re off by one-twelfth of the event&apos;s age, floor of six years.</p>
        <p>so the pyramid forgives a century. the iPhone does not.</p>
        <p>within 2 years is a bullseye, 1000 flat. close and quick earns up to +100 on top, capped at 1000 a round. six rounds, 6000 possible.</p>
      </div>
    </div>
  );
}
