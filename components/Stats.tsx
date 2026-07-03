"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

function Counter({ to, label }: { to: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduceMotion = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setN(to);
      return;
    }
    const t0 = performance.now();
    const duration = 1800; // slow enough that small numbers visibly climb
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, reduceMotion]);

  return (
    <div ref={ref}>
      <p className="font-mono text-2xl font-bold text-accent tabular-nums">{n}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

// counts up forever, one per second, for as long as you stay
function LiveSeconds() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div>
      <p className="font-mono text-2xl font-bold text-accent tabular-nums">
        {s.toLocaleString()}
      </p>
      <p className="mt-0.5 text-xs text-muted">seconds you&apos;ve spent here</p>
    </div>
  );
}

export function Stats() {
  return (
    <div className="flex flex-wrap gap-10">
      <Counter to={3} label="majors" />
      <Counter to={5} label="engineering roles" />
      <LiveSeconds />
    </div>
  );
}
