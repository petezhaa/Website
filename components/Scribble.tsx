"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// A hand-drawn squiggle that draws itself under a word when scrolled into
// view. Sized in ems so it hugs the text at any font size, with a
// non-scaling stroke so the line weight stays consistent.
export function Underline({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="relative inline-block">
      {children}
      <motion.svg
        viewBox="0 0 200 10"
        aria-hidden
        className="absolute left-0 w-full overflow-visible"
        style={{ height: "0.28em", bottom: "-0.18em" }}
        preserveAspectRatio="none"
        initial={reduceMotion ? undefined : { clipPath: "inset(0 100% 0 0)" }}
        whileInView={reduceMotion ? undefined : { clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.5, ease: "easeInOut" }}
      >
        <path
          d="M4 6 C 45 2.5, 95 8.5, 140 5.5 S 185 4, 196 5.5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </motion.svg>
    </span>
  );
}

// A handwritten margin note, slightly rotated, like a pen annotation.
export function HandNote({
  children,
  className = "",
  rotate = -3,
}: {
  children: ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.7 }}
      style={{ rotate, fontFamily: "var(--font-hand)" }}
      className={`inline-block text-lg leading-tight text-muted ${className}`}
    >
      {children}
    </motion.span>
  );
}
