"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// field space is [0, XMAX] x [0, 1] with y pointing UP (physics coords);
// the renderer flips y so the right-hand rule actually works on screen:
// B > 0 (dots, out of the screen) curls a rightward +q downward, as it should.
const XMAX = 1.6;
const H = 520;
const W = Math.round(XMAX * H); // 832
const GAIN = 2.2; // drag length (field units) -> launch speed (units/s)
const TRAIL = 72; // trail samples per particle (TS-side ring buffer)
const MAXP = 64;

const sx = (fx: number) => fx * H;
const sy = (fy: number) => (1 - fy) * H;

type Engine = {
  memory: WebAssembly.Memory;
  set_fields: (b: number, ex: number, ey: number) => void;
  add_particle: (x: number, y: number, vx: number, vy: number, q: number) => number;
  clear_all: () => void;
  step: (dt: number) => void;
  count: () => number;
  px: (i: number) => number;
  py: (i: number) => number;
  pq: (i: number) => number;
  pvx: (i: number) => number;
  pvy: (i: number) => number;
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

type Trail = { xs: Float64Array; ys: Float64Array; head: number; len: number };
const newTrail = (): Trail => ({
  xs: new Float64Array(TRAIL),
  ys: new Float64Array(TRAIL),
  head: 0,
  len: 0,
});
function pushTrail(t: Trail, x: number, y: number) {
  t.xs[t.head] = x;
  t.ys[t.head] = y;
  t.head = (t.head + 1) % TRAIL;
  if (t.len < TRAIL) t.len++;
}
// three alpha chunks, oldest faintest; breaks the stroke at torus seams
function drawTrail(ctx: CanvasRenderingContext2D, t: Trail, color: string) {
  if (t.len < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 3; c++) {
    const k0 = Math.floor((t.len * c) / 3);
    const k1 = Math.floor((t.len * (c + 1)) / 3);
    if (k1 - k0 < 1) continue;
    ctx.globalAlpha = 0.08 + 0.11 * c;
    ctx.beginPath();
    let started = false;
    let lx = 0, ly = 0;
    for (let k = Math.max(0, k0 - 1); k < k1; k++) {
      const idx = (t.head - t.len + k + 2 * TRAIL) % TRAIL;
      const fx = t.xs[idx], fy = t.ys[idx];
      if (!started) { ctx.moveTo(sx(fx), sy(fy)); started = true; }
      else if (Math.abs(fx - lx) > 0.8 || Math.abs(fy - ly) > 0.5) ctx.moveTo(sx(fx), sy(fy));
      else ctx.lineTo(sx(fx), sy(fy));
      lx = fx; ly = fy;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// circumradius of three points: exact for any three points on a circle.
// null = points too bunched to say anything; Infinity = collinear (straight).
function circumRadius(
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
): number | null {
  const c = Math.hypot(x2 - x1, y2 - y1);
  const a = Math.hypot(x3 - x2, y3 - y2);
  const b = Math.hypot(x3 - x1, y3 - y1);
  if (a < 1e-4 || b < 1e-4 || c < 1e-4) return null; // basically parked
  const cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  if (Math.abs(cross) < 1e-7) return Infinity;
  return (a * b * c) / (2 * Math.abs(cross));
}

type Stats = { pred: number; meas: number | null; q: number };
type Track = { i: number; q: number; hist: number[] }; // hist = flat [x,y,...]

export function MagnetismSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const paletteRef = useRef<Palette>({ pos: "#bf5b32", neg: "#5f83ad", muted: "#777", line: "#ccc", fg: "#222" });
  const brushRef = useRef(1); // +1 or -1: the sign of the next launch
  const aimRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const trailsRef = useRef<Trail[]>(Array.from({ length: MAXP }, newTrail));
  const trackRef = useRef<Track | null>(null); // the last-launched particle
  const frameRef = useRef(0);
  const pausedRef = useRef(false);
  const bRef = useRef(4);
  const exRef = useRef(0);
  const eyRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [brush, setBrush] = useState(1);
  const [paused, setPaused] = useState(false);
  const [n, setN] = useState(0);
  const [bV, setBV] = useState(4);
  const [exV, setExV] = useState(0);
  const [eyV, setEyV] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  const toField = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * XMAX;
    const fy = 1 - (e.clientY - r.top) / r.height; // flip: field y is up
    return [fx, fy];
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    ctx.clearRect(0, 0, W, H);

    // B glyph grid: ⊙ (dot) = out of the screen, × = into it; alpha tracks |B|
    const b = bRef.current;
    if (Math.abs(b) > 0.05) {
      ctx.globalAlpha = Math.min(0.45, 0.08 + (Math.abs(b) / 12) * 0.45);
      ctx.strokeStyle = P.muted;
      ctx.fillStyle = P.muted;
      ctx.lineWidth = 1;
      const GX = 16, GY = 10;
      for (let ix = 0; ix < GX; ix++) {
        for (let iy = 0; iy < GY; iy++) {
          const x = ((ix + 0.5) / GX) * W;
          const y = ((iy + 0.5) / GY) * H;
          if (b > 0) {
            ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(x - 3.2, y - 3.2); ctx.lineTo(x + 3.2, y + 3.2);
            ctx.moveTo(x - 3.2, y + 3.2); ctx.lineTo(x + 3.2, y - 3.2);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // E direction compass, top-left, so the in-plane field isn't invisible
    const ex = exRef.current, ey = eyRef.current;
    const em = Math.hypot(ex, ey);
    if (em > 0.03) {
      const ux = ex / em, uy = -ey / em; // screen flip
      const ax0 = 30, ay0 = 30, L = 13;
      ctx.strokeStyle = P.fg;
      ctx.fillStyle = P.fg;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax0 - ux * L, ay0 - uy * L);
      ctx.lineTo(ax0 + ux * L, ay0 + uy * L);
      ctx.stroke();
      const hx = ax0 + ux * L, hy = ay0 + uy * L;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ux * 6 - uy * 3.5, hy - uy * 6 + ux * 3.5);
      ctx.lineTo(hx - ux * 6 + uy * 3.5, hy - uy * 6 - ux * 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("E", ax0 + 19, ay0 + 3);
      ctx.globalAlpha = 1;
    }

    // trails first, then the particles on top
    const cnt = eng.count();
    for (let i = 0; i < cnt; i++) {
      drawTrail(ctx, trailsRef.current[i], eng.pq(i) > 0 ? P.pos : P.neg);
    }
    for (let i = 0; i < cnt; i++) {
      const x = sx(eng.px(i)), y = sy(eng.py(i)), q = eng.pq(i);
      const col = q > 0 ? P.pos : P.neg;
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      if (q > 0) {
        ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
      } else {
        ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
      }
      ctx.stroke();
    }

    // dashed ring on the particle the panel is measuring
    const tr = trackRef.current;
    if (tr && tr.i < cnt) {
      ctx.strokeStyle = P.fg;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(sx(eng.px(tr.i)), sy(eng.py(tr.i)), 12.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // aim overlay: velocity arrow + the orbit r = mv/qB predicts, pre-launch
    const a = aimRef.current;
    if (a) {
      const col = brushRef.current > 0 ? P.pos : P.neg;
      const x0 = sx(a.x0), y0 = sy(a.y0), x1 = sx(a.x1), y1 = sy(a.y1);
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]);
      const dx = x1 - x0, dy = y1 - y0;
      const dl = Math.hypot(dx, dy);
      if (dl > 6) {
        const ux = dx / dl, uy = dy / dl;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - ux * 7 - uy * 4, y1 - uy * 7 + ux * 4);
        ctx.lineTo(x1 - ux * 7 + uy * 4, y1 - uy * 7 - ux * 4);
        ctx.closePath();
        ctx.fill();
      }
      const vx = (a.x1 - a.x0) * GAIN, vy = (a.y1 - a.y0) * GAIN;
      const sp = Math.hypot(vx, vy);
      if (sp > 0.03 && Math.abs(b) > 0.05) {
        const r = sp / Math.abs(b);
        if (r < 3) {
          // orbit center sits at p + r·sign(qB)·(v̂ rotated toward center)
          const sgn = Math.sign(brushRef.current * b);
          const cxF = a.x0 + (sgn * r * vy) / sp;
          const cyF = a.y0 - (sgn * r * vx) / sp;
          ctx.setLineDash([3, 5]);
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.arc(sx(cxF), sy(cyF), r * H, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;
    }
  }, []);

  // after each physics step: feed trails, track the last launch, refresh stats
  const afterStep = useCallback((eng: Engine) => {
    const cnt = eng.count();
    const trails = trailsRef.current;
    for (let i = 0; i < cnt; i++) pushTrail(trails[i], eng.px(i), eng.py(i));

    const tr = trackRef.current;
    if (tr && tr.i < cnt) {
      const x = eng.px(tr.i), y = eng.py(tr.i);
      const h = tr.hist;
      const m = h.length;
      if (m >= 2 && (Math.abs(x - h[m - 2]) > 0.8 || Math.abs(y - h[m - 1]) > 0.5)) {
        h.length = 0; // crossed the torus seam: restart the circle fit
      }
      h.push(x, y);
      if (h.length > 96) h.splice(0, h.length - 96); // keep ~48 recent points
    }

    if (++frameRef.current % 12 !== 0) return; // stats at ~5 Hz is plenty
    if (!tr || tr.i >= cnt) return;
    const v = Math.hypot(eng.pvx(tr.i), eng.pvy(tr.i));
    const b = bRef.current;
    const pred = Math.abs(b) > 0.05 ? v / Math.abs(b) : Infinity; // r = mv/qB, m=|q|=1
    const hh = tr.hist;
    const np = hh.length / 2;
    let meas: number | null = null;
    if (np >= 16) {
      const i1 = Math.floor(np / 2), i2 = np - 1;
      meas = circumRadius(hh[0], hh[1], hh[2 * i1], hh[2 * i1 + 1], hh[2 * i2], hh[2 * i2 + 1]);
    }
    setStats({ pred, meas, q: tr.q });
  }, []);

  // load wasm + start the loop when the section is near
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/magnet.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        // opening scene: a +q / −q cyclotron pair, counter-rotating
        eng.set_fields(bRef.current, exRef.current, eyRef.current);
        const i0 = eng.add_particle(0.5, 0.5, 0, 0.45, 1);
        eng.add_particle(1.0, 0.5, 0, 0.45, -1);
        if (i0 >= 0) trackRef.current = { i: i0, q: 1, hist: [] };
        setN(eng.count());
        paletteRef.current = readPalette();
        setReady(true);
        let last = performance.now();
        const tick = (now: number) => {
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          if (!pausedRef.current) {
            eng.step(dt);
            afterStep(eng);
          }
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
  }, [draw, afterStep]);

  // ---- interaction: drag = velocity, release = launch ----
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const [fx, fy] = toField(e);
    aimRef.current = { x0: fx, y0: fy, x1: fx, y1: fy };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = aimRef.current;
    if (!a) return;
    const [fx, fy] = toField(e);
    a.x1 = fx;
    a.y1 = fy;
  };
  const onPointerUp = () => {
    const eng = engineRef.current;
    const a = aimRef.current;
    aimRef.current = null;
    if (!eng || !a) return;
    const vx = (a.x1 - a.x0) * GAIN;
    const vy = (a.y1 - a.y0) * GAIN;
    const i = eng.add_particle(a.x0, a.y0, vx, vy, brushRef.current);
    if (i < 0) return;
    trailsRef.current[i] = newTrail();
    trackRef.current = { i, q: brushRef.current, hist: [] };
    setStats(null);
    setN(eng.count());
    bumpVibe("curiosity", 6);
  };
  const onPointerCancel = () => { aimRef.current = null; };

  // ---- controls ----
  const applyFields = (b: number, ex: number, ey: number) => {
    bRef.current = b; exRef.current = ex; eyRef.current = ey;
    setBV(b); setExV(ex); setEyV(ey);
    engineRef.current?.set_fields(b, ex, ey);
  };
  const resetTrails = () => { trailsRef.current = Array.from({ length: MAXP }, newTrail); };
  const pick = (q: number) => { brushRef.current = q; setBrush(q); };
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const clear = () => {
    engineRef.current?.clear_all();
    resetTrails();
    trackRef.current = null;
    setStats(null);
    setN(0);
  };

  const cyclotron = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.clear_all();
    resetTrails();
    applyFields(4, 0, 0);
    const i0 = eng.add_particle(0.5, 0.5, 0, 0.45, 1);
    eng.add_particle(1.0, 0.5, 0, 0.45, -1);
    trackRef.current = i0 >= 0 ? { i: i0, q: 1, hist: [] } : null;
    setStats(null);
    setN(eng.count());
    bumpVibe("curiosity", 8);
  };
  // crossed E and B: only v = E/B slips through undeflected
  const velocitySelector = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.clear_all();
    resetTrails();
    const b = 4, vSel = 0.35;
    applyFields(b, 0, vSel * b); // Ey = v·B balances qv×B exactly at v = E/B
    const speeds = [0.5 * vSel, vSel, 1.5 * vSel];
    const ys = [0.32, 0.5, 0.68];
    let trackIdx = -1;
    speeds.forEach((s, k) => {
      const i = eng.add_particle(0.1, ys[k], s, 0, 1);
      if (i >= 0) {
        trailsRef.current[i] = newTrail();
        if (k === 1) trackIdx = i; // the matched one: watch it not curve
      }
    });
    trackRef.current = trackIdx >= 0 ? { i: trackIdx, q: 1, hist: [] } : null;
    setStats(null);
    setN(eng.count());
    bumpVibe("curiosity", 10);
  };
  const spray = () => {
    const eng = engineRef.current;
    if (!eng) return;
    let lastIdx = -1, lastQ = 1;
    for (let k = 0; k < 8; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.15 + Math.random() * 0.45;
      const q = Math.random() < 0.5 ? 1 : -1;
      const i = eng.add_particle(
        0.2 + Math.random() * 1.2,
        0.15 + Math.random() * 0.7,
        Math.cos(ang) * sp,
        Math.sin(ang) * sp,
        q,
      );
      if (i >= 0) { trailsRef.current[i] = newTrail(); lastIdx = i; lastQ = q; }
    }
    if (lastIdx >= 0) trackRef.current = { i: lastIdx, q: lastQ, hist: [] };
    setStats(null);
    setN(engineRef.current?.count() ?? 0);
    bumpVibe("curiosity", 8);
  };

  const btn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  const fmtR = (r: number | null) =>
    r === null ? "—" : r === Infinity || r > 20 ? "∞" : r.toFixed(3);
  const statsLine = !stats
    ? "launch a charge (drag sets v) and this line checks r = mv/qB against the circle it actually draws."
    : `last launch (${stats.q > 0 ? "+q" : "−q"}) · predicted r = ${fmtR(stats.pred)} · measured r = ${fmtR(stats.meas)}${
        Math.abs(exV) + Math.abs(eyV) > 0.01
          ? " · E ≠ 0, so the formula is off duty — watch the drift instead"
          : ""
      }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => pick(1)} className={btn(brush === 1)}>+q brush</button>
        <button onClick={() => pick(-1)} className={btn(brush === -1)}>−q brush</button>
        <button onClick={togglePause} className={btn(false)}>{paused ? "play" : "pause"}</button>
        <button onClick={clear} className={btn(false)}>clear</button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <button onClick={cyclotron} className={btn(false)}>cyclotron</button>
        <button onClick={velocitySelector} className={btn(false)}>velocity selector</button>
        <button onClick={spray} className={btn(false)}>random</button>
        <span className="font-mono text-[11px] text-muted">{n} · C++</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          B·ẑ: <span className="w-12 text-right tabular-nums text-accent">{(bV >= 0 ? "+" : "") + bV.toFixed(2)}</span>
          <input
            type="range"
            min={-8}
            max={8}
            step={0.25}
            value={bV}
            disabled={!ready}
            onChange={(e) => applyFields(Number(e.target.value), exRef.current, eyRef.current)}
            onPointerUp={() => bumpVibe("curiosity", 4)}
            className="w-40 accent-accent"
            aria-label="magnetic field strength (out of screen)"
          />
        </label>
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          Eₓ: <span className="w-12 text-right tabular-nums text-accent">{(exV >= 0 ? "+" : "") + exV.toFixed(2)}</span>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.1}
            value={exV}
            disabled={!ready}
            onChange={(e) => applyFields(bRef.current, Number(e.target.value), eyRef.current)}
            onPointerUp={() => bumpVibe("curiosity", 3)}
            className="w-28 accent-accent"
            aria-label="electric field, x component"
          />
        </label>
        <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
          E_y: <span className="w-12 text-right tabular-nums text-accent">{(eyV >= 0 ? "+" : "") + eyV.toFixed(2)}</span>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.1}
            value={eyV}
            disabled={!ready}
            onChange={(e) => applyFields(bRef.current, exRef.current, Number(e.target.value))}
            onPointerUp={() => bumpVibe("curiosity", 3)}
            className="w-28 accent-accent"
            aria-label="electric field, y component (up)"
          />
        </label>
      </div>

      <div className="panel relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="block h-auto w-full cursor-crosshair touch-none select-none"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse text-sm text-muted">energizing the electromagnet…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right text-[10px] leading-relaxed text-muted/70">
          drag to launch a charge · longer drag, faster launch<br />
          ⊙ B out of screen · × into screen · edges wrap
        </p>
      </div>

      <div className="panel p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the physics, running in C++</p>
        <p>force&nbsp;&nbsp;&nbsp;&nbsp;F = q(E + v × B)&nbsp;&nbsp;(Lorentz; B = B·ẑ, straight out of your screen)</p>
        <p>per axis&nbsp;&nbsp;aₓ = q(Eₓ + v_y·B) · a_y = q(E_y − vₓ·B)&nbsp;&nbsp;(m = |q| = 1 for everyone)</p>
        <p>radius&nbsp;&nbsp;&nbsp;&nbsp;r = m·v / (q·B)&nbsp;&nbsp;(cyclotron radius: faster charge, wider circle — B never does work)</p>
        <p className="mt-2 border-t border-line pt-2 text-fg">{statsLine}</p>
        <p className="mt-1">
          semi-implicit euler, 8 substeps, zero damping — orbits are honest circles, not slow spirals.
          edges wrap, so it&apos;s a torus. box height = 1 field unit.
        </p>
      </div>
    </div>
  );
}
