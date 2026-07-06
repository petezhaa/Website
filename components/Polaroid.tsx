"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";

// A snapshot that behaves like one: it pops up with a spring when you scroll
// to it, sits at a lazy angle, straightens when you hover, and click blows it
// up like someone handing you the photo.
export function Polaroid({
  src,
  alt,
  caption,
  width,
  height,
  round = false,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  round?: boolean; // clip the photo to a circle (for circular source images)
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <>
      <motion.button
        type="button"
        onClick={() => {
          setOpen(true);
          bumpVibe("curiosity", 12);
          foundSecret("family-album"); // you looked closer. that counts.
        }}
        aria-label={`enlarge photo: ${caption}`}
        initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -14, y: 26 }}
        whileInView={{ opacity: 1, scale: 1, rotate: -2.5, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        whileHover={reduce ? undefined : { rotate: 0, scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 210, damping: 15 }}
        className="block w-full cursor-zoom-in rounded-sm border border-line bg-surface p-3 pb-2 shadow-lg"
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          unoptimized
          className={round ? "w-full rounded-full" : "w-full"}
        />
        <p className="mt-2 text-center font-serif text-sm italic text-muted">{caption}</p>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[95] grid cursor-zoom-out place-items-center bg-bg/85 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={reduce ? false : { scale: 0.5, rotate: 6 }}
              animate={{ scale: 1, rotate: -1 }}
              exit={{ scale: 0.6, rotate: 5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="w-full max-w-lg rounded-sm border border-line bg-surface p-4 pb-3 shadow-2xl"
            >
              <Image
                src={src}
                alt={alt}
                width={width * 2}
                height={height * 2}
                unoptimized
                className={round ? "w-full rounded-full" : "w-full"}
              />
              <p className="mt-3 text-center font-serif text-base italic text-muted">{caption}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
