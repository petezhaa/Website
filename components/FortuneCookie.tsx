"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// Crack a cookie, get a fortune. The fortunes are house-written and the
// lucky numbers are load-bearing.
const FORTUNES = [
  "You will order the General Tso's. — Confucius, probably",
  "A wok paid for this website's hosting. Honor it.",
  "He who reads personal websites is hungry within the hour.",
  "Your code compiles on the first try today. Order accordingly.",
  "The person who taught me work ethic is currently working a fryer.",
  "Great fortune awaits. It is crab rangoon shaped.",
  "You have already scrolled this far. The egg rolls are closer than you think.",
  "A 4.7-star restaurant does not miss. Neither should you.",
  "Beware of C-tier takes. Zion sends its regards.",
  "Lucky numbers: 4, 7, 63, 1901, 6371",
];

export function FortuneCookie() {
  const [fortune, setFortune] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const crack = () => {
    // don't repeat the last fortune; the cookie has standards
    setFortune((prev) => {
      let next = prev;
      while (next === prev) next = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      return next;
    });
    setCount((c) => {
      if (c + 1 >= 5) foundSecret("fortunate"); // five cookies is commitment
      return c + 1;
    });
    bumpVibe("chaos", 8);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        onClick={crack}
        whileHover={{ rotate: [-2, 3, -2], transition: { duration: 0.5 } }}
        whileTap={{ scale: 0.85, rotate: 12 }}
        aria-label="crack a fortune cookie"
        className="text-5xl"
        title="crack it"
      >
        🥠
      </motion.button>
      <AnimatePresence mode="wait">
        {fortune && (
          <motion.div
            key={fortune}
            initial={{ opacity: 0, scaleX: 0.2, y: -6 }}
            animate={{ opacity: 1, scaleX: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="panel max-w-64 px-4 py-2 text-center shadow-md"
          >
            <p className="font-mono text-lg leading-snug text-fg">{fortune}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="font-mono text-[10px] text-muted">
        {fortune ? (count > 3 ? "the cookies are not a meal. order food." : "crack another") : "crack the cookie"}
      </p>
    </div>
  );
}
