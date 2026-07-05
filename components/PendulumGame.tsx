"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// The Segway balance project (Nov 2025, real hardware), minus the hardware:
// an inverted pendulum on a cart, simulated in C++ (cpp/pendulum.cpp). Your
// PID gains are the only thing holding it up. Pokes escalate. Good luck.

type Engine = {
  reset: () => void;
  set_gains: (p: number, i: number, d: number) => void;
  poke: (imp: number) => void;
  step: (dt: number) => void;
  theta: () => number;
  cart_x: () => number;
  control: () => number;
  alive_s: () => number;
  crashed: () => number;
  rail: () => number;
};

const W = 860;
const H = 380;

export function PendulumGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const gainsRef = useRef({ p: 40, i: 2, d: 6 }); // deliberately mediocre start
  const nextPokeRef = useRef(0.5);
  const crashedRef = useRef(false);
  // a poke only counts as survived after 4s upright (or the next poke lands)
  const pendingPokeRef = useRef<{ p: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gains, setGains] = useState(gainsRef.current);
  const [alive, setAlive] = useState(0);
  const [crashed, setCrashed] = useState(false);
  const [nextPoke, setNextPoke] = useState(0.5);
  const [bestPoke, setBestPoke] = useState(0);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const e = engineRef.current;
    if (!c || !ctx || !e) return;
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    const line = v("--line", "#e4ddcb");
    const fg = v("--fg", "#26241e");
    const muted = v("--muted", "#6f6a5c");
    const accent = v("--accent", "#bf5b32");
    const moss = v("--moss", "#5f7350");

    ctx.clearRect(0, 0, W, H);
    const rail = e.rail();
    const scale = (W - 80) / (2 * rail); // meters -> px
    const cx = W / 2 + e.cart_x() * scale;
    const groundY = H - 90;

    // rail + end stops
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, groundY);
    ctx.lineTo(W - 40, groundY);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillRect(34, groundY - 16, 6, 32);
    ctx.fillRect(W - 40, groundY - 16, 6, 32);

    // control-force arrow under the cart
    const u = e.control();
    if (Math.abs(u) > 0.4) {
      const len = Math.max(-70, Math.min(70, u * 2.6));
      ctx.strokeStyle = moss;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, groundY + 26);
      ctx.lineTo(cx + len, groundY + 26);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + len, groundY + 26);
      ctx.lineTo(cx + len - Math.sign(len) * 7, groundY + 21);
      ctx.moveTo(cx + len, groundY + 26);
      ctx.lineTo(cx + len - Math.sign(len) * 7, groundY + 31);
      ctx.stroke();
    }

    // cart
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.roundRect(cx - 34, groundY - 26, 68, 26, 6);
    ctx.fill();
    for (const dx of [-18, 18]) {
      ctx.beginPath();
      ctx.arc(cx + dx, groundY + 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = muted;
      ctx.fill();
    }

    // pole (θ measured from vertical)
    const th = e.theta();
    const poleLen = 150;
    const px = cx + Math.sin(th) * poleLen;
    const py = groundY - 26 - Math.cos(th) * poleLen;
    const danger = Math.min(1, Math.abs(th) / 1.2);
    ctx.strokeStyle = danger > 0.55 ? accent : fg;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, groundY - 26);
    ctx.lineTo(px, py);
    ctx.stroke();
    // bob
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    // readouts
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = muted;
    ctx.fillText(`θ ${(th * 57.2958).toFixed(1)}°`, 46, 26);
    ctx.fillText(`u ${u.toFixed(1)} m/s²`, 46, 42);
    ctx.fillText(`t ${e.alive_s().toFixed(1)}s`, 46, 58);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const start = async () => {
      try {
        const buf = await fetch("/pendulum.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const e = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engineRef.current = e;
        e.reset();
        const g = gainsRef.current;
        e.set_gains(g.p, g.i, g.d);
        setReady(true);
        const loop = (now: number) => {
          const dt = Math.min(0.05, (now - (lastRef.current || now)) / 1000);
          lastRef.current = now;
          if (!crashedRef.current) {
            e.step(dt || 1 / 60);
            setAlive(e.alive_s());
            if (e.crashed()) {
              crashedRef.current = true;
              setCrashed(true);
              bumpVibe("gamer", 12);
            }
          }
          draw();
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const c = canvasRef.current;
    if (c && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io?.disconnect(); io = null; start(); } }, { rootMargin: "400px" });
      io.observe(c);
    } else start();
    return () => { cancelled = true; io?.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  const setGain = (k: "p" | "i" | "d", val: number) => {
    const g = { ...gainsRef.current, [k]: val };
    gainsRef.current = g;
    setGains(g);
    engineRef.current?.set_gains(g.p, g.i, g.d);
  };

  const commitPending = () => {
    const pending = pendingPokeRef.current;
    if (pending && !crashedRef.current) {
      setBestPoke((b) => Math.max(b, pending.p));
      if (pending.p >= 3) foundSecret("well-tuned"); // survived a real shove
    }
    if (pending) clearTimeout(pending.timer);
    pendingPokeRef.current = null;
  };

  const doPoke = () => {
    const e = engineRef.current;
    if (!e || crashedRef.current) return;
    commitPending(); // still standing → the previous poke was survived
    const p = nextPokeRef.current;
    e.poke(Math.random() < 0.5 ? p : -p); // direction is a surprise
    pendingPokeRef.current = {
      p,
      timer: setTimeout(commitPending, 4000), // 4s upright = survived
    };
    nextPokeRef.current = Math.min(8, p + 0.5);
    setNextPoke(nextPokeRef.current);
    bumpVibe("gamer", 8);
  };

  const restart = () => {
    const e = engineRef.current;
    if (!e) return;
    // a poke that ended in a crash never counts
    if (pendingPokeRef.current) clearTimeout(pendingPokeRef.current.timer);
    pendingPokeRef.current = null;
    e.reset();
    e.set_gains(gainsRef.current.p, gainsRef.current.i, gainsRef.current.d);
    crashedRef.current = false;
    setCrashed(false);
    nextPokeRef.current = 0.5;
    setNextPoke(0.5);
  };

  const slider = (label: string, k: "p" | "i" | "d", max: number, step: number) => (
    <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
      <span className="w-6 text-fg">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={gains[k]}
        onChange={(e) => setGain(k, Number(e.target.value))}
        className="w-28 accent-[var(--accent)] sm:w-36"
      />
      <span className="w-10 tabular-nums">{gains[k]}</span>
    </label>
  );

  if (failed)
    return <p className="font-mono text-sm text-muted">the pendulum engine didn&apos;t load. it fell over, presumably.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {slider("Kp", "p", 200, 1)}
        {slider("Ki", "i", 100, 0.5)}
        {slider("Kd", "d", 60, 0.5)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={doPoke}
          disabled={!ready || crashed}
          className="rounded-lg bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90 disabled:opacity-40"
        >
          poke it ({nextPoke.toFixed(1)})
        </button>
        <button
          onClick={restart}
          className="rounded-lg border border-line px-3 py-2 font-mono text-[11px] text-muted transition hover:border-accent hover:text-accent"
        >
          reset
        </button>
        <span className="font-mono text-[11px] text-muted">
          up {alive.toFixed(0)}s · biggest poke survived: {bestPoke.toFixed(1)} rad/s
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas ref={canvasRef} width={W} height={H} className="block h-auto w-full select-none" />
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">standing up…</p>
          </div>
        )}
        {crashed && (
          <div className="absolute inset-0 grid place-items-center bg-bg/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="font-serif text-2xl">it fell over.</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                survived {alive.toFixed(1)}s · retune and try again
              </p>
              <button
                onClick={restart}
                className="mt-4 rounded-lg bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90"
              >
                stand it back up
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">control theory, running in C++</p>
        <p>plant&nbsp;&nbsp;θ̈ = (g/l)·sinθ − (u/l)·cosθ − c·θ̇&nbsp;&nbsp;(inverted pendulum on a cart)</p>
        <p>control u = Kp·θ + Ki·∫θ dt + Kd·θ̇&nbsp;&nbsp;(your three sliders — plus a fixed cart-recentering term, like a real Segway)</p>
        <p>too little Kd and it oscillates itself to death; too much Kp and it slams the rail. the sweet spot is real: I built this with actual hardware in Nov 2025, and the tuning session went exactly like yours is going.</p>
      </div>
    </div>
  );
}
