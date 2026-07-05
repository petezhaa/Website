"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// The board game Go, engine written in Go (see golang/main.go), compiled to
// wasm with the standard toolchain. This component owns only the wood.

type GoAPI = {
  size: () => number;
  reset: () => void;
  board: () => number[];
  play: (x: number, y: number) => {
    ok: boolean; botPassed: boolean; botX: number; botY: number;
    capsBlack: number; capsWhite: number;
  };
  pass: () => { botPassed: boolean; botX: number; botY: number };
  score: () => { black: number; white: number };
};

declare global {
  // eslint-disable-next-line no-var
  var GoEngine: GoAPI | undefined;
  // eslint-disable-next-line no-var
  var Go: (new () => { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => Promise<void> }) | undefined;
}

const PX = 520; // canvas is square
const MARGIN = 40;

let goLoaded: Promise<GoAPI> | null = null; // singleton across mounts
function loadGo(): Promise<GoAPI> {
  if (goLoaded) return goLoaded;
  goLoaded = (async () => {
    if (!globalThis.Go) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/wasm_exec.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("wasm_exec failed"));
        document.head.appendChild(s);
      });
    }
    const go = new globalThis.Go!();
    const buf = await fetch("/goban.wasm").then((r) => r.arrayBuffer());
    const wasm = await WebAssembly.instantiate(buf, go.importObject);
    void go.run(wasm.instance); // runs forever; the API hangs off globalThis
    for (let tries = 0; tries < 100; tries++) {
      if (globalThis.GoEngine) return globalThis.GoEngine;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("GoEngine never appeared");
  })();
  return goLoaded;
}

export function GoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GoAPI | null>(null);
  const boardRef = useRef<number[]>([]);
  const lastRef = useRef<{ you: number; bot: number }>({ you: -1, bot: -1 });
  const hoverRef = useRef(-1);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [caps, setCaps] = useState({ black: 0, white: 0 });
  const [score, setScore] = useState<{ black: number; white: number } | null>(null);
  const [note, setNote] = useState("you are black. click an intersection.");

  const N = 9;
  const cell = (PX - 2 * MARGIN) / (N - 1);
  const pt = (i: number) => [MARGIN + (i % N) * cell, MARGIN + Math.floor(i / N) * cell];

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    // wood
    const g = ctx.createLinearGradient(0, 0, PX, PX);
    g.addColorStop(0, "#dcaf6b");
    g.addColorStop(1, "#c99a55");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PX, PX);
    // faint grain
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#7a5c2e";
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 22) * PX + 6 * Math.sin(i * 2.7));
      ctx.bezierCurveTo(PX / 3, (i / 22) * PX + 14, (2 * PX) / 3, (i / 22) * PX - 10, PX, (i / 22) * PX + 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // grid
    ctx.strokeStyle = "#3a2c14";
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      ctx.beginPath();
      ctx.moveTo(MARGIN, MARGIN + i * cell);
      ctx.lineTo(PX - MARGIN, MARGIN + i * cell);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(MARGIN + i * cell, MARGIN);
      ctx.lineTo(MARGIN + i * cell, PX - MARGIN);
      ctx.stroke();
    }
    // star points (9x9: corners at 2,2 and center)
    ctx.fillStyle = "#3a2c14";
    for (const [sx, sy] of [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]) {
      ctx.beginPath();
      ctx.arc(MARGIN + sx * cell, MARGIN + sy * cell, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // stones
    const b = boardRef.current;
    const r = cell * 0.46;
    for (let i = 0; i < b.length; i++) {
      if (!b[i]) continue;
      const [x, y] = pt(i);
      const grad = ctx.createRadialGradient(x - r / 3, y - r / 3, r / 6, x, y, r);
      if (b[i] === 1) {
        grad.addColorStop(0, "#555");
        grad.addColorStop(1, "#0c0c0c");
      } else {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(1, "#c9c9c9");
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // last-move markers
      const last = lastRef.current;
      if (i === last.you || i === last.bot) {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
        ctx.strokeStyle = b[i] === 1 ? "#e8e4d8" : "#3a2c14";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    // hover ghost
    const h = hoverRef.current;
    if (h >= 0 && b[h] === 0) {
      const [x, y] = pt(h);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#0c0c0c";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [cell]);

  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const start = () =>
      loadGo()
        .then((api) => {
          if (cancelled) return;
          apiRef.current = api;
          api.reset();
          boardRef.current = api.board();
          setReady(true);
          draw();
        })
        .catch(() => !cancelled && setFailed(true));
    const c = canvasRef.current;
    if (c && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io?.disconnect(); io = null; start(); } }, { rootMargin: "400px" });
      io.observe(c);
    } else start();
    return () => { cancelled = true; io?.disconnect(); };
  }, [draw]);

  const toIdx = (e: { clientX: number; clientY: number }): number => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * PX;
    const y = ((e.clientY - r.top) / r.height) * PX;
    const gx = Math.round((x - MARGIN) / cell);
    const gy = Math.round((y - MARGIN) / cell);
    if (gx < 0 || gx >= N || gy < 0 || gy >= N) return -1;
    // require the click to be reasonably near the intersection
    const dx = x - (MARGIN + gx * cell), dy = y - (MARGIN + gy * cell);
    if (dx * dx + dy * dy > (cell * 0.45) ** 2) return -1;
    return gy * N + gx;
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = toIdx(e);
    if (i !== hoverRef.current) { hoverRef.current = i; draw(); }
  };

  const onClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const api = apiRef.current;
    if (!api) return;
    const i = toIdx(e);
    if (i < 0) return;
    const res = api.play(i % N, Math.floor(i / N));
    if (!res.ok) { setNote("illegal — occupied, suicide, or ko."); return; }
    bumpVibe("gamer", 8);
    lastRef.current = { you: i, bot: res.botPassed ? -1 : res.botY * N + res.botX };
    boardRef.current = api.board();
    setCaps({ black: res.capsBlack, white: res.capsWhite });
    setScore(null);
    setNote(res.botPassed ? "the bot passed. finish your shapes." : "your move.");
    hoverRef.current = -1;
    draw();
  };

  const doPass = () => {
    const api = apiRef.current;
    if (!api) return;
    const res = api.pass();
    lastRef.current = { you: -1, bot: res.botPassed ? -1 : res.botY * N + res.botX };
    boardRef.current = api.board();
    const s = api.score();
    setScore(s);
    setNote(res.botPassed ? "both passed — count it up." : "you passed; the bot didn't.");
    draw();
  };

  const newGame = () => {
    const api = apiRef.current;
    if (!api) return;
    api.reset();
    boardRef.current = api.board();
    lastRef.current = { you: -1, bot: -1 };
    setCaps({ black: 0, white: 0 });
    setScore(null);
    setNote("you are black. click an intersection.");
    draw();
  };

  const btn = "rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] text-muted transition hover:border-accent hover:text-accent";

  if (failed)
    return <p className="font-mono text-sm text-muted">the Go engine didn&apos;t load. (ironic.)</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={newGame} className={btn}>new game</button>
        <button onClick={doPass} className={btn}>pass</button>
        <span className="font-mono text-[11px] text-muted">
          captures — you: {caps.black} · bot: {caps.white}
        </span>
        {score && (
          <span className="rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 font-mono text-[11px] text-accent">
            area score — you {score.black} · bot {score.white} ·{" "}
            {score.black > score.white ? "you lead" : score.black < score.white ? "bot leads" : "even"}
          </span>
        )}
      </div>
      <div className="relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-line">
        <canvas
          ref={canvasRef}
          width={PX}
          height={PX}
          onPointerMove={onMove}
          onPointerUp={onClick}
          onPointerLeave={() => { hoverRef.current = -1; draw(); }}
          className="block h-auto w-full cursor-pointer touch-none select-none"
        />
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">compiling tenuki…</p>
          </div>
        )}
      </div>
      <p className="font-mono text-[11px] text-muted">{note}</p>
      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">Go, written in Go</p>
        <p>the rules engine — legality, ko, capture flood-fills, area scoring, and the bot — is Go compiled to WebAssembly with the standard toolchain (golang/main.go).</p>
        <p>9×9 board. the bot is greedy, not deep: it captures when it can and grabs influence when it can&apos;t. beatable. that&apos;s the point.</p>
      </div>
    </div>
  );
}
