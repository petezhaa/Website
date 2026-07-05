"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// canvas resolution (CSS scales it responsively; the math lives in fn coords)
const W = 840;
const H = 440; // part a: the ε–δ arena
const RW = 840;
const RH = 280; // part b: the riemann lab

// the demon's ε schedule — one round per entry, shrinking
const EPS = [0.75, 0.5, 0.3, 0.18, 0.1, 0.06, 0.035, 0.02];

// per-function plot windows [x0, x1, y0, y1], sized so L ± 0.75 stays visible
const VIEW: [number, number, number, number][] = [
  [-0.7, 1.7, -0.55, 3.0], // x²  (duel at a = 0.5)
  [-1.15, 1.15, -0.9, 1.05], // x·sin(1/x)
  [-1.15, 1.15, -0.85, 1.35], // |x|
  [-1.15, 1.15, -0.45, 1.45], // step
];

// the lab integrates [RA, RB] — deliberately asymmetric, so left/right sums
// keep their honest O(1/n) error even on the even functions
const RA = -0.5;
const RB = 1;
const RX0 = -0.62;
const RX1 = 1.12;
const RVIEW: [number, number][] = [
  [-0.3, 1.15],
  [-0.45, 1.0],
  [-0.2, 1.15],
  [-0.3, 1.3],
];

const FALLBACK_NAMES = ["x²", "x·sin(1/x)", "|x|", "step(x)"];
const TAGLINES = [
  "smooth, obedient — the warmup",
  "continuous at 0, but only just",
  "a corner is not a crime",
  "the trap: a jump lives at 0",
];
const RULES = ["left", "right", "midpoint"];

type Engine = {
  memory: WebAssembly.Memory;
  fn_count: () => number;
  fn_name: (i: number) => number;
  fn_eval: (fi: number, x: number) => number;
  game_a: (fi: number) => number;
  game_L: (fi: number) => number;
  sup_dev: (fi: number, a: number, L: number, delta: number) => number;
  riemann: (fi: number, a: number, b: number, n: number, rule: number) => number;
  exact: (fi: number, a: number, b: number) => number;
};

type Palette = {
  accent: string; gold: string; moss: string; muted: string;
  line: string; fg: string; surface: string;
};
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    accent: v("--accent", "#bf5b32"),
    gold: v("--gold", "#a98729"),
    moss: v("--moss", "#5f7350"),
    muted: v("--muted", "#6f6a5c"),
    line: v("--line", "#e4ddcb"),
    fg: v("--fg", "#26241e"),
    surface: v("--surface", "#fffdf7"),
  };
}

type Phase = "duel" | "won" | "trapped";
type SimState = { fi: number; delta: number; eps: number; phase: Phase; rule: number; n: number };

const fmt = (v: number) => {
  const s = v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// stroke y = f(x) column by column, lifting the pen across jumps
function strokeCurve(
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  fi: number,
  x0: number,
  x1: number,
  Y: (y: number) => number,
  w: number,
  color: string,
  lw: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  let pen = false;
  let py = 0;
  for (let px = 0; px <= w; px++) {
    const y = Y(eng.fn_eval(fi, x0 + (px / w) * (x1 - x0)));
    if (pen && Math.abs(y - py) > 150) pen = false; // a jump is not a line
    if (pen) ctx.lineTo(px, y);
    else { ctx.moveTo(px, y); pen = true; }
    py = y;
  }
  ctx.stroke();
}

export function AnalysisGame() {
  const gameRef = useRef<HTMLCanvasElement>(null);
  const labRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef(false);
  const paletteRef = useRef<Palette>({
    accent: "#bf5b32", gold: "#a98729", moss: "#5f7350", muted: "#6f6a5c",
    line: "#e4ddcb", fg: "#26241e", surface: "#fffdf7",
  });
  // the draw loop reads this ref; react state mirrors it for the chrome
  const sim = useRef<SimState>({ fi: 0, delta: 0.5, eps: 0, phase: "duel", rule: 0, n: 16 });

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<string[]>(FALLBACK_NAMES);
  const [fi, setFi] = useState(0);
  const [epsIdx, setEpsIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("duel");
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState("");
  const [rule, setRule] = useState(0);
  const [nR, setNR] = useState(16);
  const [lab, setLab] = useState({ sum: 0, ex: 0, err: 0 });

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  const draw = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const P = paletteRef.current;
    const S = sim.current;

    // ---- part a: the arena ----
    const gc = gameRef.current;
    const ctx = gc?.getContext("2d");
    if (gc && ctx) {
      const [x0, x1, y0, y1] = VIEW[S.fi];
      const X = (x: number) => ((x - x0) / (x1 - x0)) * W;
      const Y = (y: number) => H - ((y - y0) / (y1 - y0)) * H;
      const a = eng.game_a(S.fi);
      const L = eng.game_L(S.fi);
      const eps = EPS[S.eps];
      const d = S.delta;
      const sup = eng.sup_dev(S.fi, a, L, d);
      const pass = sup < eps;
      const winCol = pass ? P.moss : P.accent;

      ctx.clearRect(0, 0, W, H);

      // axes
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      line(ctx, 0, Y(0), W, Y(0));
      line(ctx, X(0), 0, X(0), H);

      // the demon's ε-band, horizontal around L
      ctx.fillStyle = P.gold;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, Y(L + eps), W, Y(L - eps) - Y(L + eps));
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = P.gold;
      line(ctx, 0, Y(L + eps), W, Y(L + eps));
      line(ctx, 0, Y(L - eps), W, Y(L - eps));
      ctx.globalAlpha = 1;
      ctx.setLineDash([4, 4]);
      line(ctx, 0, Y(L), W, Y(L));
      ctx.setLineDash([]);

      // your δ-window, vertical around a
      const wx0 = X(a - d);
      const wx1 = X(a + d);
      ctx.fillStyle = P.fg;
      ctx.globalAlpha = 0.05;
      ctx.fillRect(wx0, 0, wx1 - wx0, H);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = P.fg;
      ctx.lineWidth = 2;
      line(ctx, wx0, 0, wx0, H);
      line(ctx, wx1, 0, wx1, H);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = P.fg; // grab nubs
      ctx.fillRect(wx0 - 2.5, H / 2 - 14, 5, 28);
      ctx.fillRect(wx1 - 2.5, H / 2 - 14, 5, 28);
      ctx.globalAlpha = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = P.muted;
      ctx.lineWidth = 1;
      line(ctx, X(a), 0, X(a), H);
      ctx.setLineDash([]);

      // the curve: quiet outside the window, loud inside it
      strokeCurve(ctx, eng, S.fi, x0, x1, Y, W, P.muted, 1.5);
      ctx.save();
      ctx.beginPath();
      ctx.rect(wx0, 0, wx1 - wx0, H);
      ctx.clip();
      strokeCurve(ctx, eng, S.fi, x0, x1, Y, W, winCol, 3);
      ctx.restore();

      // the step's jump, drawn honestly: open on the floor, closed at f(0)=1
      if (S.fi === 3) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(0), Y(0), 4, 0, Math.PI * 2);
        ctx.fillStyle = P.surface;
        ctx.fill();
        ctx.strokeStyle = winCol;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(0), Y(1), 4, 0, Math.PI * 2);
        ctx.fillStyle = winCol;
        ctx.fill();
      }

      // the demon's eye: (a, L) itself is excluded — 0 < |x − a|
      ctx.beginPath();
      ctx.arc(X(a), Y(L), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = P.surface;
      ctx.fill();
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 2;
      ctx.stroke();

      // labels + live readout
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = P.gold;
      ctx.fillText("L ± ε", W - 52, Y(L + eps) - 6);
      ctx.fillStyle = P.muted;
      ctx.fillText("a", X(a) + 6, H - 10);
      ctx.fillText(`ε = ${fmt(eps)}   δ = ${d.toFixed(3)}`, 12, 22);
      ctx.fillStyle = winCol;
      ctx.fillText(
        pass
          ? `sup |f−L| = ${sup.toFixed(4)} < ε — the window holds`
          : `sup |f−L| = ${sup.toFixed(4)} ≥ ε — the curve escapes`,
        12, 40,
      );
    }

    // ---- part b: the lab ----
    const rc = labRef.current;
    const rctx = rc?.getContext("2d");
    if (rc && rctx) {
      const [ry0, ry1] = RVIEW[S.fi];
      const X = (x: number) => ((x - RX0) / (RX1 - RX0)) * RW;
      const Y = (y: number) => RH - ((y - ry0) / (ry1 - ry0)) * RH;
      rctx.clearRect(0, 0, RW, RH);

      rctx.strokeStyle = P.line;
      rctx.lineWidth = 1;
      line(rctx, 0, Y(0), RW, Y(0));
      line(rctx, X(RA), Y(0) - 4, X(RA), Y(0) + 4);
      line(rctx, X(RB), Y(0) - 4, X(RB), Y(0) + 4);

      const n = S.n;
      const h = (RB - RA) / n;
      const off = S.rule === 1 ? 1 : S.rule === 2 ? 0.5 : 0;
      for (let i = 0; i < n; i++) {
        const xs = RA + i * h;
        const xstar = xs + off * h;
        const y = eng.fn_eval(S.fi, xstar);
        const top = Y(Math.max(0, y));
        const hh = Math.abs(Y(y) - Y(0));
        const wpx = X(xs + h) - X(xs);
        rctx.fillStyle = P.moss;
        rctx.globalAlpha = 0.18;
        rctx.fillRect(X(xs), top, wpx, hh);
        rctx.globalAlpha = 1;
        if (wpx >= 3) {
          rctx.strokeStyle = P.moss;
          rctx.globalAlpha = 0.5;
          rctx.strokeRect(X(xs) + 0.5, top + 0.5, wpx - 1, Math.max(1, hh - 1));
          rctx.globalAlpha = 1;
        }
        if (n <= 40) {
          // show exactly which x* the rule sampled
          rctx.fillStyle = P.moss;
          rctx.beginPath();
          rctx.arc(X(xstar), Y(y), 2.5, 0, Math.PI * 2);
          rctx.fill();
        }
      }

      strokeCurve(rctx, eng, S.fi, RX0, RX1, Y, RW, P.fg, 2);
      if (S.fi === 3) {
        rctx.lineWidth = 2;
        rctx.beginPath();
        rctx.arc(X(0), Y(0), 3.5, 0, Math.PI * 2);
        rctx.fillStyle = P.surface;
        rctx.fill();
        rctx.strokeStyle = P.fg;
        rctx.stroke();
        rctx.beginPath();
        rctx.arc(X(0), Y(1), 3.5, 0, Math.PI * 2);
        rctx.fillStyle = P.fg;
        rctx.fill();
      }

      rctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      rctx.fillStyle = P.muted;
      rctx.fillText(`n = ${n} · ${RULES[S.rule]} rule · on [${fmt(RA)}, ${fmt(RB)}]`, 12, 20);
    }
  }, []);

  // load wasm + start the loop when the section is near
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/analysis.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        const nm: string[] = [];
        for (let i = 0; i < eng.fn_count(); i++) nm.push(readStr(eng.fn_name(i)));
        if (nm.length) setNames(nm);
        paletteRef.current = readPalette();
        setMsg(`round 1. the demon opens with ε = ${fmt(EPS[0])}. drag out the widest δ you can defend, then lock it in.`);
        setReady(true);
        const tick = () => {
          draw();
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const c = gameRef.current;
    if (c && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { io?.disconnect(); io = null; load(); }
      }, { rootMargin: "400px" });
      io.observe(c);
    } else load();

    const mo = new MutationObserver(() => { paletteRef.current = readPalette(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      io?.disconnect();
      mo.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw, readStr]);

  // the lab's numbers, recomputed when anything relevant moves
  useEffect(() => {
    const eng = engineRef.current;
    if (!ready || !eng) return;
    const sum = eng.riemann(fi, RA, RB, nR, rule);
    const ex = eng.exact(fi, RA, RB);
    setLab({ sum, ex, err: Math.abs(sum - ex) });
  }, [ready, fi, nR, rule]);

  // ---- interaction: dragging δ ----
  const clampDelta = (v: number) => {
    const eng = engineRef.current;
    const S = sim.current;
    if (!eng) return v;
    const [x0, x1] = VIEW[S.fi];
    const a = eng.game_a(S.fi);
    const maxD = Math.min(a - x0, x1 - a) - 0.03;
    return Math.min(maxD, Math.max(0.004, v));
  };

  const setDeltaFromPointer = (e: { clientX: number }) => {
    const gc = gameRef.current;
    const eng = engineRef.current;
    if (!gc || !eng) return;
    const S = sim.current;
    const [x0, x1] = VIEW[S.fi];
    const r = gc.getBoundingClientRect();
    const x = x0 + ((e.clientX - r.left) / r.width) * (x1 - x0);
    S.delta = clampDelta(Math.abs(x - eng.game_a(S.fi)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    gameRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = true;
    setDeltaFromPointer(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) setDeltaFromPointer(e);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = false;
    bumpVibe("curiosity", 2);
  };

  const nudge = (k: number) => {
    sim.current.delta = clampDelta(sim.current.delta * k);
    bumpVibe("curiosity", 1);
  };

  // ---- the duel itself ----
  const lockIn = () => {
    const eng = engineRef.current;
    const S = sim.current;
    if (!eng || S.phase !== "duel") return;
    const a = eng.game_a(S.fi);
    const L = eng.game_L(S.fi);
    const eps = EPS[S.eps];
    const sup = eng.sup_dev(S.fi, a, L, S.delta);

    if (sup < eps) {
      // score rewards audacity: the fattest δ that still survives
      const pts = Math.min(99, Math.max(1, Math.round((S.delta / eps) * 40)));
      setScore((s) => s + pts);
      if (S.eps + 1 >= EPS.length) {
        S.phase = "won";
        setPhase("won");
        setMsg(
          `out of ε. for every challenge you produced a δ — which is, verbatim, the definition. ` +
          `lim x→${fmt(a)} ${names[S.fi]} = ${fmt(L)}, certified. ∎ (+${pts})`,
        );
        bumpVibe("curiosity", 12);
        bumpVibe("gamer", 8);
      } else {
        S.eps += 1;
        setEpsIdx(S.eps);
        setMsg(`sup = ${sup.toFixed(4)} < ε. +${pts} for a fat δ. the ε demon shrinks to ${fmt(EPS[S.eps])}…`);
        bumpVibe("curiosity", 6);
      }
    } else if (eng.sup_dev(S.fi, a, L, 1e-4) >= eps) {
      // even a microscopic δ fails: no δ exists at all
      S.phase = "trapped";
      setPhase("trapped");
      setMsg(
        S.fi === 3
          ? `no δ exists. the jump has height 1, so every punctured window holds a point with |f−L| = 0.5 ≥ ε. ` +
            `once ε ≤ half the jump, the demon always wins: this limit does not exist. ` +
            `that is exactly what “discontinuous at 0” means. ∎`
          : `no δ — however microscopic — survives this ε. the claimed L is simply not the limit. the demon accepts your surrender.`,
      );
      bumpVibe("curiosity", 10);
    } else {
      setMsg(`sup = ${sup.toFixed(4)} ≥ ε — the curve slips out of the band. the demon cackles. tighten δ.`);
    }
  };

  const pickFn = (i: number) => {
    const S = sim.current;
    S.fi = i;
    S.eps = 0;
    S.phase = "duel";
    S.delta = 0.5;
    setFi(i);
    setEpsIdx(0);
    setPhase("duel");
    setMsg(`round 1. the demon opens with ε = ${fmt(EPS[0])}. drag out the widest δ you can defend, then lock it in.`);
    bumpVibe("curiosity", 3);
  };

  const setRuleBoth = (r: number) => {
    sim.current.rule = r;
    setRule(r);
    bumpVibe("curiosity", 2);
  };
  const setNBoth = (v: number) => {
    sim.current.n = v;
    setNR(v);
  };

  const btn = (active: boolean) =>
    `rounded-[2px] border px-3 py-1.5 font-mono text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  const errPct = lab.err <= 1e-9 ? 0 : Math.min(100, Math.max(2, ((Math.log10(lab.err) + 7) / 7) * 100));
  const eng = engineRef.current;

  return (
    <div className="flex flex-col gap-3">
      {/* part a: function picker + score */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">part a · the ε–δ duel</span>
        {names.map((nm, i) => (
          <button key={i} onClick={() => pickFn(i)} disabled={!ready} title={TAGLINES[i] ?? ""} className={btn(fi === i)}>
            {nm}
          </button>
        ))}
        <span className="ml-auto font-mono text-[11px] text-muted">
          score {score} · round {Math.min(epsIdx + 1, EPS.length)}/{EPS.length} · C++
        </span>
      </div>

      {ready && eng && (
        <p className="font-mono text-[11px] text-muted">
          claim: lim x→{fmt(eng.game_a(fi))} of {names[fi]} = {fmt(eng.game_L(fi))} —{" "}
          <span className="text-accent">the ε demon disputes it</span>
        </p>
      )}

      <div className="panel relative overflow-hidden">
        <canvas
          ref={gameRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="block h-auto w-full cursor-ew-resize touch-none select-none"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="font-mono text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">summoning the ε demon…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right font-mono text-[10px] leading-relaxed text-muted/70">
          drag horizontally to size your δ-window<br />
          gold band: the demon&apos;s ε · keep the trapped curve inside it
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={lockIn}
          disabled={!ready || phase !== "duel"}
          className="btn-solid px-3 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          lock in δ
        </button>
        <button onClick={() => nudge(0.9)} disabled={!ready || phase !== "duel"} className={btn(false)}>δ −</button>
        <button onClick={() => nudge(1 / 0.9)} disabled={!ready || phase !== "duel"} className={btn(false)}>δ +</button>
        <button onClick={() => pickFn(fi)} disabled={!ready} className={btn(false)}>restart</button>
        {phase !== "duel" && (
          <span className="font-mono text-[11px] text-muted">
            {phase === "won"
              ? "flawless. now try a nastier function."
              : "pick another function — this one is broken at a, and that was the point."}
          </span>
        )}
      </div>

      {msg && (
        <p className="panel px-4 py-2.5 font-mono text-[11px] leading-relaxed text-muted">
          <span className={phase === "trapped" ? "text-accent" : phase === "won" ? "text-moss" : "text-gold"}>ε demon</span>
          {" · "}
          {msg}
        </p>
      )}

      {/* part b: the riemann lab */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">part b · the riemann lab</span>
        {RULES.map((r, i) => (
          <button key={r} onClick={() => setRuleBoth(i)} disabled={!ready} className={btn(rule === i)}>
            {r}
          </button>
        ))}
        <input
          type="range"
          min={1}
          max={400}
          value={nR}
          onChange={(e) => setNBoth(Number(e.target.value))}
          onPointerUp={() => bumpVibe("curiosity", 2)}
          disabled={!ready}
          aria-label="number of rectangles"
          className="w-40 accent-accent"
        />
        <span className="font-mono text-[11px] text-muted">n = {nR}</span>
      </div>

      <div className="panel overflow-hidden">
        <canvas ref={labRef} width={RW} height={RH} className="block h-auto w-full select-none" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        <span>Σ f(xᵢ*)Δx = {lab.sum.toFixed(6)}</span>
        <span>∫ f dx = {lab.ex.toFixed(6)}</span>
        <span className="text-accent">|error| = {lab.err.toExponential(2)}</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-36 overflow-hidden rounded-full bg-line">
            <span className="block h-full bg-accent transition-all duration-300" style={{ width: `${errPct}%` }} />
          </span>
          <span className="text-muted/70">log error — watch midpoint fall off a cliff</span>
        </span>
      </div>

      <div className="panel p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the analysis, running in C++</p>
        <p>limit&nbsp;&nbsp;&nbsp;&nbsp;lim x→a f(x) = L&nbsp;&nbsp;⇔&nbsp;&nbsp;∀ε&gt;0 ∃δ&gt;0 : 0 &lt; |x−a| &lt; δ ⇒ |f(x)−L| &lt; ε</p>
        <p>the duel&nbsp;&nbsp;the demon calls ε, you answer δ. C++ checks sup{"{"}|f(x)−L| : 0&lt;|x−a|&lt;δ{"}"} over ~4000 samples — you win iff sup &lt; ε.</p>
        <p>integral&nbsp;&nbsp;∫ₐᵇ f dx = lim Σᵢ f(xᵢ*)·Δx, Δx = (b−a)/n&nbsp;&nbsp;(left | right | midpoint choose xᵢ*)</p>
        <p>error: left/right ∝ 1/n, midpoint ∝ 1/n² — for smooth f. the step revokes midpoint&apos;s superpower; x·sin(1/x) bends the rules. discontinuity isn&apos;t a vibe — it&apos;s a failed ∀∃.</p>
      </div>
    </div>
  );
}
