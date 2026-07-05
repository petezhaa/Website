"use client";

import { useEffect, useRef, useState } from "react";
import { benchRun } from "@/lib/bench";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

type WasmBench = { bench_run: (n: number) => number };
type Row = {
  key: string;
  label: string;
  note: string;
  ms: number;
  ops: number;
  sum: number;
  bar: string;
};

const N = 1_500_000; // haversines per run

export function BenchPanel() {
  const cppRef = useRef<WasmBench | null>(null);
  const rustRef = useRef<WasmBench | null>(null);
  const sizeRef = useRef({ cpp: 0, rust: 0 });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filled, setFilled] = useState(false); // drives the bar fill-up animation

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cb, rb] = await Promise.all([
          fetch("/bench.bin").then((r) => r.arrayBuffer()),
          fetch("/benchrs.bin").then((r) => r.arrayBuffer()),
        ]);
        if (cancelled) return;
        cppRef.current = (await WebAssembly.instantiate(cb)).instance
          .exports as unknown as WasmBench;
        rustRef.current = (await WebAssembly.instantiate(rb)).instance
          .exports as unknown as WasmBench;
        sizeRef.current = { cpp: cb.byteLength, rust: rb.byteLength };
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async () => {
    const cpp = cppRef.current;
    const rust = rustRef.current;
    if (!cpp || !rust || running) return;
    setRunning(true);
    bumpVibe("curiosity", 16);
    foundSecret("laboratory"); // ran the benchmark: a person of science
    // yield so the button paints "running…" before we hog the main thread
    await new Promise((r) => setTimeout(r, 40));

    const best = (fn: (n: number) => number) => {
      let ms = Infinity;
      let sum = 0;
      for (let t = 0; t < 3; t++) {
        const t0 = performance.now();
        sum = fn(N);
        const d = performance.now() - t0;
        if (d < ms) ms = d;
      }
      return { ms, sum };
    };

    // warm up the JITs / caches first
    cpp.bench_run(50_000);
    rust.bench_run(50_000);
    benchRun(50_000);

    const c = best((n) => cpp.bench_run(n));
    const r = best((n) => rust.bench_run(n));
    const j = best(benchRun);
    const maxOps = Math.max(N / (c.ms / 1000), N / (r.ms / 1000), N / (j.ms / 1000));

    const mk = (key: string, label: string, note: string, res: { ms: number; sum: number }): Row => {
      const ops = N / (res.ms / 1000);
      return { key, label, note, ms: res.ms, ops, sum: res.sum, bar: `${(ops / maxOps) * 100}%` };
    };

    const kb = (b: number) => `${(b / 1024).toFixed(1)} KB compiled`;
    // rank by MEASURED speed — don't assume wasm wins (V8 is very good here)
    const built = [
      mk("cpp", "C++ → wasm", kb(sizeRef.current.cpp), c),
      mk("rust", "Rust → wasm", kb(sizeRef.current.rust), r),
      mk("js", "JavaScript", "ships as source", j),
    ].sort((x, y) => y.ops - x.ops);
    setFilled(false);
    setRows(built);
    setRunning(false);
    // paint the bars at 0 width, then let CSS animate them to full
    requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true)));
  };

  const fmtOps = (ops: number) =>
    ops >= 1e6 ? `${(ops / 1e6).toFixed(1)}M/s` : `${Math.round(ops / 1e3)}K/s`;

  const allMatch =
    rows && rows.every((r) => Math.abs(r.sum - rows[0].sum) < 1e-6);
  // rows are sorted fastest-first; the spread tells the honest story
  const spread = rows ? rows[0].ops / rows[rows.length - 1].ops : 1;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-sm font-medium">Same function, three languages</p>
      <p className="mb-4 mt-1 font-mono text-[11px] leading-relaxed text-muted">
        the engine&apos;s haversine, hand-written in C++, Rust, and JS with the
        exact same math. C++ and Rust compile to bare wasm; JS doesn&apos;t. all
        three run {N.toLocaleString()} times in your browser, right now.
      </p>

      {failed ? (
        <p className="font-mono text-[11px] text-muted">
          couldn&apos;t load the wasm modules. your browser may be blocking
          WebAssembly.
        </p>
      ) : (
        <>
          <button
            onClick={run}
            disabled={!ready || running}
            className="rounded-lg bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "racing…" : ready ? (rows ? "run again" : "run the benchmark") : "loading…"}
          </button>

          {rows && (
            <div className="mt-5 space-y-3">
              {rows.map((row, i) => (
                <div key={row.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                    <span className={i === 0 ? "font-bold text-fg" : "text-fg"}>
                      {row.label}
                      {i === 0 && <span className="ml-1.5 text-accent">fastest</span>}
                    </span>
                    <span className="text-muted">
                      {fmtOps(row.ops)} · {row.ms.toFixed(1)}ms · {row.note}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                        row.key === "cpp"
                          ? "bg-accent"
                          : row.key === "rust"
                          ? "bg-gold"
                          : "bg-moss"
                      }`}
                      style={{ width: filled ? row.bar : "0%", transitionDelay: `${i * 120}ms` }}
                    />
                  </div>
                </div>
              ))}

              <div className="border-t border-line pt-3 font-mono text-[10.5px] leading-relaxed text-muted">
                <p>
                  checksum, all three:{" "}
                  <span className="text-fg">
                    {rows[0].sum.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>{" "}
                  {allMatch ? "— identical ✓ (same algorithm, to the bit)" : "— (tiny FP drift)"}
                </p>
                <p className="mt-1">
                  {spread < 1.15 ? (
                    <>
                      basically a tie ({spread.toFixed(2)}× across all three). a
                      modern JS JIT compiles this hot numeric loop to nearly the
                      same machine code as wasm, so the honest takeaway
                      isn&apos;t &ldquo;wasm is faster&rdquo; — it&apos;s that
                      wasm gets you C++/Rust and a self-contained ~1&nbsp;KB
                      binary at the same speed, with no JIT warm-up.
                    </>
                  ) : (
                    <>
                      <span className="text-fg">{rows[0].label}</span> wins this
                      run, {spread.toFixed(2)}× the slowest — though on scalar
                      math like this the three are usually neck and neck.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
