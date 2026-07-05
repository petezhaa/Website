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
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="panel group flex h-full flex-col p-5 transition-colors hover:border-accent/60"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-mono text-base font-bold tracking-tight">
          <span className="text-accent">&gt; </span>
          {project.name}
        </h3>
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {project.timeframe}
        </span>
      </div>
      <p className="mt-2 text-[15px]">{project.quip}</p>
      <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
        {project.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {project.tags.map((tag) => (
          <span key={tag} className="chip px-2 py-0.5 text-[10px] uppercase tracking-wider">
            {tag}
          </span>
        ))}
      </div>
    </motion.article>
  );
}
