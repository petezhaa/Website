"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// the Smith chart lives in the reflection-coefficient plane: a unit disk.
// C++ owns the complex arithmetic; this file owns the canvas and the chips.
const SIZE = 640;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE * 0.435; // margin left for the ±jx labels on the rim
const SUB = 64;         // arc samples per element (C++ clamps to 80)
const WIN_G = 0.1;      // |Γ| below this = matched (VSWR < 1.22)
const R_CIRCLES = [0.2, 0.5, 1, 2, 5];
const X_ARCS = [0.2, 0.5, 1, 2, 5];

type Engine = {
  memory: WebAssembly.Memory;
  n_levels: () => number;
  n_slots: () => number;
  level_name: (i: number) => number;
  level_par: (i: number) => number;
  load_level: (i: number) => void;
  zl_re: () => number;
  zl_im: () => number;
  freq_hz: () => number;
  set_elem: (slot: number, kind: number, value: number) => void;
  gamma_mag: () => number;
  vswr: () => number;
  z_re: () => number;
  z_im: () => number;
  matched: () => number;
  trace: (sub: number) => number;
  trace_ptr: () => number;
};

type Slot = { kind: number; t: number }; // t: log-slider position in [0,1]
type Out = { gm: number; vswr: number; zr: number; zi: number; matched: boolean };

// kinds: 0 empty, 1 series L, 2 series C, 3 shunt L, 4 shunt C
const KIND_LABEL = ["empty", "series L", "series C", "shunt L", "shunt C"];
const isL = (k: number) => k === 1 || k === 3;

// log sliders: t in [0,1] maps L to [1 nH, 10 µH] and C to [0.1 pF, 1 nF]
const valueOf = (kind: number, t: number) =>
  kind === 0 ? 0 : isL(kind) ? 1e-9 * Math.pow(10, 4 * t) : 1e-13 * Math.pow(10, 4 * t);

const HINTS = [
  "a 100 Ω load on a 50 Ω line. twice the resistance it should have. talk it down gently.",
  "25 − j40. the one every textbook uses. there is a reason.",
  "this load is secretly sitting on a special circle already. one part. choose wisely.",
  "big, lazy, slightly capacitive. maybe deal with it in admittance first.",
  "433 MHz — the garage-door band. the parts get smaller up here; the chart does not.",
  "915 MHz and a high-Q load hugging the rim. small slider moves, big dot moves. breathe.",
];

const fmtZ = (re: number, im: number, d = 1) =>
  `${re.toFixed(d)} ${im >= 0 ? "+" : "−"} j${Math.abs(im).toFixed(d)}`;
const fmtF = (f: number) => `${(f / 1e6).toFixed(0)} MHz`;
const fmtVal = (kind: number, v: number) => {
  if (isL(kind)) {
    const nH = v * 1e9;
    return nH >= 1000 ? `${(nH / 1000).toFixed(2)} µH` : `${nH.toFixed(1)} nH`;
  }
  const pF = v * 1e12;
  return pF >= 100 ? `${pF.toFixed(0)} pF` : pF >= 10 ? `${pF.toFixed(1)} pF` : `${pF.toFixed(2)} pF`;
};
const fmtOhm = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)} kΩ` : `${x.toFixed(1)} Ω`);
const fmtSie = (b: number) =>
  b >= 1 ? `${b.toFixed(2)} S` : b >= 1e-3 ? `${(b * 1e3).toFixed(2)} mS` : `${(b * 1e6).toFixed(1)} µS`;
const elemReadout = (kind: number, v: number, f: number) => {
  const w = 2 * Math.PI * f;
  if (kind === 1) return `jX = +${fmtOhm(w * v)}`;
  if (kind === 2) return `jX = −${fmtOhm(1 / (w * v))}`;
  if (kind === 3) return `jB = −${fmtSie(1 / (w * v))}`;
  if (kind === 4) return `jB = +${fmtSie(w * v)}`;
  return "";
};

const readOut = (eng: Engine): Out => ({
  gm: eng.gamma_mag(),
  vswr: eng.vswr(),
  zr: eng.z_re(),
  zi: eng.z_im(),
  matched: eng.matched() === 1,
});

type Palette = { accent: string; muted: string; line: string; fg: string; gold: string; moss: string };
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    accent: v("--accent", "#bf5b32"),
    muted: v("--muted", "#6f6a5c"),
    line: v("--line", "#e4ddcb"),
    fg: v("--fg", "#26241e"),
    gold: v("--gold", "#a98729"),
    moss: v("--moss", "#5f7350"),
  };
}

export function SmithChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const paletteRef = useRef<Palette>({
    accent: "#bf5b32", muted: "#6f6a5c", line: "#e4ddcb", fg: "#26241e", gold: "#a98729", moss: "#5f7350",
  });
  const vibeTickRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [level, setLevel] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [pars, setPars] = useState<number[]>([]);
  const [solved, setSolved] = useState<boolean[]>([]);
  const [slots, setSlots] = useState<Slot[]>(
    Array.from({ length: 3 }, () => ({ kind: 0, t: 0.5 })),
  );
  const [load, setLoad] = useState({ zr: 100, zi: 0, f: 100e6 });
  const [out, setOut] = useState<Out>({ gm: 1 / 3, vswr: 2, zr: 100, zi: 0, matched: false });

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  // ---- the chart itself ----
  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    const gx = (re: number) => CX + re * R;
    const gy = (im: number) => CY - im * R; // canvas y is flipped; +jx on top

    ctx.clearRect(0, 0, SIZE, SIZE);

    // faint disk so the chart reads as an object in both themes
    ctx.fillStyle = P.line;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // grid, clipped to the unit disk
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.strokeStyle = P.muted;
    for (const r of R_CIRCLES) {
      // constant-resistance circles: center (r/(1+r), 0), radius 1/(1+r)
      ctx.globalAlpha = r === 1 ? 0.55 : 0.26;
      ctx.beginPath();
      ctx.arc(gx(r / (1 + r)), gy(0), R / (1 + r), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const x of X_ARCS) {
      // constant-reactance arcs: center (1, ±1/x), radius 1/x
      ctx.globalAlpha = x === 1 ? 0.42 : 0.26;
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.arc(gx(1), gy(s / x), R / x, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(gx(-1), gy(0));
    ctx.lineTo(gx(1), gy(0));
    ctx.stroke();
    ctx.restore();

    // rim
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = P.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.stroke();

    // labels
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = P.muted;
    ctx.globalAlpha = 0.75;
    for (const r of R_CIRCLES) ctx.fillText(String(r), gx((r - 1) / (r + 1)), gy(0) + 10);
    ctx.fillText("0", gx(-1) - 11, gy(0));
    ctx.fillText("∞", gx(1) + 11, gy(0));
    for (const x of X_ARCS) {
      for (const s of [1, -1]) {
        // where the ±jx arc meets the rim: Γ of a pure reactance jx
        const d = 1 + x * x;
        const gr = (x * x - 1) / d;
        const gi = (2 * x * s) / d;
        ctx.fillText(`${s > 0 ? "+" : "−"}j${x}`, CX + gr * (R + 18), CY - gi * (R + 18));
      }
    }
    ctx.globalAlpha = 1;

    // the bullseye: |Γ| < 0.1 is home
    ctx.fillStyle = P.moss;
    ctx.globalAlpha = 0.13;
    ctx.beginPath();
    ctx.arc(CX, CY, WIN_G * R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = P.moss;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, WIN_G * R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(CX, CY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // the walk: load point, then one arc per element, sampled in C++
    const count = eng.trace(SUB);
    const buf = new Float64Array(eng.memory.buffer, eng.trace_ptr(), count * 2);
    const px = (i: number) => gx(buf[2 * i]);
    const py = (i: number) => gy(buf[2 * i + 1]);
    const nSeg = Math.max(0, Math.round((count - 1) / SUB));

    ctx.strokeStyle = P.accent;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let s = 0; s < nSeg; s++) {
      const a = s * SUB;
      const e = Math.min(a + SUB, count - 1);
      ctx.globalAlpha = 0.45 + 0.55 * ((s + 1) / nSeg);
      ctx.lineWidth = 2.25;
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      for (let k = a + 1; k <= e; k++) ctx.lineTo(px(k), py(k));
      ctx.stroke();
      // arrowhead at the end of this element's arc
      let j = e - 1;
      while (j > a && Math.hypot(px(e) - px(j), py(e) - py(j)) < 6) j--;
      const dx = px(e) - px(j);
      const dy = py(e) - py(j);
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        const ux = dx / m, uy = dy / m;
        ctx.beginPath();
        ctx.moveTo(px(e) - ux * 9 - uy * 4.5, py(e) - uy * 9 + ux * 4.5);
        ctx.lineTo(px(e), py(e));
        ctx.lineTo(px(e) - ux * 9 + uy * 4.5, py(e) - uy * 9 - ux * 4.5);
        ctx.stroke();
      }
      // a small joint marker where one element hands off to the next
      if (s > 0) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px(a), py(a), 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // the load: where you start
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.arc(px(0), py(0), 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 11px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText("Z_L", px(0), py(0) - 13);

    // the dot: where you are now
    const last = count - 1;
    const isM = eng.matched() === 1;
    ctx.save();
    ctx.shadowColor = isM ? P.moss : P.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = isM ? P.moss : P.accent;
    ctx.beginPath();
    ctx.arc(px(last), py(last), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, []);

  // ---- load wasm lazily, watch the theme ----
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/smith.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        const n = eng.n_levels();
        const nm: string[] = [];
        const pr: number[] = [];
        for (let i = 0; i < n; i++) {
          nm.push(readStr(eng.level_name(i)));
          pr.push(eng.level_par(i));
        }
        setNames(nm);
        setPars(pr);
        setSolved(new Array(n).fill(false));
        setSlots(Array.from({ length: eng.n_slots() }, () => ({ kind: 0, t: 0.5 })));
        eng.load_level(0);
        setLoad({ zr: eng.zl_re(), zi: eng.zl_im(), f: eng.freq_hz() });
        setOut(readOut(eng));
        paletteRef.current = readPalette();
        setReady(true);
        requestAnimationFrame(draw);
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

    const mo = new MutationObserver(() => {
      paletteRef.current = readPalette();
      draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      io?.disconnect();
      mo.disconnect();
    };
  }, [draw, readStr]);

  // ---- game actions ----
  const afterChange = (eng: Engine, vibeAmt: number) => {
    const o = readOut(eng);
    setOut(o);
    if (o.matched && !solved[level]) {
      const sv = [...solved];
      sv[level] = true;
      setSolved(sv);
      bumpVibe("gamer", 16);
    } else if (vibeAmt > 0) {
      bumpVibe("curiosity", vibeAmt);
    }
    draw();
  };

  const pickLevel = (i: number) => {
    const eng = engineRef.current;
    if (!eng || i < 0 || i >= names.length) return;
    if (i !== 0 && !solved[i] && !solved[i - 1]) return; // locked
    eng.load_level(i);
    setLevel(i);
    setSlots(slots.map(() => ({ kind: 0, t: 0.5 })));
    setLoad({ zr: eng.zl_re(), zi: eng.zl_im(), f: eng.freq_hz() });
    setOut(readOut(eng));
    bumpVibe("curiosity", 3);
    draw();
  };

  const setKind = (si: number, kind: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const next = slots.map((s, i) => (i === si ? { ...s, kind } : s));
    setSlots(next);
    eng.set_elem(si, kind, valueOf(kind, next[si].t));
    afterChange(eng, 2);
  };

  const setSlider = (si: number, t: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const kind = slots[si].kind;
    setSlots(slots.map((s, i) => (i === si ? { ...s, t } : s)));
    if (kind === 0) return;
    eng.set_elem(si, kind, valueOf(kind, t));
    vibeTickRef.current++;
    afterChange(eng, vibeTickRef.current % 30 === 0 ? 2 : 0);
  };

  const clearNetwork = () => {
    const eng = engineRef.current;
    if (!eng) return;
    setSlots(slots.map((s) => ({ ...s, kind: 0 })));
    for (let i = 0; i < slots.length; i++) eng.set_elem(i, 0, 0);
    afterChange(eng, 1);
  };

  const used = slots.filter((s) => s.kind !== 0).length;
  const allSolved = solved.length > 0 && solved.every(Boolean);
  const parQuip =
    used < (pars[level] ?? 2)
      ? "under par. show-off."
      : used === (pars[level] ?? 2)
        ? "dead on par."
        : "over par, but the wave forgives you.";

  const chip = (active: boolean, locked = false) =>
    `rounded-md border px-2.5 py-1 text-[11px] transition ${
      locked
        ? "cursor-not-allowed border-line text-muted opacity-40"
        : active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  if (failed)
    return <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* level picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">level</span>
        {names.map((nm, i) => {
          const unlocked = i === 0 || solved[i] || solved[i - 1];
          return (
            <button
              key={nm}
              disabled={!unlocked}
              onClick={() => pickLevel(i)}
              title={unlocked ? nm : "locked — match the previous load first"}
              className={chip(level === i, !unlocked)}
            >
              {solved[i] ? "✓ " : ""}{i + 1}
            </button>
          );
        })}
        <span className="text-[11px] text-muted">· match one to unlock the next</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        {/* the chart */}
        <div className="panel relative self-start overflow-hidden">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="block h-auto w-full select-none"
          />
          {!ready && !failed && (
            <div className="absolute inset-0 grid place-items-center bg-surface/90">
              <p className="animate-pulse text-sm text-muted">calibrating the network analyzer…</p>
            </div>
          )}
          <p className="pointer-events-none absolute bottom-3 left-4 text-[10px] leading-relaxed text-muted/70">
            series parts ride the R-circles · shunt parts ride the G-circles<br />
            walk the dot to the bullseye
          </p>
        </div>

        {/* mission + network + readouts */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="panel p-4">
            <p className="text-[10px] uppercase tracking-widest text-accent">
              level {level + 1} · {names[level] ?? "…"}
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-fg">
              Z_L = {fmtZ(load.zr, load.zi)} Ω
            </p>
            <p className="font-mono text-[11px] text-muted">
              z = {fmtZ(load.zr / 50, load.zi / 50, 2)} normalized · f = {fmtF(load.f)} · Z₀ = 50 Ω
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{HINTS[level]}</p>
            <p className="mt-1.5 font-mono text-[10px] text-muted">
              goal: |Γ| &lt; 0.10 · par {pars[level] ?? 2} element{(pars[level] ?? 2) === 1 ? "" : "s"}
            </p>
          </div>

          {/* the matching network, load side first */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] uppercase tracking-widest text-muted">matching network</span>
            {used > 0 && (
              <button
                onClick={clearNetwork}
                className="text-[10px] text-muted underline decoration-line underline-offset-2 transition hover:text-accent"
              >
                clear all
              </button>
            )}
          </div>
          {slots.map((s, si) => (
            <div key={si} className="panel p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-muted">
                  slot {si + 1}
                  {si === 0 ? " · load side" : si === slots.length - 1 ? " · source side" : ""}
                </span>
                {s.kind !== 0 && (
                  <button
                    onClick={() => setKind(si, 0)}
                    className="text-[10px] text-muted underline decoration-line underline-offset-2 transition hover:text-accent"
                  >
                    remove
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4].map((k) => (
                  <button key={k} onClick={() => setKind(si, k)} className={chip(s.kind === k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {s.kind !== 0 && (
                <div className="mt-2.5">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.002}
                    value={s.t}
                    onChange={(e) => setSlider(si, Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                    aria-label={`slot ${si + 1} ${KIND_LABEL[s.kind]} value`}
                  />
                  <div className="flex justify-between font-mono text-[10px] text-muted">
                    <span className="font-bold text-fg">{fmtVal(s.kind, valueOf(s.kind, s.t))}</span>
                    <span>{elemReadout(s.kind, valueOf(s.kind, s.t), load.f)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* readouts + win state */}
          <div className="panel p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted">|Γ|</p>
                <p className={`font-mono text-3xl font-bold ${out.matched ? "text-moss" : "text-fg"}`}>
                  {out.gm.toFixed(3)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted">vswr</p>
                <p className={`font-mono text-3xl font-bold ${out.matched ? "text-moss" : "text-fg"}`}>
                  {out.vswr >= 99 ? ">99" : out.vswr.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-md bg-surface-2">
              <div
                className={`h-full rounded-md transition-all ${out.matched ? "bg-moss" : "bg-accent"}`}
                style={{ width: `${Math.max(2, (1 - Math.min(1, out.gm)) * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 font-mono text-[10.5px] text-muted">
              <span>Z_in = {fmtZ(out.zr, out.zi)} Ω</span>
              <span>RL {out.gm <= 1e-4 ? ">80" : (-20 * Math.log10(out.gm)).toFixed(1)} dB</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted">pass line: |Γ| &lt; 0.10 · vswr &lt; 1.22</p>

            {out.matched && (
              <div className="mt-3 rounded-md border border-moss/50 bg-moss/10 p-3">
                <p className="text-[12px] font-bold text-moss">
                  matched. the power goes where you point it.
                </p>
                <p className="mt-0.5 text-[10.5px] text-muted">
                  {used} element{used === 1 ? "" : "s"} · par {pars[level] ?? 2} · {parQuip}
                </p>
                {level + 1 < names.length ? (
                  <button
                    onClick={() => { pickLevel(level + 1); bumpVibe("gamer", 4); }}
                    className="btn-solid mt-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
                  >
                    next level →
                  </button>
                ) : (
                  allSolved && (
                    <p className="mt-1.5 text-[10.5px] text-moss">
                      all six loads matched. the reflected wave has nothing left to say.
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* explainer */}
      <div className="panel p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the math, running in C++</p>
        <p>reflection&nbsp;&nbsp;Γ = (Z − Z₀)/(Z + Z₀)&nbsp;&nbsp;(the whole chart is this complex number&apos;s plane: center = nothing bounces back, rim = everything does)</p>
        <p>series L/C&nbsp;&nbsp;z′ = z + jX/Z₀, X = ωL or −1/ωC&nbsp;&nbsp;(a series part can&apos;t change resistance → the dot rides a constant-R circle)</p>
        <p>shunt L/C&nbsp;&nbsp;y′ = 1/z + jB·Z₀, B = ωC or −1/ωL&nbsp;&nbsp;(a shunt part can&apos;t change conductance → a constant-G circle, the same family mirrored)</p>
        <p>vswr&nbsp;&nbsp;(1 + |Γ|)/(1 − |Γ|)&nbsp;&nbsp;(what the standing wave on the line does about your choices)</p>
        <p>no trig anywhere — the chart is a Möbius map of the right half z-plane, and every slider tick re-walks ~200 points of it in C++.</p>
      </div>
    </div>
  );
}
