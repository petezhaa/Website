"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// canvas is a fixed logical size; CSS scales it to the container
const W = 900;
const H = 360;
const GAIN = H * 0.27; // pixels per field unit
const VCLIP = 1.7;     // plotted field clamp so curves never leave the frame

type Engine = {
  memory: WebAssembly.Memory;
  reset: (mode: number, lambda: number, epsR: number) => void;
  step: () => void;
  set_mode: (m: number) => void;
  set_freq: (lambda: number) => void;
  set_eps: (epsR: number) => void;
  poke: (cell: number, amp: number) => void;
  ez_ptr: () => number;
  hy_ptr: () => number;
  n_cells: () => number;
  slab_start: () => number;
  slab_end: () => number;
  src_pos: () => number;
};

type Palette = { accent: string; gold: string; moss: string; muted: string; line: string; fg: string };
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
  };
}

export function WaveSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ezRef = useRef<Float64Array | null>(null);
  const hyRef = useRef<Float64Array | null>(null);
  const metaRef = useRef({ n: 600, a: 320, b: 440, src: 50 });
  const rafRef = useRef(0);
  const paletteRef = useRef<Palette>({ accent: "#bf5b32", gold: "#a98729", moss: "#5f7350", muted: "#777", line: "#ccc", fg: "#222" });
  const pokingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [mode, setMode] = useState<"pulse" | "cw">("pulse");
  const modeRef = useRef<"pulse" | "cw">("pulse");
  const [lambda, setLambda] = useState(60);
  const lambdaRef = useRef(60);
  const [epsR, setEpsR] = useState(2.5);
  const epsRef = useRef(2.5);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const ez = ezRef.current;
    const hy = hyRef.current;
    if (!c || !ctx || !ez || !hy) return;
    const P = paletteRef.current;
    const { n, a, b, src } = metaRef.current;
    const mid = H * 0.5;
    const xOf = (i: number) => (i / (n - 1)) * W;
    const yOf = (v: number) => mid - Math.max(-VCLIP, Math.min(VCLIP, v)) * GAIN;

    ctx.clearRect(0, 0, W, H);

    // the dielectric slab: a shaded band of denser-than-vacuum
    const x0 = xOf(a), x1 = xOf(b);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = P.moss;
    ctx.fillRect(x0, 0, x1 - x0, H);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = P.moss;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, 0); ctx.lineTo(x0, H);
    ctx.moveTo(x1, 0); ctx.lineTo(x1, H);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const er = epsRef.current;
    ctx.fillStyle = P.muted;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`εr = ${er.toFixed(1)} · n = ${Math.sqrt(er).toFixed(2)}`, (x0 + x1) / 2, 18);

    // baseline
    ctx.strokeStyle = P.line;
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(W, mid);
    ctx.stroke();

    // source marker
    const xs = xOf(src);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = P.accent;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(xs, 0); ctx.lineTo(xs, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = P.muted;
    ctx.textAlign = "left";
    ctx.fillText("src", xs + 5, H - 8);
    ctx.globalAlpha = 1;

    // Hy: the magnetic half, a fainter gold line (staggered half a cell right)
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 0; i < n - 1; i++) {
      const x = xOf(i + 0.5), y = yOf(hy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Ez: the electric half, a filled accent curve
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(i), yOf(ez[i]));
    ctx.lineTo(W, mid);
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = P.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOf(i), y = yOf(ez[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);

  // load wasm + start the loop when the section is near
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/waves.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        const n = eng.n_cells();
        metaRef.current = { n, a: eng.slab_start(), b: eng.slab_end(), src: eng.src_pos() };
        // static buffers, no malloc: the memory never grows, so views are stable
        ezRef.current = new Float64Array(eng.memory.buffer, eng.ez_ptr(), n);
        hyRef.current = new Float64Array(eng.memory.buffer, eng.hy_ptr(), n);
        eng.reset(modeRef.current === "cw" ? 1 : 0, lambdaRef.current, epsRef.current);
        paletteRef.current = readPalette();
        setReady(true);
        const tick = () => {
          if (!pausedRef.current) eng.step();
          draw();
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const c = canvasRef.current;
    if (c && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { io?.disconnect(); io = null; load(); }
      }, { rootMargin: "400px" });
      io.observe(c);
    } else load();

    const onTheme = () => { paletteRef.current = readPalette(); };
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      io?.disconnect();
      mo.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ---- interaction ----
  const pokeAt = (e: { clientX: number }, amp: number) => {
    const eng = engineRef.current;
    const c = canvasRef.current;
    if (!eng || !c) return;
    const r = c.getBoundingClientRect();
    const cell = Math.round(((e.clientX - r.left) / r.width) * metaRef.current.n);
    eng.poke(cell, amp);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    pokingRef.current = true;
    pokeAt(e, 0.9);
    bumpVibe("curiosity", 5);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pokingRef.current) pokeAt(e, 0.15);
  };
  const endPoke = () => { pokingRef.current = false; };

  const pickMode = (m: "pulse" | "cw") => {
    modeRef.current = m;
    setMode(m);
    engineRef.current?.set_mode(m === "cw" ? 1 : 0); // picking pulse again re-fires
    bumpVibe("curiosity", 5);
  };
  const onLambda = (v: number) => {
    lambdaRef.current = v;
    setLambda(v);
    engineRef.current?.set_freq(v); // live retune, phase stays continuous in C++
  };
  const onEps = (v: number) => {
    epsRef.current = v;
    setEpsR(v);
    engineRef.current?.set_eps(v); // swap the glass under a wave mid-flight
  };
  const resetAll = () => {
    engineRef.current?.reset(modeRef.current === "cw" ? 1 : 0, lambdaRef.current, epsRef.current);
    bumpVibe("curiosity", 3);
  };
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };

  const btn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  // live Fresnel numbers for the panel (n1 = 1 vacuum, n2 = slab)
  const nIdx = Math.sqrt(epsR);
  const rF = (1 - nIdx) / (1 + nIdx);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => pickMode("pulse")} className={btn(mode === "pulse")}>pulse</button>
        <button onClick={() => pickMode("cw")} className={btn(mode === "cw")}>cw</button>
        <button onClick={togglePause} className={btn(false)}>{paused ? "play" : "pause"}</button>
        <button onClick={resetAll} className={btn(false)}>reset</button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          λ
          <input
            type="range" min={24} max={140} step={2} value={lambda}
            onChange={(e) => onLambda(Number(e.target.value))}
            onPointerUp={() => bumpVibe("curiosity", 3)}
            className="w-24 sm:w-28"
            style={{ accentColor: "var(--accent)" }}
            aria-label="wavelength in cells"
          />
          {lambda}
        </label>
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          εᵣ
          <input
            type="range" min={1} max={8} step={0.1} value={epsR}
            onChange={(e) => onEps(Number(e.target.value))}
            onPointerUp={() => bumpVibe("curiosity", 3)}
            className="w-24 sm:w-28"
            style={{ accentColor: "var(--accent)" }}
            aria-label="slab relative permittivity"
          />
          {epsR.toFixed(1)}
        </label>
        <span className="font-mono text-[11px] text-muted">{metaRef.current.n} cells · C++</span>
      </div>

      <div className="panel relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPoke}
          onPointerCancel={endPoke}
          className="block h-auto w-full cursor-crosshair touch-none select-none"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse text-sm text-muted">discretizing maxwell…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right text-[10px] leading-relaxed text-muted/70">
          tap the field to pluck it · click pulse again to re-fire<br />
          filled curve: Ez · gold: Hy · shaded band: the slab
        </p>
      </div>

      <div className="panel p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the physics, running in C++</p>
        <p>faraday&nbsp;&nbsp;∂Hy/∂t = −(1/μ)·∂Ez/∂x&nbsp;&nbsp;(the gold line)</p>
        <p>ampère&nbsp;&nbsp;&nbsp;∂Ez/∂t = −(1/ε)·∂Hy/∂x&nbsp;&nbsp;(the filled wave)</p>
        <p>speed&nbsp;&nbsp;&nbsp;&nbsp;c = 1/√(με), inside the slab light drops to c/n, n = √εᵣ = {nIdx.toFixed(2)}</p>
        <p>fresnel&nbsp;&nbsp;r = (n₁−n₂)/(n₁+n₂) = {rF.toFixed(2)} → {(rF * rF * 100).toFixed(0)}% of the power bounces off each face</p>
        <p>leapfrogged on a staggered Yee grid at Courant 0.5; both ends are Mur absorbers, so the box pretends to be infinite.</p>
      </div>
    </div>
  );
}
