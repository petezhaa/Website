"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { foundSecret } from "@/lib/vibeBus";

// Hand-drawn sun: a wobbly core with uneven rays.
function DoodleSun() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.2 7.4c2.6-.4 4.5 1.8 4.4 4.3-.2 2.5-2.1 4.1-4.5 3.9-2.2-.2-3.7-2-3.6-4.2.1-2 1.7-3.7 3.7-4z" />
      <path d="M12 2.4v2" />
      <path d="M12.2 19.7l-.2 1.9" />
      <path d="M2.5 12.2l2.1-.2" />
      <path d="M19.5 12l2.1.1" />
      <path d="M5.1 5.4l1.5 1.3" />
      <path d="M17.5 17.4l1.4 1.5" />
      <path d="M18.8 5.1l-1.3 1.5" />
      <path d="M6.6 17.5l-1.5 1.3" />
    </svg>
  );
}

// Hand-drawn crescent moon with a little sparkle.
function DoodleMoon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13.6 4.2c-2.2 1.1-3.7 3.4-3.6 6 .2 3.3 2.9 5.9 6.2 5.8.8 0 1.5-.2 2.2-.5-1.2 2.5-3.7 4.2-6.6 4.1-3.9-.1-7-3.4-6.9-7.3.1-4 3.4-7.2 7.3-7.2.5 0 .9 0 1.4.1z" />
      <path d="M17.6 4.6l.3 1.4 1.4.4-1.4.4-.4 1.3-.3-1.3-1.3-.4 1.4-.4z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  const flips = useRef<number[]>([]); // recent toggle timestamps

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Smooth full-frame cross-fade via the View Transitions API (the fade curve
  // lives in globals.css). No support (Firefox) or reduced-motion → instant swap.
  const inFlight = useRef(false);
  const runToggle = () => {
    // four flips in five seconds: indecision, formally recognized
    const now = Date.now();
    flips.current = [...flips.current.filter((t) => now - t < 5000), now];
    if (flips.current.length >= 4) foundSecret("indecisive");
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    const apply = () => {
      root.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      setDark(next);
    };
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // no support, reduced motion, or a flip already animating → instant.
    // stacking view transitions is exactly the flicker it looks like.
    if (!doc.startViewTransition || reduce || inFlight.current) {
      apply();
      return;
    }
    inFlight.current = true;
    // the body's own 0.25s color transition would keep fading UNDER the
    // crossfade snapshot (a double animation that reads as a glitch) —
    // suppress it for the duration so the crossfade is the only motion
    root.classList.add("theme-flip");
    const vt = doc.startViewTransition(apply);
    vt.finished.finally(() => {
      root.classList.remove("theme-flip");
      inFlight.current = false;
    });
  };

  // the chatbot can flip the theme via a window event ({{act:theme}})
  useEffect(() => {
    window.addEventListener("theme-toggle", runToggle);
    return () => window.removeEventListener("theme-toggle", runToggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      onClick={runToggle}
      aria-label="Toggle dark mode"
      className="grid h-8 w-8 place-items-center rounded-[2px] border border-line text-muted transition hover:border-accent hover:text-accent"
    >
      {/* keyed so the icon pops in with a little spin on each toggle */}
      <motion.span
        key={String(dark)}
        initial={dark === null ? false : { scale: 0.4, rotate: -90, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 16 }}
        className="grid place-items-center"
      >
        {dark ? <DoodleSun /> : <DoodleMoon />}
      </motion.span>
    </button>
  );
}
