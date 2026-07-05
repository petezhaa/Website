"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

const W = 760;
const H = 520;
const SW = 760; // spectrum panel canvas
const SH = 132;
const TWO_PI = Math.PI * 2;
const SAMPLES = 220; // points the drawing is resampled to before the DFT
const DEFAULT_CIRCLES = 40; // low enough that cranking it up feels like a reveal

type Engine = {
  add_point: (x: number, y: number) => void;
  clear_pts: () => void;
  compute: () => void;
  n_terms: () => number;
  term_freq: (i: number) => number;
  term_amp: (i: number) => number;
  term_phase: (i: number) => number;
  recon_err: (n: number) => number;
};
type Term = { f: number; a: number; ph: number; rank: number }; // rank 0 = biggest |c_k|

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    accent: v("--accent", "#bf5b32"),
    muted: v("--muted", "#6f6a5c"),
    line: v("--line", "#e4ddcb"),
    fg: v("--fg", "#26241e"),
  };
}

// resample a raw polyline to n evenly-spaced points (by arc length)
function resample(raw: [number, number][], n: number): [number, number][] {
  if (raw.length < 2) return raw;
  const seg: number[] = [0];
  let total = 0;
  for (let i = 1; i < raw.length; i++) {
    total += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    seg.push(total);
  }
  if (total === 0) return raw;
  const out: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * total;
    while (j < seg.length - 1 && seg[j + 1] < d) j++;
    const t = (d - seg[j]) / Math.max(seg[j + 1] - seg[j], 1e-9);
    const a = raw[j], b = raw[Math.min(j + 1, raw.length - 1)];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

// a default drawing so the toy animates on arrival — a heart curve
function heartPoints(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * TWO_PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([x * 9, y * 9]);
  }
  return pts;
}

// closed polygons, resampled to SAMPLES evenly spaced points
function polygonPoints(verts: [number, number][]): [number, number][] {
  return resample([...verts, verts[0]], SAMPLES);
}
// sharp corners are wideband: the square is the best argument for more circles
function squarePoints(): [number, number][] {
  const s = 165;
  return polygonPoints([[-s, -s], [s, -s], [s, s], [-s, s]]);
}
function starPoints(): [number, number][] {
  const verts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 205 : 82;
    const a = -Math.PI / 2 + (i / 10) * TWO_PI;
    verts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygonPoints(verts);
}

const PRESETS: Record<string, () => [number, number][]> = {
  heart: heartPoints,
  square: squarePoints,
  star: starPoints,
};

export function EpicycleDrawer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const termsRef = useRef<Term[]>([]); // sorted by |c_k|, biggest first
  const spectrumRef = useRef<Term[]>([]); // same terms, sorted by signed frequency
  const maxAmpRef = useRef(1);
  const inputRef = useRef<[number, number][]>([]); // the resampled target shape
  const traceRef = useRef<[number, number][]>([]);
  const tRef = useRef(0);
  const rafRef = useRef(0);
  const drawingRef = useRef<[number, number][] | null>(null); // raw points while drawing
  const nTermsRef = useRef(DEFAULT_CIRCLES);
  const speedRef = useRef(1);
  const paletteRef = useRef({ accent: "#bf5b32", muted: "#6f6a5c", line: "#e4ddcb", fg: "#26241e" });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [shape, setShape] = useState("heart");
  const [nTerms, setNTerms] = useState(DEFAULT_CIRCLES);
  const [termCount, setTermCount] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [err, setErr] = useState<number | null>(null);

  const loadShape = useCallback((pts: [number, number][], name: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.clear_pts();
    for (const [x, y] of pts) eng.add_point(x, y);
    eng.compute();
    const terms: Term[] = [];
    const n = eng.n_terms();
    for (let i = 0; i < n; i++) {
      terms.push({ f: eng.term_freq(i), a: eng.term_amp(i), ph: eng.term_phase(i), rank: i });
    }
    termsRef.current = terms;
    spectrumRef.current = [...terms].sort((a, b) => a.f - b.f);
    maxAmpRef.current = terms.length ? terms[0].a || 1 : 1;
    inputRef.current = pts;
    traceRef.current = [];
    tRef.current = 0;
    // keep the visitor's slider setting, clamped to what this shape has
    const nUse = Math.min(Math.max(2, nTermsRef.current), Math.max(2, terms.length));
    nTermsRef.current = nUse;
    setNTerms(nUse);
    setTermCount(terms.length);
    setErr(typeof eng.recon_err === "function" && terms.length ? eng.recon_err(nUse) : null);
    setShape(name);
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const P = paletteRef.current;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);

    // while the user is drawing, just show their raw stroke
    if (drawingRef.current) {
      const raw = drawingRef.current;
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      raw.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
      return;
    }

    // faint ghost of the target shape, so truncation loss is visible against it
    const input = inputRef.current;
    if (input.length > 1) {
      ctx.strokeStyle = P.muted;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      input.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const terms = termsRef.current;
    const nUse = Math.min(nTermsRef.current, terms.length);
    const t = tRef.current;
    // walk the epicycle chain — only the top-N largest terms
    let x = 0, y = 0;
    ctx.lineWidth = 1;
    for (let i = 0; i < nUse; i++) {
      const { f, a, ph } = terms[i];
      const ang = TWO_PI * f * t + ph;
      const nx = x + a * Math.cos(ang);
      const ny = y + a * Math.sin(ang);
      if (a > 0.6) {
        ctx.strokeStyle = P.line;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, a, 0, TWO_PI);
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = P.muted;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
      x = nx;
      y = ny;
    }
    ctx.globalAlpha = 1;

    // the tip traces the reconstructed drawing
    const trace = traceRef.current;
    trace.push([x, y]);
    // keep the comet the same fraction of the loop at any speed
    const cap = Math.min(1200, Math.max(48, Math.round((SAMPLES + 4) / speedRef.current)));
    while (trace.length > cap) trace.shift();
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    trace.forEach(([tx, ty], i) => (i ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty)));
    ctx.stroke();
    // the pen
    ctx.fillStyle = P.accent;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TWO_PI);
    ctx.fill();

    ctx.restore();
  }, []);

  // |c_k| bars ordered by signed frequency: negative freqs left, DC center.
  // terms in the top-N budget glow accent; the ones we cut sit in line color.
  const drawSpectrum = useCallback(() => {
    const c = specRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const P = paletteRef.current;
    ctx.clearRect(0, 0, SW, SH);
    const spec = spectrumRef.current;
    if (!spec.length) return;
    const mL = 10, mR = 10, mT = 14, mB = 22;
    const plotW = SW - mL - mR;
    const plotH = SH - mT - mB;
    const maxA = maxAmpRef.current;
    const bw = plotW / spec.length;
    const nUse = Math.min(nTermsRef.current, spec.length);
    for (let i = 0; i < spec.length; i++) {
      const s = spec[i];
      const h = Math.max(1.5, plotH * Math.sqrt(Math.min(1, s.a / maxA)));
      const used = s.rank < nUse;
      ctx.fillStyle = used ? P.accent : P.line;
      ctx.fillRect(mL + i * bw + 0.5, mT + plotH - h, Math.max(1, bw - 1.2), h);
    }
    // baseline
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mL, mT + plotH + 0.5);
    ctx.lineTo(SW - mR, mT + plotH + 0.5);
    ctx.stroke();
    // labels
    ctx.fillStyle = P.muted;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillText("−f", mL, SH - 8);
    ctx.fillText("|c_k| · √ scale", mL, mT - 4);
    ctx.textAlign = "right";
    ctx.fillText("+f", SW - mR, SH - 8);
    const dc = spec.findIndex((s) => s.f === 0);
    if (dc >= 0) {
      ctx.textAlign = "center";
      ctx.fillText("DC", mL + (dc + 0.5) * bw, SH - 8);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const start = async () => {
      try {
        const buf = await fetch("/epicycles.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        engineRef.current = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        paletteRef.current = readPalette();
        loadShape(heartPoints(), "heart");
        setReady(true);
        const loop = () => {
          if (!drawingRef.current && termsRef.current.length) {
            tRef.current += speedRef.current / (SAMPLES * 1.4); // ~1.4s per trace at 1x
            if (tRef.current >= 1) { tRef.current = 0; traceRef.current = []; }
          }
          draw();
          drawSpectrum();
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const c = canvasRef.current;
    if (c && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io?.disconnect(); io = null; start(); } }, { rootMargin: "400px" });
      io.observe(c);
    } else start();
    const onTheme = () => { paletteRef.current = readPalette(); };
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { cancelled = true; io?.disconnect(); mo.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [draw, drawSpectrum, loadShape]);

  const toCentered = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W - W / 2, ((e.clientY - r.top) / r.height) * H - H / 2];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = [toCentered(e)];
    setDrawing(true);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current.push(toCentered(e));
  };
  const onUp = () => {
    const raw = drawingRef.current;
    drawingRef.current = null;
    setDrawing(false);
    if (raw && raw.length > 8) {
      loadShape(resample(raw, SAMPLES), "yours");
      bumpVibe("curiosity", 16);
    }
  };

  const loadPreset = (name: string) => {
    loadShape(PRESETS[name](), name);
    bumpVibe("curiosity", 8);
  };

  const onCircles = (v: number) => {
    nTermsRef.current = v;
    setNTerms(v);
    traceRef.current = []; // the tip jumps; don't leave a scar
    const eng = engineRef.current;
    if (eng && typeof eng.recon_err === "function" && termsRef.current.length) setErr(eng.recon_err(v));
  };
  const onSpeed = (v: number) => {
    speedRef.current = v;
    setSpeed(v);
  };

  const btn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => loadPreset("heart")} className={btn(shape === "heart")}>heart</button>
        <button onClick={() => loadPreset("square")} className={btn(shape === "square")}>square</button>
        <button onClick={() => loadPreset("star")} className={btn(shape === "star")}>star</button>
        <span className="font-mono text-[11px] text-muted">
          {ready ? `${shape === "yours" ? "your drawing" : shape} · ${termCount} harmonics · C++ DFT` : "loading…"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          circles: <span className="w-7 text-right tabular-nums text-accent">{nTerms}</span>
          <input
            type="range"
            min={2}
            max={Math.max(2, termCount)}
            step={1}
            value={nTerms}
            disabled={!ready}
            onChange={(e) => onCircles(Number(e.target.value))}
            onPointerUp={() => bumpVibe("curiosity", 5)}
            className="w-40 accent-accent"
            aria-label="number of epicycles"
          />
        </label>
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          speed: <span className="w-10 text-right tabular-nums text-accent">{speed.toFixed(2)}x</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={speed}
            disabled={!ready}
            onChange={(e) => onSpeed(Number(e.target.value))}
            onPointerUp={() => bumpVibe("curiosity", 3)}
            className="w-32 accent-accent"
            aria-label="trace speed"
          />
        </label>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="block h-auto w-full cursor-crosshair touch-none select-none"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="font-mono text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">transforming…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right font-mono text-[10px] leading-relaxed text-muted/70">
          {drawing ? "release to transform" : "draw a shape — the vectors will retrace it"}<br />
          {drawing ? "" : "dashed ghost: your original · fewer circles, blurrier trace"}
        </p>
      </div>
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 font-mono text-[11px] text-muted">
          <span className="uppercase tracking-[0.2em] text-accent">spectrum</span>
          <span>
            using {nTerms}/{termCount || "—"} terms · err ≈ {err == null ? "—" : err.toFixed(1)} px
          </span>
        </div>
        <canvas ref={specRef} width={SW} height={SH} className="block h-auto w-full" aria-label="harmonic spectrum" />
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the signal, running in C++</p>
        <p>each point is a complex number z = x + iy.</p>
        <p>analysis&nbsp;&nbsp;c_k = (1/N) Σⱼ zⱼ · e^(−i·2π·k·j/N)&nbsp;&nbsp;(the DFT, in C++)</p>
        <p>synthesis z(t) = Σₖ c_k · e^(+i·2π·f_k·t)&nbsp;&nbsp;(the spinning vectors, biggest first)</p>
        <p>truncation: keep the N biggest coefficients and you keep the shape — that is compression.</p>
        <p>err is the mean gap between your points and the top-N partial sum. sharp corners cost harmonics — try the square.</p>
      </div>
    </div>
  );
}
