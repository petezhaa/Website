"use client";

import { motion, useScroll, useSpring } from "motion/react";

// Scroll progress as a strip of water filling across the top of the page.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 28,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="water-bar fixed inset-x-0 top-0 z-[60] h-1 origin-left"
    />
  );
}
