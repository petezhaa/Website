"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

// The headline's middle changes every visit.
const MIDDLES = [
  "a student engineer at",
  "building things at",
  "probably debugging something at",
  "triple majoring, allegedly sleeping, at",
  "making GPUs and maps behave at",
  "an engineer and park ranker at",
  "turning coffee into firmware at",
  "in over my head, on purpose, at",
];

const GREETING = "Hi, I'm ";
const NAME = "Peter.";

// Reads like a line of terminal output: the greeting types itself in, the
// name glows amber (phosphor), and a block caret blinks at the end.
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
      initial={reduceMotion ? false : { opacity: 0, y: "0.35em" }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 360,
        damping: 22,
        delay: 0.12 + idx * 0.03,
      }}
    >
      {ch}
    </motion.span>
  );

  return (
    <>
      <span aria-label={`${GREETING}${NAME}`} className="inline-block">
        <span aria-hidden>{GREETING.split("").map(letter)}</span>
        <span aria-hidden className="relative inline-block text-accent">
          {/* faint bloom behind the name — dark mode only (a black bloom on
              light paper just reads as a smudge) */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-x-[0.35em] -inset-y-[0.18em] -z-10 hidden rounded-[40%] dark:block"
            style={{
              background:
                "radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)",
              filter: "blur(16px)",
            }}
            initial={{ opacity: reduceMotion ? 0.22 : 0 }}
            animate={
              reduceMotion
                ? { opacity: 0.22 }
                : { opacity: [0.18, 0.34, 0.18] }
            }
            transition={
              reduceMotion
                ? undefined
                : { delay: 0.9, duration: 3.6, repeat: Infinity, ease: "easeInOut" }
            }
          />
          <span>
            {NAME.split("").map((ch, idx) => letter(ch, GREETING.length + idx))}
          </span>
        </span>
      </span>{" "}
      <span className="text-muted">{MIDDLES[i]}</span>{" "}
      <em className="text-accent not-italic underline decoration-accent/40 decoration-2 underline-offset-[6px]">
        UW&ndash;Madison
      </em>
      <span className="caret align-middle" aria-hidden />
    </>
  );
}
