"use client";

import { motion, useReducedMotion } from "motion/react";

export function HeroLine() {
  const reduce = useReducedMotion();
  return (
    <motion.h1
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-3xl font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.6rem]"
    >
      I study computer science, electrical engineering, and math.
    </motion.h1>
  );
}
