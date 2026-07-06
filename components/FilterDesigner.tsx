"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// canvas resolutions (CSS scales them responsively; the math lives in Hz & dB)
const BW = 840, BH = 320;          // bode magnitude plot
const WW = 840, WH = 190;          // waveform lab
const DB_TOP = 10, DB_BOT = -60;   // bode y-range
const NPTS = 201;                  // must match cpp/filter.cpp

// log sliders: positions are log10(value); C++ clamps to the same ranges
const SL = {
  r: { lo: 0, hi: 6, def: 3, unit: "Ω", label: "R" },      // 1 Ω .. 1 MΩ
  l: { lo: -6, hi: 1, def: -1, unit: "H", label: "L" },     // 1 µH .. 10 H
  c: { lo: -12, hi: -3, def: -8, unit: "F", label: "C" },   // 1 pF .. 1 mF
} as const;
type SKey = keyof typeof SL;
const SL_DEF = { r: SL.r.def, l: SL.l.def, c: SL.c.def };

const TOPOS = [
  { name: "RC low-pass", art: "in ─R─●─ out · C to gnd", blurb: "highs leak to ground through C. corner at fc = 1/2πRC." },
  { name: "CR high-pass", art: "in ─C─●─ out · R to gnd", blurb: "C blocks the slow stuff. same corner, other side of it." },
  { name: "RLC band-pass", art: "in ─L─C─●─R─ gnd · out across R", blurb: "the LC pair only conducts near f₀ = 1/2π√LC. R sets how picky (Q = 2πf₀L/R)." },
  { name: "RLC notch", art: "in ─R─●─ out · L─C to gnd", blurb: "at f₀ the LC leg is a dead short, one frequency falls in and never returns." },
];

const BRIEFS = [
  "a clean 1 kHz tone, recorded onto a 40-year-old cassette. lose the hiss, keep the tone.",
  "the classic: mains hum crawled in through the ground. 60 Hz has to go, the music stays.",
  "junk on both sides of the signal. one corner will not cut it, you need a filter with a middle.",
  "the PA is feeding back at exactly 1 kHz, mid-song. cut the squeal, spare everything around it.",
  "one carrier, two kills at −24 dB on the flanks. this is the final. act like it.",
];
const HINTS = [
  "one R, one C. slide the corner into the gap between tone and hiss.",
  "same two parts, opposite corner. blocking lows is the whole job description of CR.",
  "try the band-pass: park f₀ = 1/2π√LC on the tone, and the ends trim themselves.",
  "the notch is a sniper. aim f₀ with C (watch the f₀ readout), walk it on with − / +, then R sets the wound width.",
  "narrow band-pass: center 3 kHz, then drop R (or raise L) until both flanks are −24 down.",
];
const WINS = [
  "spec met. the hiss is gone and the tone never noticed.",
  "spec met. the hum is dead. the mains can only watch.",
  "spec met. trimmed at both ends, untouched in the middle.",
  "spec met. the squeal is surgically gone. the band plays on.",
  "all five specs met. you may now describe yourself as an analog person at parties.",
];

type Engine = {
  memory: WebAssembly.Memory;
  n_levels: () => number;
  level_name: (i: number) => number;
  load_level: (i: number) => void;
  n_components: () => number;
  comp_freq: (i: number) => number;
  comp_amp: (i: number) => number;
  comp_label: (i: number) => number;
  n_specs: () => number;
  spec_freq: (i: number) => number;
  spec_db: (i: number) => number;
  spec_is_pass: (i: number) => number;
  set_topology: (t: number) => void;
  set_rlc: (r: number, l: number, c: number) => void;
  sweep: () => void;
  freq_ptr: () => number;
  mag_ptr: () => number;
  mag_db_at: (f: number) => number;
  spec_pass: () => number;
  out_amp: (i: number) => number;
  sig_in: (t: number) => number;
  sig_out: (t: number) => number;
};

type CompInfo = { f: number; amp: number; label: string };
type SpecInfo = { f: number; db: number; isPass: boolean };

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

// 2200 -> "2.20 kΩ", 1e-7 -> "100 nF", engineering notation, three sig figs
function fmtEng(v: number, unit: string) {
  if (!isFinite(v) || v <= 0) return `, ${unit}`;
  const P: [number, string][] = [
    [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"],
  ];
  for (const [m, p] of P) {
    if (v >= m * 0.99995) {
      const x = v / m;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return `${s} ${p}${unit}`;
    }
  }
  return `${v.toExponential(1)} ${unit}`;
}
function fmtF(f: number) {
  if (!isFinite(f) || f <= 0) return ", ";
  if (f >= 1e6) return `${(f / 1e6).toFixed(1)} MHz`;
  if (f >= 1000) {
    const k = f / 1000;
    return `${k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1).replace(/\.0$/, "") : k.toFixed(2).replace(/\.?0+$/, "")} kHz`;
  }
  return `${f >= 100 ? f.toFixed(0) : f >= 10 ? f.toFixed(1).replace(/\.0$/, "") : f.toFixed(2)} Hz`;
}

export function FilterDesigner() {
  const bodeRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const tRef = useRef(0); // signal-time scroll offset, wrapped mod 1 s (all freqs are integer Hz)
  const paletteRef = useRef<Palette>({
    accent: "#bf5b32", gold: "#a98729", moss: "#5f7350", muted: "#6f6a5c",
    line: "#e4ddcb", fg: "#26241e", surface: "#fffdf7",
  });
  const bodeDirtyRef = useRef(true);
  const hoverRef = useRef<number | null>(null); // 0..1 across the bode plot, or null

  // the draw loop reads these refs; react state mirrors them for the chrome
  const levelRef = useRef(0);
  const topoRef = useRef(0);
  const slRef = useRef({ ...SL_DEF });
  const compsRef = useRef<CompInfo[]>([]);
  const specsRef = useRef<SpecInfo[]>([]);
  const maskRef = useRef(0);
  const solvedRef = useRef<boolean[]>([]);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [levelNames, setLevelNames] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [solved, setSolved] = useState<boolean[]>([]);
  const [topo, setTopo] = useState(0);
  const [sl, setSl] = useState({ ...SL_DEF });
  const [comps, setComps] = useState<CompInfo[]>([]);
  const [specs, setSpecs] = useState<SpecInfo[]>([]);
  const [mask, setMask] = useState(0);
  const [outs, setOuts] = useState<number[]>([]);
  const [msg, setMsg] = useState("");

  const readStr = useCallback((ptr: number) => {
    const b = new Uint8Array(engineRef.current!.memory.buffer);
    let e = ptr;
    while (b[e]) e++;
    return new TextDecoder().decode(b.subarray(ptr, e));
  }, []);

  // ---- the bode magnitude plot ----
  const drawBode = useCallback(() => {
    const c = bodeRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    const X = (f: number) => ((Math.log10(f) - 1) / 4) * BW;
    const Y = (db: number) => ((DB_TOP - db) / (DB_TOP - DB_BOT)) * BH;
    const Yc = (db: number) => Math.min(BH + 4, Math.max(-4, Y(db)));

    ctx.clearRect(0, 0, BW, BH);
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";

    // log-f grid: decades solid-ish, in-decade lines whisper-faint
    ctx.lineWidth = 1;
    ctx.strokeStyle = P.line;
    for (let d = 1; d <= 5; d++) {
      for (let m = 1; m < 10; m++) {
        const f = m * Math.pow(10, d);
        if (f > 100000) break;
        const x = X(f);
        ctx.globalAlpha = m === 1 ? 0.9 : 0.25;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BH); ctx.stroke();
      }
    }
    for (let db = 0; db >= DB_BOT; db -= 10) {
      ctx.globalAlpha = db === 0 ? 0.9 : 0.3;
      ctx.beginPath(); ctx.moveTo(0, Y(db)); ctx.lineTo(BW, Y(db)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.muted;
    const XLAB: [number, string][] = [[10, "10"], [100, "100"], [1000, "1k"], [10000, "10k"], [100000, "100k"]];
    for (const [f, s] of XLAB) {
      const x = X(f);
      ctx.fillText(s + (f === 10 ? " Hz" : ""), f === 100000 ? x - 34 : x + 4, BH - 6);
    }
    for (const db of [0, -20, -40, -60]) ctx.fillText(`${db} dB`, 4, Y(db) - 4);

    // spec gates: moss = the curve must clear the bar, clay = it must duck it
    const gw = 26;
    const sps = specsRef.current;
    const mk = maskRef.current;
    for (let i = 0; i < sps.length; i++) {
      const sp = sps[i];
      const ok = ((mk >> i) & 1) === 1;
      const gx = X(sp.f);
      const gy = Y(sp.db);
      const col = sp.isPass ? P.moss : P.accent;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.13;
      ctx.fillRect(gx - gw / 2, 0, gw, gy);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx - gw / 2, gy); ctx.lineTo(gx + gw / 2, gy); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, BH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillText(`${sp.isPass ? "≥" : "≤"}${sp.db}`, gx + gw / 2 + 3, gy + (sp.isPass ? -4 : 12));
      ctx.fillStyle = ok ? P.moss : P.accent;
      ctx.fillText(ok ? "✓" : "✗", gx - 4, 14);
    }

    // the response itself
    const magArr = new Float64Array(eng.memory.buffer, eng.mag_ptr(), NPTS);
    const fArr = new Float64Array(eng.memory.buffer, eng.freq_ptr(), NPTS);
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < NPTS; i++) {
      const x = X(fArr[i]);
      const y = Yc(magArr[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // a dot on the curve at each spec frequency, colored by verdict
    for (let i = 0; i < sps.length; i++) {
      const sp = sps[i];
      const ok = ((mk >> i) & 1) === 1;
      ctx.beginPath();
      ctx.arc(X(sp.f), Yc(eng.mag_db_at(sp.f)), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = ok ? P.moss : P.accent;
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // hover crosshair readout
    const hv = hoverRef.current;
    if (hv !== null) {
      const f = Math.pow(10, 1 + 4 * hv);
      const db = eng.mag_db_at(f);
      const x = X(f);
      ctx.strokeStyle = P.fg;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, Yc(db), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = P.fg;
      ctx.fill();
      ctx.fillText(`${fmtF(f)} · ${db.toFixed(1)} dB`, Math.min(Math.max(x + 8, 4), BW - 120), 28);
    }
  }, []);

  // ---- the waveform lab: min/max envelope per column, so 600 cycles of
  // hiss render as an honest fuzz band instead of aliasing soup ----
  const drawWave = useCallback(() => {
    const c = waveRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    if (!c || !ctx || !eng) return;
    const P = paletteRef.current;
    const cs = compsRef.current;
    ctx.clearRect(0, 0, WW, WH);
    if (!cs.length) return;

    let fmin = cs[0].f;
    for (const k of cs) if (k.f < fmin) fmin = k.f;
    const span = 2.5 / fmin; // ~2.5 periods of the slowest component
    const t0 = tRef.current;
    let A = 0;
    for (const k of cs) A += k.amp;
    A = Math.max(A, 1e-6) * 1.1;
    const Yv = (v: number) => WH / 2 - (v / A) * (WH / 2 - 8);

    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, WH / 2); ctx.lineTo(WW, WH / 2); ctx.stroke();

    const COL = 2, SUB = 5;
    for (let pass = 0; pass < 2; pass++) {
      const fn = pass === 0 ? eng.sig_in : eng.sig_out;
      ctx.fillStyle = pass === 0 ? P.muted : P.accent;
      ctx.globalAlpha = pass === 0 ? 0.4 : 0.95;
      for (let x = 0; x < WW; x += COL) {
        let mn = Infinity, mx = -Infinity;
        for (let s = 0; s < SUB; s++) {
          const v = fn(t0 + ((x + (s / SUB) * COL) / WW) * span);
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        const y0 = Yv(mx);
        ctx.fillRect(x, y0, COL, Math.max(1.6, Yv(mn) - y0));
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = P.muted;
    ctx.fillText("in", 8, 15);
    ctx.fillStyle = P.accent;
    ctx.fillText("out", 28, 15);
    ctx.fillStyle = P.muted;
    const ms = span * 1000;
    ctx.fillText(`${ms >= 10 ? ms.toFixed(0) : ms.toFixed(1)} ms window`, WW - 100, 15);
  }, []);

  // ---- push the knobs into C++, re-sweep, judge the specs ----
  const recompute = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.set_topology(topoRef.current);
    eng.set_rlc(
      Math.pow(10, slRef.current.r),
      Math.pow(10, slRef.current.l),
      Math.pow(10, slRef.current.c),
    );
    eng.sweep();
    const m = eng.spec_pass();
    maskRef.current = m;
    setMask(m);
    setOuts(compsRef.current.map((_, i) => eng.out_amp(i)));
    bodeDirtyRef.current = true;

    const ns = specsRef.current.length;
    if (ns > 0 && m === (1 << ns) - 1) {
      const li = levelRef.current;
      if (!solvedRef.current[li]) {
        solvedRef.current[li] = true;
        setSolved([...solvedRef.current]);
        setUnlocked((u) => Math.max(u, li + 1));
        setMsg(WINS[li] ?? "spec met.");
        bumpVibe("gamer", 12);
        bumpVibe("curiosity", 6);
      }
    }
  }, []);

  const loadLevel = useCallback((i: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.load_level(i);
    levelRef.current = i;
    setLevel(i);
    const cs: CompInfo[] = [];
    for (let j = 0; j < eng.n_components(); j++)
      cs.push({ f: eng.comp_freq(j), amp: eng.comp_amp(j), label: readStr(eng.comp_label(j)) });
    compsRef.current = cs;
    setComps(cs);
    const sps: SpecInfo[] = [];
    for (let j = 0; j < eng.n_specs(); j++)
      sps.push({ f: eng.spec_freq(j), db: eng.spec_db(j), isPass: eng.spec_is_pass(j) === 1 });
    specsRef.current = sps;
    setSpecs(sps);
    topoRef.current = 0;
    setTopo(0);
    slRef.current = { ...SL_DEF };
    setSl({ ...SL_DEF });
    setMsg("");
    recompute();
    bumpVibe("curiosity", 3);
  }, [recompute, readStr]);

  // ---- load wasm + start the loop when the section is near ----
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const buf = await fetch("/filter.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const eng = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = eng;
        const nm: string[] = [];
        for (let i = 0; i < eng.n_levels(); i++) nm.push(readStr(eng.level_name(i)));
        setLevelNames(nm);
        solvedRef.current = new Array(nm.length).fill(false);
        setSolved(new Array(nm.length).fill(false));
        paletteRef.current = readPalette();
        loadLevel(0);
        setReady(true);
        const tick = (ts: number) => {
          const dt = Math.min(0.05, lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0);
          lastTsRef.current = ts;
          const cs = compsRef.current;
          if (cs.length) {
            let fmin = cs[0].f;
            for (const k of cs) if (k.f < fmin) fmin = k.f;
            // scroll ~0.35 fundamental periods per real second; every level's
            // frequencies are integer Hz, so wrapping at 1 s is seamless
            tRef.current = (tRef.current + dt * (0.35 / fmin)) % 1;
          }
          drawWave();
          if (bodeDirtyRef.current) {
            bodeDirtyRef.current = false;
            drawBode();
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const c = bodeRef.current;
    if (c && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { io?.disconnect(); io = null; load(); }
      }, { rootMargin: "400px" });
      io.observe(c);
    } else load();

    const mo = new MutationObserver(() => {
      paletteRef.current = readPalette();
      bodeDirtyRef.current = true;
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      io?.disconnect();
      mo.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [drawBode, drawWave, loadLevel, readStr]);

  // ---- interaction ----
  const pickTopo = (t: number) => {
    topoRef.current = t;
    setTopo(t);
    recompute();
    bumpVibe("curiosity", 3);
  };
  const setSlider = (k: SKey, v: number) => {
    if (!isFinite(v)) return;
    const cfg = SL[k];
    const nv = Math.min(cfg.hi, Math.max(cfg.lo, v));
    slRef.current = { ...slRef.current, [k]: nv };
    setSl({ ...slRef.current });
    recompute();
  };
  const nudge = (k: SKey, d: number) => {
    setSlider(k, slRef.current[k] + d);
    bumpVibe("curiosity", 1);
  };
  const onBodeMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = bodeRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    hoverRef.current = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    bodeDirtyRef.current = true;
  };
  const onBodeLeave = () => {
    hoverRef.current = null;
    bodeDirtyRef.current = true;
  };

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-accent hover:text-accent"
    }`;

  const rV = Math.pow(10, sl.r), lV = Math.pow(10, sl.l), cV = Math.pow(10, sl.c);
  const fKnee = topo < 2 ? 1 / (2 * Math.PI * rV * cV) : 1 / (2 * Math.PI * Math.sqrt(lV * cV));
  const qVal = topo >= 2 ? (2 * Math.PI * fKnee * lV) / rV : 0;
  const nSpecs = specs.length;
  const allPass = nSpecs > 0 && mask === (1 << nSpecs) - 1;
  const lastLevel = level === levelNames.length - 1;

  if (failed)
    return <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* level picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted">level</span>
        {levelNames.map((nm, i) => {
          const locked = i > unlocked;
          return (
            <button
              key={nm}
              onClick={() => loadLevel(i)}
              disabled={locked || !ready}
              title={locked ? "meet the previous spec first" : ""}
              className={`${chip(level === i)} ${locked ? "cursor-not-allowed opacity-40" : ""}`}
            >
              {i + 1}. {nm}{solved[i] ? " ✓" : ""}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted">
          {ready ? `${solved.filter(Boolean).length}/${levelNames.length} specs signed off` : ""} · C++
        </span>
      </div>

      {ready && (
        <p className="text-[11px] leading-relaxed text-muted">
          {BRIEFS[level]}{" "}
          <span className="text-muted/70">({HINTS[level]})</span>
        </p>
      )}

      {/* the signal on the bench */}
      {ready && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
          <span className="uppercase tracking-widest text-muted/70">signal</span>
          {comps.map((k, i) => {
            const out = outs[i] ?? 0;
            const dbc = out > 1e-9 ? `${(20 * Math.log10(out / k.amp)).toFixed(1)} dB` : "−∞ dB";
            return (
              <span key={i}>
                {k.label} <span className="text-fg">{k.amp.toFixed(2)}</span>
                {" → "}
                <span className="text-accent">{out.toFixed(2)}</span>
                <span className="text-muted/70"> ({dbc})</span>
              </span>
            );
          })}
        </div>
      )}

      {/* topology chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted">topology</span>
        {TOPOS.map((t, i) => (
          <button key={t.name} onClick={() => pickTopo(i)} disabled={!ready} title={t.blurb} className={chip(topo === i)}>
            {t.name}
          </button>
        ))}
      </div>
      <p className="font-mono text-[11px] text-muted">
        <span className="text-fg">{TOPOS[topo].art}</span>, {TOPOS[topo].blurb}{" "}
        <span className="text-gold">
          {topo < 2 ? `fc ≈ ${fmtF(fKnee)}` : `f₀ ≈ ${fmtF(fKnee)} · Q ≈ ${qVal >= 100 ? qVal.toFixed(0) : qVal.toFixed(1)}`}
        </span>
      </p>

      {/* bode magnitude plot */}
      <div className="panel relative overflow-hidden">
        <canvas
          ref={bodeRef}
          width={BW}
          height={BH}
          onPointerMove={onBodeMove}
          onPointerLeave={onBodeLeave}
          className="block h-auto w-full cursor-crosshair select-none"
        />
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse text-sm text-muted">warming up the soldering iron…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 text-right text-[10px] leading-relaxed text-muted/70">
          |H| in dB vs frequency · hover for a readout<br />
          green gate: clear the bar · clay gate: duck under it
        </p>
      </div>

      {/* spec verdicts */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted">spec</span>
        {specs.map((sp, i) => {
          const ok = ((mask >> i) & 1) === 1;
          return (
            <span
              key={i}
              className={`rounded-md border px-2.5 py-1 font-mono text-[11px] ${
                ok ? "border-moss/60 text-moss" : "border-accent/60 text-accent"
              }`}
            >
              {sp.isPass ? "pass" : "kill"} {fmtF(sp.f)} {sp.isPass ? "≥" : "≤"} {sp.db} dB {ok ? "✓" : "✗"}
            </span>
          );
        })}
        <button
          onClick={() => loadLevel(level)}
          disabled={!ready}
          className="ml-auto text-[10px] text-muted underline decoration-line underline-offset-2 transition hover:text-accent"
        >
          reset bench
        </button>
      </div>

      {/* win banner */}
      {allPass && msg && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-moss/50 bg-surface px-4 py-2.5 text-[11px] text-moss">
          <span>{msg}</span>
          {!lastLevel && (
            <button
              onClick={() => loadLevel(level + 1)}
              className="rounded-md border border-moss/60 px-3 py-1 font-bold transition hover:bg-moss/10"
            >
              next level →
            </button>
          )}
        </div>
      )}

      {/* the knobs: log sliders with vernier buttons */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(SL) as SKey[]).map((k) => {
          const cfg = SL[k];
          const used = k !== "l" || topo >= 2;
          const val = Math.pow(10, sl[k]);
          return (
            <div key={k} className={`panel p-3 transition ${used ? "" : "opacity-40"}`}>
              <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
                <span className="text-muted">
                  {cfg.label} = <span className="text-fg">{fmtEng(val, cfg.unit)}</span>
                </span>
                <span className="flex gap-1">
                  <button
                    onClick={() => nudge(k, -0.01)}
                    disabled={!used || !ready}
                    aria-label={`${cfg.label} down a hair`}
                    className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted transition hover:border-accent hover:text-accent disabled:pointer-events-none"
                  >
                    −
                  </button>
                  <button
                    onClick={() => nudge(k, 0.01)}
                    disabled={!used || !ready}
                    aria-label={`${cfg.label} up a hair`}
                    className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted transition hover:border-accent hover:text-accent disabled:pointer-events-none"
                  >
                    +
                  </button>
                </span>
              </div>
              <input
                type="range"
                min={cfg.lo}
                max={cfg.hi}
                step={0.005}
                value={sl[k]}
                onChange={(e) => setSlider(k, Number(e.target.value))}
                onPointerUp={() => bumpVibe("curiosity", 2)}
                disabled={!used || !ready}
                aria-label={`${cfg.label}, log scale`}
                className="w-full accent-accent"
              />
              {!used && <p className="mt-1 text-[10px] text-muted/70">not in this circuit</p>}
            </div>
          );
        })}
      </div>

      {/* waveform lab: in vs out, steady state */}
      <div className="panel relative overflow-hidden">
        <canvas ref={waveRef} width={WW} height={WH} className="block h-auto w-full select-none" />
        <p className="pointer-events-none absolute bottom-2 right-4 text-right text-[10px] text-muted/70">
          faint: what goes in · clay: what comes out, steady state, the transient gave up long ago
        </p>
      </div>

      {/* the fine print */}
      <div className="panel p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the math, running in C++</p>
        <p>transfer&nbsp;&nbsp;&nbsp;RC: 1/(1+jωRC) · CR: jωRC/(1+jωRC) · band-pass: R/(R+jX) · notch: jX/(R+jX), with X = ωL − 1/ωC</p>
        <p>magnitude&nbsp;&nbsp;|H| needs only sqrt, the one math instruction wasm has. dB = 20·log10|H|, judged at each spec frequency.</p>
        <p>log10&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;no libm, so: x = m·2ᵏ, ln m = 2·artanh((m−1)/(m+1)) summed to t¹¹, log10 = ln/ln10. the log-f grid is one hand-computed constant, 10^(1/50), multiplied 200 times.</p>
        <p>phase&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;∠H from a minimax atan; the output trace is Σ aᵢ·|H(fᵢ)|·sin(2πfᵢt + ∠H(fᵢ)), pure steady state, no ODE was integrated in the making of this filter.</p>
      </div>
    </div>
  );
}
