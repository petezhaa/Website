"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Project } from "@/lib/resume";

// Card with springy hover lift + a soft spotlight that follows the cursor.
export function ProjectCard({ project }: { project: Project }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      ref={ref}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        ref.current?.style.setProperty("--sx", `${e.clientX - rect.left}px`);
        ref.current?.style.setProperty("--sy", `${e.clientY - rect.top}px`);
      }}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface p-6 transition-colors hover:border-accent/50"
    >
      {/* cursor spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(240px circle at var(--sx, 50%) var(--sy, 50%), var(--accent-soft), transparent 70%)",
        }}
      />
      <div className="relative flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-xl tracking-tight">{project.name}</h3>
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {project.timeframe}
        </span>
      </div>
      <p className="relative mt-1.5 text-[15px]">{project.quip}</p>
      <p className="relative mt-2.5 flex-1 text-sm leading-relaxed text-muted">
        {project.description}
      </p>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted"
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.article>
  );
}
