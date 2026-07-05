"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

const W = 720;
const H = 460;
const TWO_PI = Math.PI * 2;
const BASE_SCALE = 3.4 / W; // complex units per pixel at zoom 1

type Engine = {
  memory: WebAssembly.Memory;
  buf_ptr: () => number;
  render: (w: number, h: number, cx: number, cy: number, scale: number, maxIter: number) => number;
};

// Inigo-Quilez cosine palette, warmed to fit the site (gold/teal/rust cycle)
function buildPalette(): Uint8ClampedArray {
  const a = [0.55, 0.42, 0.32], b = [0.45, 0.42, 0.45], c = [1, 1, 1], d = [0.0, 0.1, 0.25];
  const pal = new Uint8ClampedArray(256 * 3);
  pal[0] = 10; pal[1] = 12; pal[2] = 10; // inside the set
  for (let i = 1; i < 256; i++) {
    const t = i / 255;
    for (let k = 0; k < 3; k++) {
      pal[i * 3 + k] = 255 * (a[k] + b[k] * Math.cos(TWO_PI * (c[k] * t + d[k])));
    }
  }
  return pal;
}

export function MandelbrotExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const palRef = useRef<Uint8ClampedArray | null>(null);
  const viewRef = useRef({ cx: -0.6, cy: 0, scale: BASE_SCALE });
  const dirtyRef = useRef(true);
  const rafRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);

  const maxIterFor = (scale: number) =>
    Math.min(1400, Math.floor(150 + 60 * Math.max(0, Math.log2(BASE_SCALE / scale))));

  const render = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const eng = engineRef.current;
    const pal = palRef.current;
    if (!c || !ctx || !eng || !pal) return;
    const { cx, cy, scale } = viewRef.current;
    const n = eng.render(W, H, cx, cy, scale, maxIterFor(scale));
    const bytes = new Uint8Array(eng.memory.buffer, eng.buf_ptr(), n);
    const img = ctx.createImageData(W, H);
    const dst = img.data;
    for (let p = 0; p < n; p++) {
      const b = bytes[p] * 3;
      const o = p * 4;
      dst[o] = pal[b];
      dst[o + 1] = pal[b + 1];
      dst[o + 2] = pal[b + 2];
      dst[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const start = async () => {
      try {
        const buf = await fetch("/mandelbrot.bin").then((r) => r.arrayBuffer());
        if (cancelled) return;
        engineRef.current = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        palRef.current = buildPalette();
        setReady(true);
        const loop = () => {
          if (dirtyRef.current) { dirtyRef.current = false; render(); }
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
  }, [render]);

  // wheel zoom toward the cursor (native listener so we can preventDefault)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * W;
      const my = ((e.clientY - r.top) / r.height) * H;
      const v = viewRef.current;
      // complex point under the cursor stays fixed
      const wx = v.cx + (mx - W / 2) * v.scale;
      const wy = v.cy + (my - H / 2) * v.scale;
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      v.scale *= factor;
      v.cx = wx - (mx - W / 2) * v.scale;
      v.cy = wy - (my - H / 2) * v.scale;
      dirtyRef.current = true;
      setZoom(BASE_SCALE / v.scale);
      bumpVibe("curiosity", 4);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  const toPx = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = toPx(e);
    dragRef.current = { x: p.x, y: p.y };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toPx(e);
    const v = viewRef.current;
    v.cx -= (p.x - d.x) * v.scale;
    v.cy -= (p.y - d.y) * v.scale;
    d.x = p.x; d.y = p.y;
    dirtyRef.current = true;
  };
  const onUp = () => { dragRef.current = null; };

  const reset = () => {
    viewRef.current = { cx: -0.6, cy: 0, scale: BASE_SCALE };
    dirtyRef.current = true;
    setZoom(1);
  };
  const zoomBtn = (factor: number) => {
    const v = viewRef.current;
    v.scale *= factor;
    dirtyRef.current = true;
    setZoom(BASE_SCALE / v.scale);
  };

  const fmtZoom = (z: number) => (z >= 1000 ? `${(z / 1000).toFixed(1)}k×` : `${z.toFixed(z < 10 ? 1 : 0)}×`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => zoomBtn(0.5)} className="h-8 w-8 rounded-lg border border-line font-mono text-sm text-muted transition hover:border-accent hover:text-accent">+</button>
        <button onClick={() => zoomBtn(2)} className="h-8 w-8 rounded-lg border border-line font-mono text-sm text-muted transition hover:border-accent hover:text-accent">−</button>
        <button onClick={reset} className="rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] text-muted transition hover:border-accent hover:text-accent">reset</button>
        <span className="font-mono text-[11px] text-muted">{ready ? `zoom ${fmtZoom(zoom)} · ${maxIterFor(viewRef.current.scale)} iters/px · C++` : "loading…"}</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="font-mono text-sm text-muted">couldn&apos;t load the wasm engine.</p>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">iterating…</p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] text-muted/70">
          scroll to zoom · drag to pan
        </p>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        <p className="mb-1 uppercase tracking-[0.2em] text-accent">the math, running in C++</p>
        <p>for each pixel c, iterate z → z² + c from z = 0.</p>
        <p>points where |z| stays bounded are the set (dark); the rest are colored by how fast they escape.</p>
        <p>that&apos;s up to {maxIterFor(viewRef.current.scale).toLocaleString()} iterations across {(W * H).toLocaleString()} pixels, every frame you move.</p>
      </div>
    </div>
  );
}
