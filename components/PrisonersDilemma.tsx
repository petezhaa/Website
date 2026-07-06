"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

type Engine = {
  memory: WebAssembly.Memory;
  strat_count: () => number;
  strat_name: (i: number) => number;
  begin: (s: number, seed: number) => void;
  play: (m: number) => number;
  my_score: () => number;
  op_score: () => number;
  round_count: () => number;
  tournament: (R: number, seed: number) => void;
  tour_score: (i: number) => number;
};

const TOUR_ROUNDS = 150;

export function PrisonersDilemma() {
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [opp, setOpp] = useState(0);
  const [scores, setScores] = useState({ my: 0, op: 0 });
  const [history, setHistory] = useState<[number, number][]>([]); // [yourMove, oppMove]
  const [tour, setTour] = useState<{ name: string; score: number; idx: number }[] | null>(null);

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  const beginMatch = useCallback((strat: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.begin(strat, (Date.now() & 0xffffffff) >>> 0);
    setOpp(strat);
    setScores({ my: 0, op: 0 });
    setHistory([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch("/dilemma.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        const nm: string[] = [];
        for (let i = 0; i < eng.strat_count(); i++) nm.push(readStr(eng.strat_name(i)));
        setNames(nm);
        beginMatch(0);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [readStr, beginMatch]);

  const move = (m: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const opMove = eng.play(m);
    setHistory((h) => [...h, [m, opMove]]);
    setScores({ my: eng.my_score(), op: eng.op_score() });
    bumpVibe("curiosity", 6);
  };

  const runTournament = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.tournament(TOUR_ROUNDS, (Date.now() & 0xffffffff) >>> 0);
    const rows = names.map((name, idx) => ({ name, idx, score: eng.tour_score(idx) }));
    rows.sort((a, b) => b.score - a.score);
    setTour(rows);
    bumpVibe("curiosity", 18);
  };

  const cell = (m: number) =>
    `grid h-5 w-5 place-items-center rounded-md text-[9px] font-bold ${
      m ? "bg-moss/25 text-moss" : "bg-accent/20 text-accent"
    }`;
  const recent = history.slice(-30);
  const maxTour = tour ? Math.max(...tour.map((r) => r.score), 1) : 1;

  if (failed)
    return <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>;
  if (!ready)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">dealing…</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* opponent picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">opponent</span>
        {names.map((n, i) => (
          <button
            key={n}
            onClick={() => beginMatch(i)}
            className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
              opp === i ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        {/* play area */}
        <div className="panel p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[11px] text-muted">you</p>
              <p className="font-mono text-3xl font-bold text-fg">{scores.my}</p>
            </div>
            <p className="pb-1 text-[11px] text-muted">round {history.length}</p>
            <div className="text-right">
              <p className="text-[11px] text-muted">{names[opp]}</p>
              <p className="font-mono text-3xl font-bold text-accent">{scores.op}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => move(1)}
              className="flex-1 rounded-md border-2 border-moss/60 bg-moss/10 px-4 py-3 text-sm font-medium text-moss transition hover:bg-moss/20"
            >
              Cooperate
            </button>
            <button
              onClick={() => move(0)}
              className="flex-1 rounded-md border-2 border-accent/60 bg-accent-soft px-4 py-3 text-sm font-medium text-accent transition hover:bg-accent/15"
            >
              Defect
            </button>
          </div>

          {/* move history */}
          {recent.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-10 shrink-0 text-[9px] text-muted">you</span>
                <div className="flex flex-wrap gap-1">
                  {recent.map(([m], i) => <span key={i} className={cell(m)}>{m ? "C" : "D"}</span>)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-10 shrink-0 text-[9px] text-muted">them</span>
                <div className="flex flex-wrap gap-1">
                  {recent.map(([, o], i) => <span key={i} className={cell(o)}>{o ? "C" : "D"}</span>)}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => beginMatch(opp)} className="tlink text-[10px]">rematch</button>
              </div>
            </div>
          )}
        </div>

        {/* payoff matrix */}
        <div className="panel p-5 font-mono text-[11px]">
          <p className="mb-2 uppercase tracking-widest text-accent">payoffs (you / them)</p>
          <table className="tabular-nums text-muted">
            <thead>
              <tr><th className="p-1.5"></th><th className="p-1.5 font-normal text-moss">they C</th><th className="p-1.5 font-normal text-accent">they D</th></tr>
            </thead>
            <tbody>
              <tr><td className="p-1.5 text-moss">you C</td><td className="p-1.5 text-center text-fg">3 / 3</td><td className="p-1.5 text-center">0 / 5</td></tr>
              <tr><td className="p-1.5 text-accent">you D</td><td className="p-1.5 text-center">5 / 0</td><td className="p-1.5 text-center">1 / 1</td></tr>
            </tbody>
          </table>
          <p className="mt-2 max-w-[15rem] leading-relaxed text-muted">
            defecting always beats cooperating in one round — yet mutual defection (1/1) is worse for both than mutual cooperation (3/3). that&apos;s the dilemma.
          </p>
        </div>
      </div>

      {/* Axelrod tournament */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Axelrod tournament</p>
          <button
            onClick={runTournament}
            className="btn-solid px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider"
          >
            {tour ? "run again" : "run tournament"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          every strategy plays every other (and itself), {TOUR_ROUNDS} rounds each, scored in C++.
        </p>
        {tour && (
          <div className="mt-4 space-y-2">
            {tour.map((r, i) => (
              <div key={r.name}>
                <div className="mb-0.5 flex justify-between font-mono text-[11px]">
                  <span className={r.idx === opp ? "font-bold text-accent" : "text-fg"}>
                    {i + 1}. {r.name}{i === 0 && <span className="ml-1.5 text-moss">winner</span>}
                  </span>
                  <span className="text-muted tabular-nums">{r.score.toLocaleString()}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-md bg-surface-2">
                  <div
                    className={`h-full rounded-md ${r.idx === opp ? "bg-accent" : "bg-moss/70"}`}
                    style={{ width: `${(r.score / maxTour) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 text-[10.5px] leading-relaxed text-muted">
              the classic result: &ldquo;nice&rdquo; retaliatory strategies (tit-for-tat and friends) beat greedy ones over the long run. being first to defect rarely pays.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
