"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// field space is [0, XMAX] x [0, 1]; the canvas is that, scaled by H
const XMAX = 1.6;
const H = 520;
const W = Math.round(XMAX * H); // 832

// preset charge arrangements (field coords: x in [0,XMAX], y in [0,1])
const PRESETS: Record<string, [number, number, number][]> = {
  dipole: [[0.6, 0.5, 1], [1.0, 0.5, -1]],
  capacitor: [
    [0.5, 0.24, 1], [0.5, 0.41, 1], [0.5, 0.59, 1], [0.5, 0.76, 1],
    [1.1, 0.24, -1], [1.1, 0.41, -1], [1.1, 0.59, -1], [1.1, 0.76, -1],
  ],
  quadrupole: [
    [0.62, 0.36, 1], [0.98, 0.36, -1], [0.62, 0.64, -1], [0.98, 0.64, 1],
  ],
};

type Engine = {
  memory: WebAssembly.Memory;
  add_charge: (x: number, y: number, q: number) => void;
  clear_all: () => void;
  count: () => number;
  cx: (i: number) => number;
  cy: (i: number) => number;
  cq: (i: number) => number;
  pin: (i: number, x: number, y: number) => void;
  unpin: (i: number, vx: number, vy: number) => void;
  step: () => void;
  field_x: (x: number, y: number) => number;
  field_y: (x: number, y: number) => number;
  potential: (x: number, y: number) => number;
  gauss_flux: (x: number, y: number, r: number) => number;
  gauss_pred: (x: number, y: number, r: number) => number;
  q_enclosed: (x: number, y: number, r: number) => number;
  demo: () => void;
};

type Palette = { pos: string; neg: string; muted: string; line: string; fg: string };
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    pos: v("--accent", "#bf5b32"),
    neg: "#5f83ad", // steely blue reads as "negative" in both themes
    muted: v("--muted", "#6f6a5c"),
    line: v("--line", "#e4ddcb"),
    fg: v("--fg", "#26241e"),
  };
}

export function ChargeSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const paletteRef = useRef<Palette>({ pos: "#bf5b32", neg: "#5f83ad", muted: "#777", line: "#ccc", fg: "#222" });
  const brushRef = useRef(1); // +1 or -1: what a click on empty space adds
  const dragRef = useRef<{ i: number; lx: number; ly: number; vx: number; vy: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [brush, setBrush] = useState(1);
  const [n, setN] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  // overlays: field-line streamlines, equipotential contours, a Gauss surface
  const [show, setShow] = useState({ lines: false, equi: false, gauss: false });
  const showRef = useRef(show);
  const gaussRef = useRef({ x: 0.8, y: 0.5, r: 0.22 });
  const gaussDragRef = useRef(false);
  const gaussTickRef = useRef(0);
  const [gaussInfo, setGaussInfo] = useState<{ flux: number; pred: number; qin: number } | null>(null);

  const toggleOverlay = (k: "lines" | "equi" | "gauss") =>
    setShow((s) => {
      const next = { ...s, [k]: !s[k] };
      showRef.current = next;
      if (k === "gauss" && !next.gauss) setGaussInfo(null);
      return next;
    });

  const toField = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * XMAX;
    const fy = (e.clientY - r.top) / r.height;
    return [fx, fy];
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    const sx = (fx: number) => fx * H;
    const sy = (fy: number) => fy * H;

    ctx.clearRect(0, 0, W, H);

    // scalar-potential heatmap V(x,y): warm where positive, cool where negative.
    // the sampled grid is kept so the equipotential contours can reuse it.
    const CW = 48, CH = 30;
    const cellW = W / CW, cellH = H / CH;
    const vGrid = new Float64Array(CW * CH);
    for (let ix = 0; ix < CW; ix++) {
      for (let iy = 0; iy < CH; iy++) {
        const fx = ((ix + 0.5) / CW) * XMAX;
        const fy = (iy + 0.5) / CH;
        const v = eng.potential(fx, fy);
        vGrid[iy * CW + ix] = v;
        const a = Math.min(0.5, Math.abs(v) * 3.2);
        if (a < 0.02) continue;
        ctx.fillStyle = v > 0 ? P.pos : P.neg;
        ctx.globalAlpha = a;
        ctx.fillRect(ix * cellW, iy * cellH, cellW + 1, cellH + 1);
      }
    }
    ctx.globalAlpha = 1;

    // equipotential contours: marching squares over the sampled V grid
    if (showRef.current.equi) {
      ctx.strokeStyle = P.fg;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      const cxOf = (ix: number) => (ix + 0.5) * cellW;
      const cyOf = (iy: number) => (iy + 0.5) * cellH;
      for (const level of [-0.09, -0.04, -0.015, 0.015, 0.04, 0.09]) {
        ctx.beginPath();
        for (let iy = 0; iy < CH - 1; iy++) {
          for (let ix = 0; ix < CW - 1; ix++) {
            const v00 = vGrid[iy * CW + ix] - level;
            const v10 = vGrid[iy * CW + ix + 1] - level;
            const v01 = vGrid[(iy + 1) * CW + ix] - level;
            const v11 = vGrid[(iy + 1) * CW + ix + 1] - level;
            // interpolated crossing points on each edge that changes sign
            const pts: [number, number][] = [];
            if (v00 * v10 < 0) pts.push([cxOf(ix) + (v00 / (v00 - v10)) * cellW, cyOf(iy)]);
            if (v01 * v11 < 0) pts.push([cxOf(ix) + (v01 / (v01 - v11)) * cellW, cyOf(iy + 1)]);
            if (v00 * v01 < 0) pts.push([cxOf(ix), cyOf(iy) + (v00 / (v00 - v01)) * cellH]);
            if (v10 * v11 < 0) pts.push([cxOf(ix + 1), cyOf(iy) + (v10 / (v10 - v11)) * cellH]);
            if (pts.length >= 2) {
              ctx.moveTo(pts[0][0], pts[0][1]);
              ctx.lineTo(pts[1][0], pts[1][1]);
            }
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // field-line streamlines: seed rings around + charges, integrate along Ê
    // (or from − charges against Ê when there are no + ones)
    if (showRef.current.lines) {
      const cnt0 = eng.count();
      const plus: number[] = [], minus: number[] = [];
      for (let i = 0; i < cnt0; i++) (eng.cq(i) > 0 ? plus : minus).push(i);
      const seedsFrom = plus.length ? plus : minus;
      const sign = plus.length ? 1 : -1;
      ctx.strokeStyle = P.fg;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      const SEEDS = 10;
      for (const ci of seedsFrom.slice(0, 8)) {
        const cx0 = eng.cx(ci), cy0 = eng.cy(ci);
        for (let s = 0; s < SEEDS; s++) {
          const a0 = (s / SEEDS) * Math.PI * 2;
          let fx = cx0 + 0.035 * Math.cos(a0);
          let fy = cy0 + 0.035 * Math.sin(a0);
          ctx.beginPath();
          ctx.moveTo(fx * H, fy * H);
          for (let st = 0; st < 170; st++) {
            // RK2 midpoint along the (signed) field direction
            let ex = sign * eng.field_x(fx, fy), ey = sign * eng.field_y(fx, fy);
            let m = Math.hypot(ex, ey);
            if (m < 1e-6) break;
            const mx = fx + (ex / m) * 0.006, my = fy + (ey / m) * 0.006;
            ex = sign * eng.field_x(mx, my); ey = sign * eng.field_y(mx, my);
            m = Math.hypot(ex, ey);
            if (m < 1e-6) break;
            fx += (ex / m) * 0.012;
            fy += (ey / m) * 0.012;
            if (fx < -0.03 || fx > XMAX + 0.03 || fy < -0.03 || fy > 1.03) break;
            ctx.lineTo(fx * H, fy * H);
            // stop at an opposite charge
            let hit = false;
            for (const mi of (sign > 0 ? minus : plus)) {
              const dx = fx - eng.cx(mi), dy = fy - eng.cy(mi);
              if (dx * dx + dy * dy < 0.0016) { hit = true; break; }
            }
            if (hit) break;
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // the Gauss surface: a draggable circle whose flux is measured live in C++
    if (showRef.current.gauss) {
      const gz = gaussRef.current;
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = "#c9a545";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gz.x * H, gz.y * H, gz.r * H, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // little normal arrows showing E·n̂ around the loop
      for (let s = 0; s < 16; s++) {
        const a = (s / 16) * Math.PI * 2;
        const nx = Math.cos(a), ny = Math.sin(a);
        const fx = gz.x + gz.r * nx, fy = gz.y + gz.r * ny;
        const dot = eng.field_x(fx, fy) * nx + eng.field_y(fx, fy) * ny;
        const len = Math.max(-16, Math.min(16, dot * 900));
        ctx.strokeStyle = dot >= 0 ? P.pos : P.neg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx * H, fy * H);
        ctx.lineTo(fx * H + nx * len, fy * H + ny * len);
        ctx.stroke();
      }
      // throttled readout so React state isn't hammered at 60fps
      if (++gaussTickRef.current % 12 === 0) {
        const info = {
          flux: eng.gauss_flux(gz.x, gz.y, gz.r),
          pred: eng.gauss_pred(gz.x, gz.y, gz.r),
          qin: eng.q_enclosed(gz.x, gz.y, gz.r),
        };
        setGaussInfo(info);
        // verifying Gauss's law on a nonzero enclosed charge counts as a find
        if (info.qin !== 0 && Math.abs(info.flux - info.pred) < 0.004) {
          foundSecret("gauss-verified");
        }
      }
    }

    // E-field vectors on a coarser grid (E = -grad V)
    const VW = 26, VH = 16;
    ctx.strokeStyle = P.fg;
    ctx.lineWidth = 1;
    for (let ix = 0; ix < VW; ix++) {
      for (let iy = 0; iy < VH; iy++) {
        const fx = ((ix + 0.5) / VW) * XMAX;
        const fy = (iy + 0.5) / VH;
        const ex = eng.field_x(fx, fy);
        const ey = eng.field_y(fx, fy);
        const mag = Math.hypot(ex, ey);
        if (mag < 1e-4) continue;
        const len = 9;
        const ux = (ex / mag) * len, uy = (ey / mag) * len;
        const px = sx(fx), py = sy(fy);
        ctx.globalAlpha = Math.min(0.5, mag * 6);
        ctx.beginPath();
        ctx.moveTo(px - ux / 2, py - uy / 2);
        ctx.lineTo(px + ux / 2, py + uy / 2);
        ctx.stroke();
        // arrowhead
        ctx.beginPath();
        ctx.arc(px + ux / 2, py + uy / 2, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // charges: glowing discs, red +, blue -, with a +/- glyph
    const cnt = eng.count();
    for (let i = 0; i < cnt; i++) {
      const x = sx(eng.cx(i)), y = sy(eng.cy(i)), q = eng.cq(i);
      const col = q > 0 ? P.pos : P.neg;
      const r = 11;
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (q > 0) {
        ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
      } else {
        ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      }
      ctx.stroke();
    }
  }, []);

  // load wasm + start the loop when the section is near
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/charges.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        eng.demo();
        setN(eng.count());
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
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    if (!eng) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const [fx, fy] = toField(e);
    // grab the nearest charge if the click is close enough, else drop a new one
    let best = -1, bestD = 0.05 * 0.05; // ~ pointer radius in field units
    for (let i = 0; i < eng.count(); i++) {
      const dx = eng.cx(i) - fx, dy = eng.cy(i) - fy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      eng.pin(best, fx, fy);
      dragRef.current = { i: best, lx: fx, ly: fy, vx: 0, vy: 0 };
    } else if (
      showRef.current.gauss &&
      Math.hypot(fx - gaussRef.current.x, fy - gaussRef.current.y) < gaussRef.current.r + 0.03
    ) {
      gaussDragRef.current = true; // move the Gauss surface, not a charge
    } else if (eng.count() < 96) {
      eng.add_charge(fx, fy, brushRef.current);
      setN(eng.count());
      bumpVibe("curiosity", 10);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    if (!eng) return;
    const [fx, fy] = toField(e);
    if (gaussDragRef.current) {
      gaussRef.current.x = Math.min(XMAX, Math.max(0, fx));
      gaussRef.current.y = Math.min(1, Math.max(0, fy));
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    d.vx = fx - d.lx; d.vy = fy - d.ly;
    d.lx = fx; d.ly = fy;
    eng.pin(d.i, fx, fy);
  };
  const endDrag = () => {
    const eng = engineRef.current;
    const d = dragRef.current;
    if (eng && d) eng.unpin(d.i, d.vx, d.vy); // release with a fling
    dragRef.current = null;
    gaussDragRef.current = false;
  };

  const pick = (q: number) => { brushRef.current = q; setBrush(q); };
  const seed = (name: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    // rebuilding the charge array invalidates any in-flight drag: the stale
    // index would pin whichever new charge inherits that slot
    dragRef.current = null;
    gaussDragRef.current = false;
    eng.clear_all();
    if (name === "random") {
      for (let i = 0; i < 12; i++)
        eng.add_charge(0.2 + Math.random() * 1.2, 0.15 + Math.random() * 0.7, Math.random() < 0.5 ? 1 : -1);
    } else {
      for (const [x, y, q] of PRESETS[name]) eng.add_charge(x, y, q);
    }
    setN(eng.count());
    bumpVibe("curiosity", 8);
  };
  const clear = () => {
    dragRef.current = null; // same invalidation as seed()
    gaussDragRef.current = false;
    engineRef.current?.clear_all();
    setN(0);
  };
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };

  const btn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => pick(1)} className={btn(brush === 1)}>+ charge</button>
        <button onClick={() => pick(-1)} className={btn(brush === -1)}>− charge</button>
        <button onClick={togglePause} className={btn(false)}>{paused ? "play" : "pause"}</button>
        <button onClick={clear} className={btn(false)}>clear</button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <button onClick={() => seed("dipole")} className={btn(false)}>dipole</button>
        <button onClick={() => seed("capacitor")} className={btn(false)}>capacitor</button>
        <button onClick={() => seed("quadrupole")} className={btn(false)}>quadrupole</button>
        <button onClick={() => seed("random")} className={btn(false)}>random</button>
        <span className="font-mono text-[11px] text-muted">{n} · C++</span>
      </div>

      {/* overlays: the vector field three more ways */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">overlays</span>
        <button onClick={() => toggleOverlay("lines")} className={btn(show.lines)}>field lines</button>
        <button onClick={() => toggleOverlay("equi")} className={btn(show.equi)}>equipotentials</button>
        <button onClick={() => toggleOverlay("gauss")} className={btn(show.gauss)}>gauss surface</button>
        {show.gauss && (
          <>
            <input
              type="range"
              min={0.08}
              max={0.42}
              step={0.01}
              defaultValue={gaussRef.current.r}
              onChange={(e) => { gaussRef.current.r = Number(e.target.value); }}
              className="w-24 accent-[var(--accent)]"
              aria-label="gauss surface radius"
            />
            {gaussInfo && (
              <span
                className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] ${
                  Math.abs(gaussInfo.flux - gaussInfo.pred) < 0.004
                    ? "border-moss/50 text-moss"
                    : "border-line text-muted"
                }`}
              >
                ∮E·n̂ dl = {gaussInfo.flux.toFixed(3)} · 2πk·Q_enc = {gaussInfo.pred.toFixed(3)}
                {Math.abs(gaussInfo.flux - gaussInfo.pred) < 0.004 ? " ✓" : ""}
                {" "}(Q_in = {gaussInfo.qin >= 0 ? "+" : ""}{gaussInfo.qin.toFixed(0)})
              </span>
            )}
          </>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="block h-auto w-full cursor-crosshair touch-none select-none"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="font-mono text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">charging the field…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right font-mono text-[10px] leading-relaxed text-muted/70">
          click to place a charge · drag one to move it<br />
          heatmap: potential V · arrows: field E
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the math, running in C++</p>
        <p>force&nbsp;&nbsp;&nbsp;&nbsp;F = k·q₁q₂·r̂ / r²&nbsp;&nbsp;(Coulomb; like repels, opposite attracts)</p>
        <p>field&nbsp;&nbsp;&nbsp;&nbsp;E(p) = k·Σⱼ qⱼ (p − pⱼ) / |p − pⱼ|³&nbsp;&nbsp;(the arrows)</p>
        <p>potential V(p) = k·Σⱼ qⱼ / |p − pⱼ|&nbsp;&nbsp;(the heatmap; equipotentials are its level sets)</p>
        <p>gauss&nbsp;&nbsp;&nbsp;&nbsp;∮ E·n̂ dl = 2πk·Q_enclosed&nbsp;&nbsp;(drag the surface — the integral is computed numerically and it just… holds)</p>
        <p>each frame integrates every charge against every other (O(n²)), softened + damped, at 60&nbsp;Hz.</p>
      </div>
    </div>
  );
}
