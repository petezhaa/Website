"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// canvas layout: apparatus up top, two scrolling scope traces below
const W = 880;
const H = 560;
const APPARATUS_H = 280; // pointer interactions live above this line
const XLIM = 1.2; // physics coords: magnet x ∈ [−XLIM, XLIM], coil at 0
const SCALE = 320; // px per physics unit
const CX = W / 2;
const AXIS_Y = 150;
const COIL_RY = 112; // loop radius in px (the physics a = 0.35, × SCALE)
const COIL_RX = 14; // loop "perspective" squish
const LOOPS = 7;
const LOOP_GAP = 17;
const MAG_W = 116;
const MAG_H = 46;
const LAMP = { x: W - 96, y: 64, r: 17 };
const PLOT = { x: 46, w: W - 66, h: 112, phiY: 306, emfY: 438 };
const HIST = 512; // must match cpp/faraday.cpp
const AMP0 = 0.42;
const FREQ0 = 0.9;

type Engine = {
  memory: WebAssembly.Memory;
  reset: () => void;
  set_pos: (x: number) => void;
  set_shake: (on: number) => void;
  set_amp: (a: number) => void;
  set_freq: (f: number) => void;
  step: (dt: number) => void;
  pos: () => number;
  flux: () => number;
  emf: () => number;
  current: () => number;
  hist_len: () => number;
  hist_phi: (i: number) => number;
  hist_emf: (i: number) => number;
};

type Palette = {
  n: string; s: string; muted: string; line: string;
  fg: string; gold: string; moss: string; surf2: string;
};
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, f: string) => cs.getPropertyValue(name).trim() || f;
  return {
    n: v("--accent", "#bf5b32"),
    s: "#5f83ad", // steely blue reads as "south" in both themes
    muted: v("--muted", "#6f6a5c"),
    line: v("--line", "#e4ddcb"),
    fg: v("--fg", "#26241e"),
    gold: v("--gold", "#a98729"),
    moss: v("--moss", "#5f7350"),
    surf2: v("--surface-2", "#f1ebdd"),
  };
}

// ctx.roundRect isn't everywhere yet; six lines buys us everywhere
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function InductionSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const dragRef = useRef(false);
  const lastBumpRef = useRef(0);
  const escaleRef = useRef(0.7); // emf plot autoscale (grows fast, shrinks slow)
  const ampRef = useRef(AMP0);
  const freqRef = useRef(FREQ0);
  const paletteRef = useRef<Palette>({
    n: "#bf5b32", s: "#5f83ad", muted: "#777", line: "#ccc",
    fg: "#222", gold: "#a98729", moss: "#5f7350", surf2: "#eee",
  });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shakeOn, setShakeOn] = useState(true); // starts on autopilot so it moves hands-free
  const [amp, setAmp] = useState(AMP0);
  const [freq, setFreq] = useState(FREQ0);

  const toCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    const mono = "ui-monospace, 'JetBrains Mono', Menlo, monospace";
    const emfV = eng.emf();
    const fluxV = eng.flux();
    const mpx = CX + eng.pos() * SCALE;
    const loopX = (i: number) => CX + (i - (LOOPS - 1) / 2) * LOOP_GAP;

    ctx.clearRect(0, 0, W, H);

    // the axis the magnet rides
    ctx.strokeStyle = P.muted;
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(CX - XLIM * SCALE, AXIS_Y);
    ctx.lineTo(CX + XLIM * SCALE, AXIS_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // coil, far half of each winding (behind the magnet)
    ctx.strokeStyle = P.moss;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < LOOPS; i++) {
      ctx.beginPath();
      ctx.ellipse(loopX(i), AXIS_Y, COIL_RX, COIL_RY, 0, Math.PI - 0.08, Math.PI * 2 + 0.08);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // leads from the coil up to the lamp
    ctx.strokeStyle = P.moss;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(loopX(LOOPS - 1), AXIS_Y - COIL_RY);
    ctx.lineTo(loopX(LOOPS - 1) + 30, 26);
    ctx.lineTo(LAMP.x - 7, 26);
    ctx.lineTo(LAMP.x - 7, LAMP.y + LAMP.r + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(loopX(0), AXIS_Y - COIL_RY);
    ctx.lineTo(loopX(0) - 24, 14);
    ctx.lineTo(LAMP.x + 7, 14);
    ctx.lineTo(LAMP.x + 7, LAMP.y + LAMP.r + 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // the lamp: glow scales with |emf| — no change in flux, no light
    const g = Math.min(1, Math.abs(emfV) / 2.2);
    ctx.fillStyle = P.muted;
    ctx.fillRect(LAMP.x - 10, LAMP.y + LAMP.r - 2, 20, 8);
    if (g > 0.02) {
      ctx.save();
      ctx.shadowColor = P.gold;
      ctx.shadowBlur = 40 * g;
      ctx.fillStyle = P.gold;
      ctx.globalAlpha = 0.15 + 0.55 * g;
      ctx.beginPath();
      ctx.arc(LAMP.x, LAMP.y, LAMP.r - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = P.fg;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(LAMP.x, LAMP.y, LAMP.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g > 0.1 ? P.gold : P.muted;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4 + 0.6 * g;
    ctx.beginPath();
    ctx.moveTo(LAMP.x - 7, LAMP.y + 9);
    ctx.lineTo(LAMP.x - 4, LAMP.y - 5);
    ctx.lineTo(LAMP.x, LAMP.y + 7);
    ctx.lineTo(LAMP.x + 4, LAMP.y - 5);
    ctx.lineTo(LAMP.x + 7, LAMP.y + 9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.muted;
    ctx.font = `9px ${mono}`;
    ctx.textAlign = "center";
    ctx.fillText("I = ℰ/R", LAMP.x, LAMP.y + LAMP.r + 20);

    // the magnet: N red, S blue, threaded onto the axis
    const x0 = mpx - MAG_W / 2;
    const y0 = AXIS_Y - MAG_H / 2;
    ctx.save();
    rr(ctx, x0, y0, MAG_W, MAG_H, 8);
    ctx.clip();
    ctx.fillStyle = P.n;
    ctx.fillRect(x0, y0, MAG_W / 2, MAG_H);
    ctx.fillStyle = P.s;
    ctx.fillRect(x0 + MAG_W / 2, y0, MAG_W / 2, MAG_H);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x0 + MAG_W / 2 - 1, y0, 2, MAG_H);
    ctx.restore();
    ctx.strokeStyle = P.fg;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    rr(ctx, x0, y0, MAG_W, MAG_H, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `700 15px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", x0 + MAG_W * 0.25, AXIS_Y);
    ctx.fillText("S", x0 + MAG_W * 0.75, AXIS_Y);
    ctx.textBaseline = "alphabetic";

    // coil, near half of each winding (in front of the magnet)
    ctx.strokeStyle = P.moss;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < LOOPS; i++) {
      ctx.beginPath();
      ctx.ellipse(loopX(i), AXIS_Y, COIL_RX, COIL_RY, 0, -0.06, Math.PI + 0.06);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // induced-current arrows: they flip with the sign of emf (Lenz's veto)
    const ae = Math.min(1, Math.abs(emfV) / 1.1);
    if (ae > 0.05) {
      const dir = emfV > 0 ? 1 : -1;
      ctx.globalAlpha = 0.25 + 0.75 * ae;
      ctx.strokeStyle = P.n;
      ctx.fillStyle = P.n;
      const arrow = (ax: number, ay: number, d: number) => {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax - 14 * d, ay);
        ctx.lineTo(ax + 8 * d, ay);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax + 16 * d, ay);
        ctx.lineTo(ax + 6 * d, ay - 5);
        ctx.lineTo(ax + 6 * d, ay + 5);
        ctx.closePath();
        ctx.fill();
      };
      arrow(CX, AXIS_Y - COIL_RY - 16, dir);
      arrow(CX, AXIS_Y + COIL_RY + 14, -dir);
      ctx.font = `700 11px ${mono}`;
      ctx.textAlign = "center";
      ctx.fillText("I", CX + 32 * dir, AXIS_Y - COIL_RY - 12);
      ctx.globalAlpha = 1;
    }

    // ---- the two scope traces ----
    const len = eng.hist_len();
    const phis: number[] = new Array(len);
    const emfs: number[] = new Array(len);
    let mAbs = 0;
    for (let i = 0; i < len; i++) {
      phis[i] = eng.hist_phi(i);
      const ev = eng.hist_emf(i);
      emfs[i] = ev;
      const a = Math.abs(ev);
      if (a > mAbs) mAbs = a;
    }
    const targetSc = Math.max(0.7, mAbs * 1.15);
    escaleRef.current = targetSc > escaleRef.current
      ? targetSc
      : escaleRef.current + (targetSc - escaleRef.current) * 0.02;
    const esc = escaleRef.current;

    const trace = (
      py0: number, vals: number[], lo: number, hi: number,
      color: string, label: string, readout: string,
    ) => {
      const { x, w, h } = PLOT;
      ctx.fillStyle = P.surf2;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, py0, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, py0 + 0.5, w - 1, h - 1);
      const ymap = (v: number) => {
        const t = (v - lo) / (hi - lo);
        return py0 + h - Math.min(1, Math.max(0, t)) * h;
      };
      if (lo < 0 && hi > 0) {
        const zy = ymap(0);
        ctx.strokeStyle = P.muted;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, zy);
        ctx.lineTo(x + w, zy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (vals.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < vals.length; i++) {
          const px = x + (i / (HIST - 1)) * w;
          const py = ymap(vals[i]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + ((vals.length - 1) / (HIST - 1)) * w, ymap(vals[vals.length - 1]), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.font = `10px ${mono}`;
      ctx.textAlign = "left";
      ctx.fillText(label, x + 8, py0 + 14);
      ctx.textAlign = "right";
      ctx.globalAlpha = 0.75;
      ctx.fillText(readout, x + w - 8, py0 + 14);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    };

    trace(PLOT.phiY, phis, 0, 1.18, P.gold, "flux Φ(t) through the coil", `Φ = ${fluxV.toFixed(2)}`);
    trace(PLOT.emfY, emfs, -esc, esc, P.n, "emf ℰ(t) = −N·dΦ/dt — the negative slope of Φ", `ℰ = ${emfV.toFixed(2)}`);
  }, []);

  // load wasm + start the loop when the section is near
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/faraday.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        eng.reset();
        eng.set_amp(ampRef.current);
        eng.set_freq(freqRef.current);
        eng.set_shake(1); // wiggle on arrival, so the lamp is already blinking
        paletteRef.current = readPalette();
        setReady(true);
        const tick = (now: number) => {
          const last = lastRef.current || now;
          lastRef.current = now;
          const dt = Math.min(0.05, (now - last) / 1000);
          if (dt > 0) eng.step(dt);
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

  // ---- interaction: grabbing anywhere near the apparatus drags the magnet ----
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    if (!eng) return;
    const [px, py] = toCanvas(e);
    if (py > APPARATUS_H) return; // the plots are for looking at
    canvasRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = true;
    if (shakeOn) { eng.set_shake(0); setShakeOn(false); } // your hand outranks the autopilot
    eng.set_pos((px - CX) / SCALE);
    const now = Date.now();
    if (now - lastBumpRef.current > 3000) {
      lastBumpRef.current = now;
      bumpVibe("curiosity", 6);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    if (!eng || !dragRef.current) return;
    const [px] = toCanvas(e);
    eng.set_pos((px - CX) / SCALE);
  };
  const endDrag = () => { dragRef.current = false; };

  const toggleShake = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const next = !shakeOn;
    eng.set_shake(next ? 1 : 0);
    setShakeOn(next);
    if (next) bumpVibe("curiosity", 5);
  };
  const reset = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.reset(); // parks the magnet, clears the traces, drops to manual
    setShakeOn(false);
  };
  const onAmp = (v: number) => {
    setAmp(v);
    ampRef.current = v;
    const eng = engineRef.current;
    if (!eng) return;
    eng.set_amp(v);
    if (!shakeOn) { eng.set_shake(1); setShakeOn(true); } // touching a dial implies "go"
  };
  const onFreq = (v: number) => {
    setFreq(v);
    freqRef.current = v;
    const eng = engineRef.current;
    if (!eng) return;
    eng.set_freq(v);
    if (!shakeOn) { eng.set_shake(1); setShakeOn(true); }
  };

  const btn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggleShake} className={btn(shakeOn)}>
          {shakeOn ? "shaking for you" : "shake it for me"}
        </button>
        <button onClick={reset} className={btn(false)}>reset</button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
          amp
          <input
            type="range" min={0.05} max={0.6} step={0.01} value={amp}
            onChange={(e) => onAmp(Number(e.target.value))}
            className="w-20 cursor-pointer sm:w-28"
            style={{ accentColor: "var(--accent)" }}
            aria-label="shake amplitude"
          />
          <span className="tabular-nums">{amp.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
          freq
          <input
            type="range" min={0.2} max={2.5} step={0.05} value={freq}
            onChange={(e) => onFreq(Number(e.target.value))}
            className="w-20 cursor-pointer sm:w-28"
            style={{ accentColor: "var(--accent)" }}
            aria-label="shake frequency"
          />
          <span className="tabular-nums">{freq.toFixed(2)} Hz</span>
        </label>
        <span className="font-mono text-[11px] text-muted">{shakeOn ? "autopilot" : "manual"} · C++</span>
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
          className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="font-mono text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">winding the coil…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right font-mono text-[10px] leading-relaxed text-muted/70">
          drag the magnet through the coil · speed makes volts, parking makes none<br />
          the arrow on the coil is the induced current — watch it flip (lenz)
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the physics, running in C++</p>
        <p>flux&nbsp;&nbsp;&nbsp;&nbsp;Φ(d) = k·a² / (a² + d²)^(3/2)&nbsp;&nbsp;(bar magnet a distance d down the coil axis)</p>
        <p>faraday&nbsp;ℰ = −N·dΦ/dt&nbsp;&nbsp;(finite-differenced from the magnet&apos;s actual motion — your wrist is the input)</p>
        <p>ohm&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;I = ℰ/R&nbsp;&nbsp;(the lamp is honest: no changing flux, no light)</p>
        <p>lenz: the minus sign is the coil fighting the change — the current flips the moment Φ stops rising and starts falling.</p>
      </div>
    </div>
  );
}
