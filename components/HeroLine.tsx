"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

// The small line above the headline changes every visit.
const KICKERS = [
  "Student engineer at UW–Madison",
  "Currently at NVIDIA, Santa Clara",
  "Triple major, allegedly sleeping",
  "Probably debugging something",
  "Maps, GPUs, and a bot that texts back",
  "Turning coffee into firmware",
];

export function HeroLine() {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    setI(Math.floor(Math.random() * KICKERS.length));
  }, []);

  return (
    <div>
      <motion.p
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-muted"
      >
        {KICKERS[i]}
      </motion.p>
      <h1 className="font-serif text-5xl font-medium leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.4rem]">
        Between the hardware
        <br />
        and the{" "}
        <em className="italic text-accent">software</em>.
      </h1>
    </div>
  );
}
