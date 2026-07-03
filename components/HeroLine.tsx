"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Underline } from "@/components/Scribble";

// The headline's middle changes every visit.
const MIDDLES = [
  "I'm a student engineer at",
  "I build things at",
  "I'm probably debugging something at",
  "I'm triple majoring, allegedly sleeping, at",
  "I make GPUs and maps behave at",
  "I'm an engineer and park ranker at",
  "I turn coffee into firmware at",
  "I'm in over my head, on purpose, at",
];

const GREETING = "Hi, I'm ";
const NAME = "Peter.";

// Letters of the greeting spring up one by one, then a hand-drawn oval
// loops itself around the name.
export function HeroLine() {
  const [i, setI] = useState(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    setI(Math.floor(Math.random() * MIDDLES.length));
  }, []);

  const letter = (ch: string, idx: number) => (
    <motion.span
      key={idx}
      className="inline-block whitespace-pre"
      initial={reduceMotion ? false : { opacity: 0, y: "0.45em", rotate: 8 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{
        type: "spring",
        stiffness: 340,
        damping: 20,
        delay: 0.15 + idx * 0.04,
      }}
    >
      {ch}
    </motion.span>
  );

  return (
    <>
      <span aria-label={`${GREETING}${NAME}`} className="inline-block">
        <span aria-hidden>{GREETING.split("").map(letter)}</span>
        <motion.span
          aria-hidden
          className="isolate relative inline-block text-accent"
          whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -2 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
        >
          {/* glowing aura that blooms in behind the name, then breathes */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-x-[0.4em] -inset-y-[0.2em] -z-10"
            initial={{ opacity: reduceMotion ? 0.3 : 0 }}
            animate={{ opacity: reduceMotion ? 0.3 : 1 }}
            transition={{ delay: 1.05, duration: 0.9 }}
          >
            <motion.span
              className="absolute inset-0 rounded-[50%]"
              style={{
                background:
                  "radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)",
                filter: "blur(18px)",
              }}
              animate={
                reduceMotion
                  ? { opacity: 0.3 }
                  : { opacity: [0.22, 0.45, 0.22], scale: [0.92, 1.08, 0.92] }
              }
              transition={
                reduceMotion
                  ? undefined
                  : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
              }
            />
          </motion.span>
          <span
            style={{
              textShadow:
                "0 0 22px color-mix(in oklab, var(--accent) 45%, transparent)",
            }}
          >
            {NAME.split("").map((ch, idx) => letter(ch, GREETING.length + idx))}
          </span>
          {/* hand-drawn oval that loops around the name once the letters land */}
          <motion.svg
            viewBox="0 0 200 80"
            aria-hidden
            className="pointer-events-none absolute -inset-x-[0.18em] -inset-y-[0.12em] h-[calc(100%+0.24em)] w-[calc(100%+0.36em)] overflow-visible"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M28 12 C 90 -2, 196 4, 197 36 C 198 66, 122 80, 62 74 C 14 69, -2 52, 6 34 C 13 18, 52 8, 108 9"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7, delay: 0.95, ease: "easeInOut" }}
            />
          </motion.svg>
        </motion.span>
      </span>{" "}
      {MIDDLES[i]}{" "}
      <Underline>
        <em className="text-accent">UW–Madison.</em>
      </Underline>
    </>
  );
}
