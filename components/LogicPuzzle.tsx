"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

type Engine = {
  memory: WebAssembly.Memory;
  n_levels: () => number;
  level_name: (i: number) => number;
  level_par: (i: number) => number;
  load_level: (i: number) => void;
  level_inputs: () => number;
  level_palette: () => number;
  target_row: (r: number) => number;
  add_gate: (t: number, in1: number, in2: number) => number;
  remove_last: () => void;
  clear_gates: () => void;
  n_gates: () => number;
  gate_type: (g: number) => number;
  gate_in1: (g: number) => number;
  gate_in2: (g: number) => number;
  eval_signal: (s: number, r: number) => number;
  eval_row: (r: number) => number;
  solved: () => number;
};

const GATE_NAMES = ["NOT", "AND", "OR", "XOR", "NAND", "NOR"];
const GATE_ARITY = [1, 2, 2, 2, 2, 2];
const IN_NAMES = ["A", "B", "C"];
const MAXG = 12;

const TAGLINES = [
  "two inputs, one gate, zero excuses. a warmup, not a trick.",
  "build the gate we deliberately left out of the palette.",
  "output 1 exactly when A and B agree. a consensus detector.",
  "three inputs vote, majority carries. par 4 wants something sneaky.",
  "the palette is one gate. it is enough. it is always enough. (B is soldered on but it is not your problem.)",
  "a nand is an and holding a grudge. talk it down.",
  "De Morgan in the wild: or is just nand of nots. feel it.",
  "the classic 4-nand xor, a rite of passage in every digital lab.",
  "C low picks A, C high picks B. congratulations, you are building what FPGAs are made of.",
];

// small SVG glyphs, the ANSI distinctive shapes, squeezed into a chip:
// D-shape AND, curved-back OR, triangle+dot NOT, a dot turns AND/OR into NAND/NOR
function GateGlyph({ t }: { t: number }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  return (
    <svg viewBox="0 0 30 20" className="h-4 w-6 shrink-0" aria-hidden>
      {t === 0 && (
        <>
          <path d="M4 2 L19 10 L4 18 Z" {...s} />
          <circle cx="23" cy="10" r="2.6" {...s} />
        </>
      )}
      {(t === 1 || t === 4) && <path d="M4 2 H15 A8 8 0 0 1 15 18 H4 Z" {...s} />}
      {(t === 2 || t === 3 || t === 5) && (
        <path d="M4 2 Q14 3 23 10 Q14 17 4 18 Q9 10 4 2 Z" {...s} />
      )}
      {t === 3 && <path d="M1 2 Q6 10 1 18" {...s} />}
      {(t === 4 || t === 5) && <circle cx="26" cy="10" r="2.6" {...s} />}
    </svg>
  );
}

export function LogicPuzzle() {
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [unlocked, setUnlocked] = useState(0); // highest playable level index
  const [best, setBest] = useState<Record<number, number>>({});
  const [selRow, setSelRow] = useState(0); // the probed truth-table row
  const [pending, setPending] = useState<{ t: number; ins: number[] } | null>(null);
  const [, setTick] = useState(0); // engine is authoritative; this re-renders
  const rerender = () => setTick((t) => t + 1);

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch("/logic.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        const nm: string[] = [];
        for (let i = 0; i < eng.n_levels(); i++) nm.push(readStr(eng.level_name(i)));
        setNames(nm);
        eng.load_level(0);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [readStr]);

  const eng = engineRef.current;
  const nIn = ready && eng ? eng.level_inputs() : 2;
  const rows = 1 << nIn;
  const palette = ready && eng ? eng.level_palette() : 0;
  const par = ready && eng ? eng.level_par(level) : 0;
  const nG = ready && eng ? eng.n_gates() : 0;
  const gates = ready && eng
    ? Array.from({ length: nG }, (_, k) => ({
        t: eng.gate_type(k), a: eng.gate_in1(k), b: eng.gate_in2(k),
      }))
    : [];
  const isSolved = ready && eng ? eng.solved() === 1 : false;

  const sigName = (sIdx: number) => (sIdx < nIn ? IN_NAMES[sIdx] : `g${sIdx - nIn + 1}`);
  const sigVal = (sIdx: number) => (ready && eng ? eng.eval_signal(sIdx, selRow) : 0);

  const pickLevel = (i: number) => {
    const e = engineRef.current;
    if (!e || i < 0 || i >= names.length || i > unlocked) return;
    e.load_level(i);
    setLevel(i);
    setPending(null);
    setSelRow(0);
    bumpVibe("curiosity", 2);
    rerender();
  };

  const startGate = (t: number) => {
    if (!ready || isSolved || nG >= MAXG) return;
    if (((palette >> t) & 1) === 0) return;
    setPending({ t, ins: [] });
  };

  const chooseSignal = (sIdx: number) => {
    const e = engineRef.current;
    if (!e || !pending) return;
    const ins = [...pending.ins, sIdx];
    if (ins.length < GATE_ARITY[pending.t]) {
      setPending({ ...pending, ins });
      return;
    }
    const id = e.add_gate(pending.t, ins[0], ins[1] ?? ins[0]);
    setPending(null);
    if (id >= 0) {
      bumpVibe("curiosity", 2);
      if (e.solved() === 1) {
        const n = e.n_gates();
        setBest((b) => ({ ...b, [level]: Math.min(b[level] ?? 99, n) }));
        setUnlocked((u) => Math.max(u, level + 1));
        bumpVibe("gamer", 12);
        bumpVibe("curiosity", 6);
      }
    }
    rerender();
  };

  const undo = () => {
    const e = engineRef.current;
    if (!e) return;
    if (pending) { setPending(null); return; } // undo cancels the staged gate first
    e.remove_last();
    rerender();
  };
  const clearAll = () => {
    const e = engineRef.current;
    if (!e) return;
    e.clear_gates();
    setPending(null);
    rerender();
  };

  const chip = (active: boolean) =>
    `chip px-2.5 py-1 text-[11px] transition ${
      active
        ? "border-accent bg-accent-soft text-accent"
        : "hover:border-accent hover:text-accent"
    }`;
  const valBadge = (v: number) =>
    `grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold ${
      v ? "bg-moss/25 text-moss" : "bg-surface-2 text-muted"
    }`;

  if (failed)
    return <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>;
  if (!ready)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">flashing the fpga…</p>
      </div>
    );

  const need = pending ? GATE_ARITY[pending.t] : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* level picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted">level</span>
        {names.map((nm, i) => {
          const locked = i > unlocked;
          const cleared = best[i] !== undefined;
          return (
            <button
              key={i}
              onClick={() => pickLevel(i)}
              disabled={locked}
              title={
                locked
                  ? "locked, clear the previous level first"
                  : `${nm}${cleared ? ` · best ${best[i]} gates` : ""}`
              }
              className={`${chip(level === i)} ${locked ? "cursor-not-allowed opacity-35" : ""}`}
            >
              {i + 1}
              {cleared && <span className="ml-1 text-moss">✓</span>}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted">
          {Object.keys(best).length}/{names.length} cleared · C++
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        lvl {level + 1} · <span className="text-fg">{names[level]}</span>, {TAGLINES[level] ?? ""}
      </p>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        {/* the bench: the netlist under construction */}
        <div className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="uppercase tracking-widest text-accent">the bench</span>
            <span className={`font-mono ${nG > par ? "text-gold" : "text-muted"}`}>
              gates {nG}/{MAXG} · par {par}
            </span>
          </div>

          {/* input pins, live at the probed row */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span className="text-muted">pins</span>
            {Array.from({ length: nIn }, (_, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-fg"
              >
                {IN_NAMES[i]}
                <span className={valBadge(sigVal(i))}>{sigVal(i)}</span>
              </span>
            ))}
            <span className="text-muted/70">
              · probing row {selRow} ({selRow.toString(2).padStart(nIn, "0")})
            </span>
          </div>

          {gates.length === 0 && !pending && (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[11px] text-muted">
              empty board. pick a gate from the palette below, solder responsibly.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {gates.map((g, k) => {
              const isOut = k === gates.length - 1;
              const v = sigVal(nIn + k);
              return (
                <div
                  key={k}
                  className={`flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px] ${
                    isOut ? "border-accent/60" : "border-line"
                  }`}
                >
                  <span className="w-6 shrink-0 text-muted">g{k + 1}</span>
                  <span className="flex items-center gap-1 text-fg">
                    <GateGlyph t={g.t} />
                    {GATE_NAMES[g.t]}
                  </span>
                  <span className="text-muted">
                    ({sigName(g.a)}{GATE_ARITY[g.t] === 2 ? `, ${sigName(g.b)}` : ""})
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className={valBadge(v)}>{v}</span>
                    {isOut && (
                      <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                        out
                      </span>
                    )}
                  </span>
                </div>
              );
            })}

            {/* the staged gate: pick its inputs from the live signals */}
            {pending && (
              <div className="rounded-md border border-dashed border-accent/60 px-2.5 py-2 font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-muted">g{nG + 1}</span>
                  <span className="flex items-center gap-1 text-fg">
                    <GateGlyph t={pending.t} />
                    {GATE_NAMES[pending.t]}
                  </span>
                  <span className="text-muted">
                    ({pending.ins.map(sigName).join(", ")}
                    {pending.ins.length > 0 && pending.ins.length < need ? ", " : ""}
                    {pending.ins.length < need ? "?" : ""})
                  </span>
                  <button
                    onClick={() => setPending(null)}
                    aria-label="cancel gate"
                    className="ml-auto px-1 text-muted transition hover:text-accent"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-muted">
                    {need === 1 ? "input:" : pending.ins.length === 0 ? "input 1:" : "input 2:"}
                  </span>
                  {Array.from({ length: nIn + nG }, (_, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => chooseSignal(sIdx)}
                      className={`${chip(false)} inline-flex items-center gap-1.5`}
                    >
                      {sigName(sIdx)}
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${sigVal(sIdx) ? "bg-moss" : "bg-line"}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* palette */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              palette
            </span>
            {GATE_NAMES.map((nm, t) => {
              const inPalette = ((palette >> t) & 1) === 1;
              return (
                <button
                  key={nm}
                  onClick={() => startGate(t)}
                  disabled={!inPalette || isSolved || nG >= MAXG}
                  title={inPalette ? `add ${nm}` : "not in this level"}
                  className={`${chip(pending?.t === t)} inline-flex items-center gap-1 disabled:cursor-not-allowed ${
                    inPalette ? "" : "opacity-35"
                  }`}
                >
                  <GateGlyph t={t} />
                  {nm}
                </button>
              );
            })}
            <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
            <button onClick={undo} disabled={nG === 0 && !pending} className={`${chip(false)} disabled:cursor-not-allowed disabled:opacity-35`}>
              undo
            </button>
            <button onClick={clearAll} disabled={nG === 0 && !pending} className={`${chip(false)} disabled:cursor-not-allowed disabled:opacity-35`}>
              clear
            </button>
          </div>
          {nG >= MAXG && !isSolved && (
            <p className="mt-2 text-[11px] text-accent">
              out of silicon. twelve gates is the whole die, undo something.
            </p>
          )}
        </div>

        {/* the spec: a live truth table */}
        <div className="panel p-4">
          <p className="mb-2 text-[11px] uppercase tracking-widest text-accent">the spec</p>
          <table className="font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="text-muted">
                {IN_NAMES.slice(0, nIn).map((n) => (
                  <th key={n} className="px-1.5 py-1 font-normal">{n}</th>
                ))}
                <th className="px-1.5 py-1 font-normal text-gold">goal</th>
                <th className="px-1.5 py-1 font-normal">you</th>
                <th className="w-5" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => {
                const goal = eng!.target_row(r);
                const yours = eng!.eval_row(r);
                const match = yours === goal;
                return (
                  <tr
                    key={r}
                    onClick={() => { setSelRow(r); bumpVibe("curiosity", 1); }}
                    className={`cursor-pointer transition ${
                      selRow === r ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    {Array.from({ length: nIn }, (_, i) => (
                      <td key={i} className="px-1.5 py-1 text-center text-fg">
                        {(r >> (nIn - 1 - i)) & 1}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-center text-gold">{goal}</td>
                    <td
                      className={`px-1.5 py-1 text-center ${
                        yours < 0 ? "text-muted/50" : match ? "text-moss" : "text-accent"
                      }`}
                    >
                      {yours < 0 ? "·" : yours}
                    </td>
                    <td className="px-1 py-1 text-center">
                      {yours < 0 ? "" : match ? (
                        <span className="text-moss">✓</span>
                      ) : (
                        <span className="text-accent">✗</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 max-w-[13rem] text-[10px] leading-relaxed text-muted">
            the truth table is the spec. there is no other spec. click a row to probe it, every
            gate on the bench lights up with its value for that combo.
          </p>
        </div>
      </div>

      {/* win state */}
      {isSolved && nG > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-moss/50 bg-moss/10 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-moss">
            ✓ all {rows} rows match. done in {nG} gate{nG === 1 ? "" : "s"} · par {par}, {" "}
            {nG < par
              ? "under par. the synthesizer would like a word."
              : nG === par
                ? "clean."
                : "it works; the timing report averts its eyes."}
          </p>
          {level + 1 < names.length ? (
            <button
              onClick={() => pickLevel(level + 1)}
              className="btn-solid px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            >
              next level
            </button>
          ) : (
            <span className="text-[11px] text-muted">
              that was the last one. you have re-derived the standard-cell library from a single
              gate. ship it.
            </span>
          )}
          <button onClick={clearAll} className={chip(false)}>
            rebuild{nG > par ? " (par is right there)" : ""}
          </button>
        </div>
      )}

      {/* the explainer */}
      <div className="panel p-4 text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the netlist, running in C++</p>
        <p>
          signals, inputs are 0..n−1; gate k&apos;s output is signal n+k. a new gate may only read
          signals that already exist, so the netlist is a DAG by construction: no combinational
          loops, ever, and evaluation is one left-to-right sweep.
        </p>
        <p>
          eval, for each row r (A is the top bit) C++ sweeps the gates in order: ¬a · a∧b · a∨b ·
          a⊕b · ¬(a∧b) · ¬(a∨b). the last gate placed is OUT; solved() compares it to the target
          on all 2ⁿ rows.
        </p>
        <p>
          the nand levels are the classic completeness result: x⊼x = ¬x, ¬(x⊼y) = x∧y, and De
          Morgan buys ∨, so one gate builds every circuit. your cpu is mostly this trick,
          repeated a few billion times.
        </p>
        <p>
          par, the known-minimal gate count. matching it is the sport; going over just means
          you&apos;ve invented technical debt.
        </p>
      </div>
    </div>
  );
}
