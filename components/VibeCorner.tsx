"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getVibe, getVibeSamples, type Vibe } from "@/lib/vibeBus";
import { VibeRadar } from "@/components/VibeRadar";

// Bottom-left floating radar of the visitor's behavior on this site.
export function VibeCorner() {
  const [open, setOpen] = useState(false);
  const [vibe, setVibe] = useState<Vibe>(getVibe());
  const [samples, setSamples] = useState(0);

  useEffect(() => {
    const update = () => {
      setVibe(getVibe());
      setSamples(getVibeSamples());
    };
    update();
    window.addEventListener("vibe", update);
    return () => window.removeEventListener("vibe", update);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Your vibe graph"
        title="your vibe graph"
        className="fixed bottom-5 left-5 z-[70] grid h-12 w-12 place-items-center rounded-full border border-line bg-surface shadow-lg transition hover:border-accent"
      >
        {/* tiny pentagon icon */}
        <svg viewBox="0 0 20 20" className="h-5 w-5">
          <polygon
            points="10,2 18,8 15,17 5,17 2,8"
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        {samples > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            style={{ transformOrigin: "bottom left" }}
            className="panel fixed bottom-20 left-5 z-[70] p-5 shadow-2xl"
          >
            <VibeRadar vibe={vibe} samples={samples} />
            <p className="mt-2.5 max-w-64 text-center font-mono text-[11px] leading-snug text-muted">
              ask the bot to analyze your personality, it can see this
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
