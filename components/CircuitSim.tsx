"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// canvas layout: schematic up top, scrolling oscilloscope below,
// and (in RLC mode) a resonance curve in the top-right corner
const W = 832;
const H = 520;
const V0 = 5; // battery / drive amplitude, volts (fixed — one knob fewer)

// oscilloscope frame
const SX0 = 56, SX1 = 816, SY0 = 226, SY1 = 470;
const NBUF = 420; // samples in the scroll window (7 s at 60 fps)
const DX = (SX1 - SX0) / NBUF;
const PX_PER_SEC = 60 * DX;

// resonance-curve frame (RLC mode only)
const RX0 = 512, RX1 = 812, RY0 = 40, RY1 = 178;
const FA0 = 0.02, FA1 = 2.6; // frequency axis, Hz

// slider ranges (strict subsets of the C++ clamps)
const FMIN = 0.02, FMAX = 2.5;

type Engine = {
  memory: WebAssembly.Memory;
  set_mode: (m: number) => void;
  set_params: (R: number, L: number, C: number, V0: number, f: number) => void;
  set_switch: (on: number) => void;
  reset: () => void;
  step: () => void;
  t: () => number;
  v_src: () => number;
  v_cap: () => number;
  v_ind: () => number;
  i_now: () => number;
  amp_at: (omega: number) => number;
  res_f: () => number;
  tau_now: () => number;
};

type Palette = { accent: string; moss: string; gold: string; muted: string; line: string; fg: string };
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    accent: v("--accent", "#bf5b32"),
    moss: v("--moss", "#5f7350"),
    gold: v("--gold", "#a98729"),
    muted: v("--muted", "#6f6a5c"),
    line: v("--line", "#e4ddcb"),
    fg: v("--fg", "#26241e"),
  };
}

const MODE_NAMES = ["rc — charge a cap", "rl — tame a coil", "rlc — find resonance"];

export function CircuitSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const paletteRef = useRef<Palette>({ accent: "#bf5b32", moss: "#5f7350", gold: "#a98729", muted: "#777", line: "#ccc", fg: "#222" });

  const [mode, setMode] = useState(0);
  const [sw, setSw] = useState(true);
  const [R, setR] = useState(1);
  const [Cc, setCc] = useState(1);
  const [Ll, setLl] = useState(1);
  const [f, setF] = useState(0.16);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  const modeRef = useRef(0);
  const swRef = useRef(true);
  const prmRef = useRef({ R: 1, C: 1, L: 1, f: 0.16 });
  const pausedRef = useRef(false);
  const dragFRef = useRef(false);
  const lastBumpRef = useRef(0);

  // scope ring buffers: reactive-element voltage, current, source voltage
  const bufV = useRef(new Float64Array(NBUF));
  const bufI = useRef(new Float64Array(NBUF));
  const bufS = useRef(new Float64Array(NBUF));
  const headRef = useRef(0);
  const countRef = useRef(0);
  const vScaleRef = useRef(V0);
  const iScaleRef = useRef(1);
  const switchTRef = useRef(0); // sim time of the last switch flip
  const dotsRef = useRef(0);    // current-dot offset along the loop perimeter

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    const m = modeRef.current;
    const prm = prmRef.current;
    const vc = eng.v_cap();
    const vl = eng.v_ind();
    const ii = eng.i_now();
    const vs = eng.v_src();
    const tnow = eng.t();
    const tau = eng.tau_now();

    ctx.clearRect(0, 0, W, H);
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.lineCap = "round";

    // ---------- schematic ----------
    const x0 = m === 2 ? 96 : 200;
    const x1 = m === 2 ? 470 : 632;
    const y0 = 42, y1 = 180;

    ctx.strokeStyle = P.fg;
    ctx.lineWidth = 1.6;
    const wire = (ax: number, ay: number, bx: number, by: number) => {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    };
    const zig = (xa: number, xb: number, y: number) => {
      const n = 6, amp = 8, seg = (xb - xa) / n;
      ctx.beginPath();
      ctx.moveTo(xa, y);
      for (let k = 0; k < n; k++) ctx.lineTo(xa + seg * (k + 0.5), y + (k % 2 ? amp : -amp));
      ctx.lineTo(xb, y);
      ctx.stroke();
    };
    const coil = (x: number, ya: number, yb: number) => {
      const n = 4, r = (yb - ya) / (2 * n);
      // the coil glows with |i| — the magnetic field, basically
      ctx.save();
      const g = Math.min(1, Math.abs(ii) / Math.max(1, iScaleRef.current));
      if (g > 0.03) { ctx.shadowColor = P.moss; ctx.shadowBlur = 4 + 14 * g; }
      ctx.beginPath();
      for (let k = 0; k < n; k++) ctx.arc(x, ya + r * (2 * k + 1), r, -Math.PI / 2, Math.PI / 2, false);
      ctx.stroke();
      ctx.restore();
    };

    ctx.fillStyle = P.muted;
    ctx.textAlign = "center";

    if (m < 2) {
      // -------- battery · switch · R · (C or L) --------
      // left edge: battery, + on top
      wire(x0, y0, x0, 104);
      wire(x0, 116, x0, y1);
      ctx.save();
      if (swRef.current) { ctx.shadowColor = P.accent; ctx.shadowBlur = 9; }
      wire(x0 - 13, 104, x0 + 13, 104); // long plate: +
      ctx.lineWidth = 3.4;
      wire(x0 - 6, 116, x0 + 6, 116);   // short plate: −
      ctx.restore();
      ctx.lineWidth = 1.6;
      ctx.textAlign = "right";
      ctx.fillText("+", x0 - 18, 102);
      ctx.fillText(`V₀ = ${V0} V`, x0 - 18, 116);
      ctx.textAlign = "center";

      // top edge: switch then resistor
      wire(x0, y0, 272, y0);
      wire(312, y0, 440, y0);
      zig(440, 540, y0);
      wire(540, y0, x1, y0);
      // the switch: pivot + lever, open or closed
      ctx.fillStyle = P.fg;
      ctx.beginPath(); ctx.arc(272, y0, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(312, y0, 2.6, 0, Math.PI * 2); ctx.fill();
      if (swRef.current) wire(272, y0, 312, y0);
      else wire(272, y0, 303, y0 - 22);
      ctx.fillStyle = P.muted;
      ctx.fillText(swRef.current ? "switch: closed" : "switch: open", 292, y0 + 18);
      ctx.fillText(`R = ${prm.R.toFixed(2)} Ω`, 490, y0 - 20);

      if (m === 0) {
        // right edge: capacitor, plates horizontal, filling like a tank
        wire(x1, y0, x1, 98);
        wire(x1, 110, x1, y1);
        wire(x1 - 20, 98, x1 + 20, 98);
        wire(x1 - 20, 110, x1 + 20, 110);
        const frac = Math.min(1, Math.abs(vc) / V0);
        ctx.globalAlpha = 0.18 + 0.55 * frac;
        ctx.fillStyle = P.accent;
        ctx.fillRect(x1 - 17, 110 - 11 * frac, 34, 11 * frac);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.accent;
        const glyphs = Math.round(frac * 3);
        if (glyphs > 0) {
          ctx.fillText("+ ".repeat(glyphs).trim(), x1, 93);
          ctx.fillText("− ".repeat(glyphs).trim(), x1, 122);
        }
        ctx.fillStyle = P.muted;
        ctx.textAlign = "left";
        ctx.fillText(`C = ${prm.C.toFixed(2)} F`, x1 + 28, 108);
        ctx.textAlign = "center";
      } else {
        // right edge: inductor
        wire(x1, y0, x1, 78);
        coil(x1, 78, 142);
        wire(x1, 142, x1, y1);
        ctx.textAlign = "left";
        ctx.fillText(`L = ${prm.L.toFixed(2)} H`, x1 + 28, 112);
        ctx.textAlign = "center";
      }
      wire(x1, y1, x0, y1); // bottom return wire
    } else {
      // -------- AC source · R · L · C, in one loop --------
      wire(x0, y0, x0, 92);
      wire(x0, 130, x0, y1);
      ctx.save();
      const g = Math.min(1, Math.abs(vs) / V0);
      ctx.shadowColor = vs >= 0 ? P.accent : P.moss;
      ctx.shadowBlur = 3 + 16 * g;
      ctx.beginPath(); ctx.arc(x0, 111, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x0 - 10, 111);
      ctx.quadraticCurveTo(x0 - 5, 99, x0, 111);
      ctx.quadraticCurveTo(x0 + 5, 123, x0 + 10, 111);
      ctx.stroke();
      ctx.fillText("V₀·sin(2πft)", x0 + 8, 214);

      wire(x0, y0, 200, y0);
      zig(200, 300, y0);
      wire(300, y0, x1, y0);
      ctx.fillText(`R = ${prm.R.toFixed(2)} Ω`, 250, y0 - 20);

      wire(x1, y0, x1, 78);
      coil(x1, 78, 142);
      wire(x1, 142, x1, y1);
      ctx.textAlign = "left";
      ctx.fillText(`L = ${prm.L.toFixed(2)} H`, x1 + 26, 112);
      ctx.textAlign = "center";

      // bottom edge: capacitor, plates vertical, tinted by charge sign
      wire(x1, y1, 289, y1);
      wire(277, y1, x0, y1);
      wire(277, 162, 277, 198);
      wire(289, 162, 289, 198);
      const frac = Math.min(1, Math.abs(vc) / (V0 * 2));
      ctx.globalAlpha = 0.15 + 0.55 * frac;
      ctx.fillStyle = vc >= 0 ? P.accent : P.moss;
      ctx.fillRect(279, 163, 8, 34);
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.muted;
      ctx.fillText(`C = ${prm.C.toFixed(2)} F`, 283, 212);
    }

    // current dots marching around the loop (speed ∝ i, sign gives direction)
    if (!pausedRef.current) {
      const dv = Math.max(-4, Math.min(4, ii * 2.2));
      dotsRef.current += dv;
    }
    const wTop = x1 - x0, hSide = y1 - y0, per = 2 * (wTop + hSide);
    const at = (s: number): [number, number] => {
      s = ((s % per) + per) % per;
      if (s < wTop) return [x0 + s, y0];
      s -= wTop;
      if (s < hSide) return [x1, y0 + s];
      s -= hSide;
      if (s < wTop) return [x1 - s, y1];
      s -= wTop;
      return [x0, y1 - s];
    };
    if (Math.abs(ii) > 4e-4) {
      ctx.fillStyle = P.moss;
      ctx.globalAlpha = Math.min(0.9, 0.25 + Math.abs(ii));
      const nd = Math.round(per / 34);
      for (let k = 0; k < nd; k++) {
        const [dx, dy] = at(dotsRef.current + (k * per) / nd);
        ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ---------- resonance curve (RLC only) ----------
    if (m === 2) {
      const f0 = eng.res_f();
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(RX0, RY0, RX1 - RX0, RY1 - RY0);
      ctx.fillStyle = P.muted;
      ctx.textAlign = "left";
      ctx.fillText("steady-state |I| vs drive frequency", RX0, RY0 - 10);
      const fx = (ff: number) => RX0 + ((ff - FA0) / (FA1 - FA0)) * (RX1 - RX0);
      const NS = 130;
      let amax = 1e-12;
      const amps: number[] = [];
      for (let k = 0; k < NS; k++) {
        const ff = FA0 + (k / (NS - 1)) * (FA1 - FA0);
        const a = eng.amp_at(2 * Math.PI * ff);
        amps.push(a);
        if (a > amax) amax = a;
      }
      const ay = (a: number) => RY1 - 6 - (a / amax) * (RY1 - RY0 - 24);
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < NS; k++) {
        const xx = RX0 + (k / (NS - 1)) * (RX1 - RX0);
        if (k === 0) ctx.moveTo(xx, ay(amps[k]));
        else ctx.lineTo(xx, ay(amps[k]));
      }
      ctx.stroke();
      // f0 tick
      if (f0 > FA0 && f0 < FA1) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx(f0), RY0 + 4); ctx.lineTo(fx(f0), RY1); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.gold;
        ctx.textAlign = "center";
        ctx.fillText(`f₀ = ${f0.toFixed(2)}`, Math.max(RX0 + 24, Math.min(RX1 - 24, fx(f0))), RY1 + 12);
      }
      // current drive frequency marker
      const fxc = fx(prm.f);
      ctx.strokeStyle = P.accent;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(fxc, RY0); ctx.lineTo(fxc, RY1); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(fxc, ay(eng.amp_at(2 * Math.PI * prm.f)), 3.2, 0, Math.PI * 2);
      ctx.fill();
      if (Math.abs(prm.f - f0) < Math.max(0.015, 0.04 * f0)) {
        ctx.fillStyle = P.gold;
        ctx.textAlign = "center";
        ctx.fillText("resonance!", Math.max(RX0 + 30, Math.min(RX1 - 30, fxc)), RY0 + 14);
      }
    }

    // ---------- oscilloscope ----------
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(SX0, SY0, SX1 - SX0, SY1 - SY0);
    // second lines, scrolling with the trace
    ctx.globalAlpha = 0.5;
    for (let gx = SX1 - (tnow % 1) * PX_PER_SEC; gx > SX0; gx -= PX_PER_SEC) {
      ctx.beginPath(); ctx.moveTo(gx, SY0); ctx.lineTo(gx, SY1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const mid = (SY0 + SY1) / 2;
    ctx.beginPath(); ctx.moveTo(SX0, mid); ctx.lineTo(SX1, mid); ctx.stroke();

    // autoscale, eased so the scope doesn't jump-cut
    const count = countRef.current, head = headRef.current;
    let maxV = 0, maxI = 0;
    for (let j = 0; j < count; j++) {
      const idx = (head - 1 - j + NBUF) % NBUF;
      const av = Math.max(Math.abs(bufV.current[idx]), Math.abs(bufS.current[idx]));
      if (av > maxV) maxV = av;
      const aiv = Math.abs(bufI.current[idx]);
      if (aiv > maxI) maxI = aiv;
    }
    vScaleRef.current += (Math.max(maxV, 0.25) - vScaleRef.current) * 0.1;
    iScaleRef.current += (Math.max(maxI, 0.05) - iScaleRef.current) * 0.1;
    const half = (SY1 - SY0) / 2 - 8;
    const trace = (buf: Float64Array, scale: number, color: string, width: number, dash: number[]) => {
      if (count < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let j = count - 1; j >= 0; j--) {
        const idx = (head - 1 - j + NBUF) % NBUF;
        const xx = SX1 - j * DX;
        const yy = mid - (buf[idx] / scale) * half;
        if (j === count - 1) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(SX0, SY0, SX1 - SX0, SY1 - SY0);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    trace(bufS.current, vScaleRef.current, P.muted, 1, [3, 4]);
    ctx.globalAlpha = 1;
    trace(bufI.current, iScaleRef.current, P.moss, 1.5, []);
    trace(bufV.current, vScaleRef.current, P.accent, 2, []);

    // τ markers: dashed verticals at 1τ, 2τ, 3τ after the last switch flip
    if (m < 2) {
      for (let k = 1; k <= 3; k++) {
        const xE = SX1 - (tnow - (switchTRef.current + k * tau)) * PX_PER_SEC;
        if (xE < SX0 + 4 || xE > SX1 - 2) continue;
        ctx.strokeStyle = P.gold;
        ctx.globalAlpha = 0.85 / k;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(xE, SY0 + 4); ctx.lineTo(xE, SY1 - 4); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.gold;
        ctx.textAlign = "center";
        ctx.fillText(`${k}τ`, xE, SY0 + 30);
      }
    }
    ctx.restore();

    // legend + live numbers
    const vName = m === 1 ? "v_L" : "v_C";
    ctx.textAlign = "left";
    ctx.fillStyle = P.accent;
    ctx.fillRect(SX0 + 10, SY0 + 10, 8, 3);
    ctx.fillText(vName, SX0 + 22, SY0 + 15);
    ctx.fillStyle = P.moss;
    ctx.fillRect(SX0 + 62, SY0 + 10, 8, 3);
    ctx.fillText("i", SX0 + 74, SY0 + 15);
    ctx.fillStyle = P.muted;
    ctx.fillRect(SX0 + 94, SY0 + 10, 8, 3);
    ctx.fillText("v_src", SX0 + 106, SY0 + 15);
    ctx.textAlign = "right";
    const vShown = m === 1 ? vl : vc;
    ctx.fillText(`${vName} = ${vShown.toFixed(2)} V · i = ${ii.toFixed(2)} A`, SX1 - 10, SY0 + 15);

    // annotation above the scope
    ctx.fillStyle = P.muted;
    if (m === 0) ctx.fillText(`τ = RC = ${tau.toFixed(2)} s — one τ gets you 63% of the way`, SX1, SY0 - 8);
    else if (m === 1) ctx.fillText(`τ = L/R = ${tau.toFixed(2)} s`, SX1, SY0 - 8);
    else ctx.fillText(`f = ${prm.f.toFixed(2)} Hz · f₀ = ${eng.res_f().toFixed(2)} Hz`, SX1, SY0 - 8);
    ctx.textAlign = "left";
  }, []);

  // load wasm + run the loop once the section is near
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/circuits.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        // honor whatever the visitor already clicked while the wasm was loading
        eng.set_mode(modeRef.current);
        eng.set_params(prmRef.current.R, prmRef.current.L, prmRef.current.C, V0, prmRef.current.f);
        eng.set_switch(swRef.current ? 1 : 0);
        paletteRef.current = readPalette();
        setReady(true);
        const tick = () => {
          if (!pausedRef.current) {
            eng.step();
            const h = headRef.current;
            bufV.current[h] = modeRef.current === 1 ? eng.v_ind() : eng.v_cap();
            bufI.current[h] = eng.i_now();
            bufS.current[h] = eng.v_src();
            headRef.current = (h + 1) % NBUF;
            countRef.current = Math.min(countRef.current + 1, NBUF);
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
  }, [draw]);

  // ---- controls ----
  const pushParams = (p: { R: number; C: number; L: number; f: number }) => {
    prmRef.current = p;
    engineRef.current?.set_params(p.R, p.L, p.C, V0, p.f);
    const now = Date.now();
    if (now - lastBumpRef.current > 1500) {
      lastBumpRef.current = now;
      bumpVibe("curiosity", 3);
    }
  };
  const onR = (v: number) => { setR(v); pushParams({ ...prmRef.current, R: v }); };
  const onC = (v: number) => { setCc(v); pushParams({ ...prmRef.current, C: v }); };
  const onL = (v: number) => { setLl(v); pushParams({ ...prmRef.current, L: v }); };
  const onF = (v: number) => { setF(v); pushParams({ ...prmRef.current, f: v }); };

  const clearScope = () => {
    headRef.current = 0;
    countRef.current = 0;
    switchTRef.current = 0;
    dotsRef.current = 0;
    vScaleRef.current = V0;
    iScaleRef.current = 1;
  };

  const changeMode = (m: number) => {
    if (m === modeRef.current) return;
    modeRef.current = m;
    setMode(m);
    swRef.current = true;
    setSw(true);
    const eng = engineRef.current;
    if (eng) { eng.set_mode(m); eng.set_switch(1); }
    clearScope();
    bumpVibe("curiosity", 8);
  };

  const flipSwitch = () => {
    if (modeRef.current === 2) return;
    const next = !swRef.current;
    swRef.current = next;
    setSw(next);
    const eng = engineRef.current;
    if (eng) {
      eng.set_switch(next ? 1 : 0);
      switchTRef.current = eng.t();
    }
    bumpVibe("curiosity", 6);
  };

  const resetSim = () => {
    engineRef.current?.reset();
    clearScope();
  };

  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };

  // ---- pointer interaction on the canvas ----
  const toCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const applyFreq = (px: number) => {
    const ff = FA0 + ((px - RX0) / (RX1 - RX0)) * (FA1 - FA0);
    onF(Math.min(FMAX, Math.max(FMIN, Math.round(ff * 200) / 200)));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    const [px, py] = toCanvas(e);
    if (modeRef.current < 2 && py < 210) {
      flipSwitch();
    } else if (modeRef.current === 2 && px >= RX0 - 8 && px <= RX1 + 8 && py >= RY0 - 8 && py <= RY1 + 16) {
      dragFRef.current = true;
      canvasRef.current?.setPointerCapture(e.pointerId);
      applyFreq(px);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragFRef.current) return;
    applyFreq(toCanvas(e)[0]);
  };
  const endDrag = () => { dragFRef.current = false; };

  const btn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onSet: (v: number) => void,
  ) => (
    <label key={label} className="flex min-w-[220px] flex-1 items-center gap-2 font-mono text-[11px] text-muted">
      <span className="w-3 text-fg">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onSet(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-accent"
        aria-label={`${label} slider`}
      />
      <span className="w-[74px] text-right tabular-nums">{value.toFixed(2)} {unit}</span>
    </label>
  );

  const tauUi = mode === 0 ? R * Cc : Ll / R;
  const f0Ui = 1 / (2 * Math.PI * Math.sqrt(Ll * Cc));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {MODE_NAMES.map((name, m) => (
          <button key={name} onClick={() => changeMode(m)} className={btn(mode === m)}>{name}</button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        {mode < 2 && (
          <button onClick={flipSwitch} className={btn(false)}>
            {sw ? "open the switch" : "close the switch"}
          </button>
        )}
        <button onClick={togglePause} className={btn(false)}>{paused ? "play" : "pause"}</button>
        <button onClick={resetSim} className={btn(false)}>reset</button>
        <span className="font-mono text-[11px] text-muted">rk4 · 2.4 kHz · C++</span>
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
          className="block h-auto w-full cursor-pointer touch-none select-none"
          aria-label="interactive circuit simulator: schematic and oscilloscope"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="font-mono text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">winding the coils…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right font-mono text-[10px] leading-relaxed text-muted/70">
          {mode < 2 ? (
            <>tap the schematic to flip the switch<br />τ marked in gold on the scope</>
          ) : (
            <>drag on the response curve to hunt the peak<br />f₀ marked in gold — that&apos;s resonance</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
        {slider("R", R, 0.05, 10, 0.05, "Ω", onR)}
        {mode !== 1 && slider("C", Cc, 0.1, 5, 0.05, "F", onC)}
        {mode !== 0 && slider("L", Ll, 0.1, 5, 0.05, "H", onL)}
        {mode === 2 && slider("f", f, FMIN, FMAX, 0.005, "Hz", onF)}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the differential equations, running in C++</p>
        {mode === 0 && (
          <>
            <p>KVL&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;V₀·[switch] = R·i + v_C,&nbsp;&nbsp;i = C·dv_C/dt</p>
            <p>charge&nbsp;&nbsp;&nbsp;v_C(t) = V₀(1 − e^(−t/RC))&nbsp;&nbsp;·&nbsp;&nbsp;discharge&nbsp;&nbsp;v_C(t) = V₀·e^(−t/RC)</p>
            <p>τ = RC = {tauUi.toFixed(2)} s — after one τ you&apos;re 63% there; after five, done-ish.</p>
          </>
        )}
        {mode === 1 && (
          <>
            <p>KVL&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;V₀·[switch] = L·di/dt + R·i</p>
            <p>rise&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;i(t) = (V₀/R)(1 − e^(−t·R/L)),&nbsp;&nbsp;τ = L/R = {tauUi.toFixed(2)} s</p>
            <p>the coil hates change in current. opening a real switch here draws an arc; the simulation just decays politely.</p>
          </>
        )}
        {mode === 2 && (
          <>
            <p>KVL&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;V₀·sin(ωt) = L·di/dt + R·i + q/C,&nbsp;&nbsp;ω = 2πf</p>
            <p>impedance&nbsp;&nbsp;|Z| = √(R² + (ωL − 1/ωC)²),&nbsp;&nbsp;I = V₀/|Z|</p>
            <p>resonance&nbsp;&nbsp;f₀ = 1/(2π√(LC)) = {f0Ui.toFixed(2)} Hz — where ωL cancels 1/ωC and only R is left to argue.</p>
          </>
        )}
        <p>integrated with RK4 at 2,400 substeps per second. mash the sliders; it will not blow up.</p>
      </div>
    </div>
  );
}
