"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MiniJVM } from "@/lib/jvm";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// Snake, running as REAL Java bytecode: java/Snake.java is compiled with
// javac, the .class ships as a static asset, and lib/jvm.ts (a ~250-line JVM
// interpreter written for this site) executes it in the browser.

const GW = 24;
const GH = 15;
const CELL = 30;
const W = GW * CELL;
const H = GH * CELL;
const BASE_MS = 130;

export function SnakeJava() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jvmRef = useRef<MiniJVM | null>(null);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);
  const aliveRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const [best, setBest] = useState(0);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const jvm = jvmRef.current;
    if (!c || !ctx || !jvm) return;
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    const surface2 = v("--surface-2", "#f1ebdd");
    const fg = v("--fg", "#26241e");
    const accent = v("--accent", "#bf5b32");
    const gold = v("--gold", "#a98729");

    ctx.clearRect(0, 0, W, H);
    // checkerboard, very faint
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if ((x + y) % 2 === 0) continue;
        ctx.fillStyle = surface2;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    ctx.globalAlpha = 1;

    const head = jvm.callInt("headIndex");
    for (let i = 0; i < GW * GH; i++) {
      const cell = jvm.callInt("cell", i);
      const x = (i % GW) * CELL, y = ((i / GW) | 0) * CELL;
      if (cell > 0) {
        ctx.fillStyle = i === head ? accent : fg;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6);
        ctx.fill();
        if (i === head) {
          // eyes, because the phone snake had personality
          ctx.fillStyle = v("--accent-fg", "#fffdf7");
          ctx.beginPath();
          ctx.arc(x + CELL * 0.35, y + CELL * 0.38, 2.4, 0, Math.PI * 2);
          ctx.arc(x + CELL * 0.65, y + CELL * 0.38, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (cell === -1) {
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, []);

  const restart = useCallback(() => {
    const jvm = jvmRef.current;
    if (!jvm) return;
    jvm.callVoid("init", GW, GH, (Date.now() & 0x7fffffff) || 1);
    aliveRef.current = true;
    setDead(false);
    setScore(0);
    draw();
  }, [draw]);

  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const start = async () => {
      try {
        const buf = await fetch("/Snake.class").then((r) => r.arrayBuffer());
        if (cancelled) return;
        jvmRef.current = new MiniJVM(buf);
        jvmRef.current.callVoid("init", GW, GH, (Date.now() & 0x7fffffff) || 1);
        setReady(true);
        setBest(Number(localStorage.getItem("snake-java-best")) || 0);
        const loop = (now: number) => {
          const jvm = jvmRef.current!;
          const speed = Math.max(65, BASE_MS - jvm.callInt("getScore") / 4);
          if (aliveRef.current && now - lastTickRef.current >= speed) {
            lastTickRef.current = now;
            const r = jvm.callInt("step");
            const s = jvm.callInt("getScore");
            setScore(s);
            if (s >= 100) foundSecret("nokia-certified");
            if (r === 2) {
              aliveRef.current = false;
              setDead(true);
              bumpVibe("gamer", 10);
              const prev = Number(localStorage.getItem("snake-java-best")) || 0;
              if (s > prev) {
                localStorage.setItem("snake-java-best", String(s));
                setBest(s);
              }
            }
            draw();
          }
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
    return () => { cancelled = true; io?.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // keyboard: arrows / wasd; space restarts when dead
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const jvm = jvmRef.current;
      if (!jvm) return;
      const dir =
        e.key === "ArrowUp" || e.key === "w" ? 0 :
        e.key === "ArrowRight" || e.key === "d" ? 1 :
        e.key === "ArrowDown" || e.key === "s" ? 2 :
        e.key === "ArrowLeft" || e.key === "a" ? 3 : -1;
      if (dir >= 0) {
        e.preventDefault();
        jvm.callVoid("setDir", dir);
      } else if (e.key === " " && !aliveRef.current) {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restart]);

  const dpad = (d: number, label: string) => (
    <button
      onPointerDown={(e) => { e.preventDefault(); jvmRef.current?.callVoid("setDir", d); }}
      aria-label={`move ${label}`}
      className="h-11 w-11 rounded-md border border-line bg-surface text-sm text-muted active:border-accent active:text-accent"
    >
      {label}
    </button>
  );

  if (failed)
    return <p className="text-sm text-muted">the JVM didn&apos;t boot. genuinely embarrassing.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted">
        <span className="text-fg">score <span className="font-bold text-accent">{score}</span></span>
        {best > 0 && <span>best {best}</span>}
        <span>arrows / wasd · it wraps</span>
      </div>
      <div className="panel relative w-full max-w-[720px] overflow-hidden">
        <canvas ref={canvasRef} width={W} height={H} className="block h-auto w-full select-none" />
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">class-loading…</p>
          </div>
        )}
        {dead && (
          <div className="absolute inset-0 grid place-items-center bg-bg/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="font-mono text-2xl font-bold">NullPointerException</p>
              <p className="mt-1 text-[11px] text-muted">(not really. you hit yourself.)</p>
              <button
                onClick={restart}
                className="btn-solid mt-4 px-5 py-2 text-xs font-bold uppercase tracking-wider"
              >
                new game (space)
              </button>
            </div>
          </div>
        )}
      </div>
      {/* phone d-pad */}
      <div className="flex flex-col items-center gap-1 sm:hidden">
        {dpad(0, "↑")}
        <div className="flex gap-1">{dpad(3, "←")}{dpad(2, "↓")}{dpad(1, "→")}</div>
      </div>
      <div className="panel p-4 text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">actual Java bytecode</p>
        <p>java/Snake.java is compiled with javac, and the raw .class file ships to your browser, where a ~250-line JVM interpreter written in TypeScript for this site (lib/jvm.ts) executes the bytecode, instruction by instruction: iload, iastore, if_icmpne, invokestatic.</p>
        <p>no plugins, no transpiling. `javap -c Snake.class` shows exactly what&apos;s running right now.</p>
      </div>
    </div>
  );
}
