"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CompanyMark } from "@/components/CompanyMark";
import { bumpVibe } from "@/lib/vibeBus";
import type { Role } from "@/lib/resume";

// One row of the work timeline. The quip is the headline; the actual work
// (the resume bullets) unfolds on click — substance on demand.
export function WorkRole({ role, last }: { role: Role; last: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="relative grid gap-2 border-t border-line py-9 sm:grid-cols-[180px_1fr] sm:gap-8">
      {/* timeline rail — a square node, terminal-style */}
      <span
        aria-hidden
        className={`absolute -left-[21px] top-[38px] hidden h-2.5 w-2.5 border lg:block ${
          role.status === "current"
            ? "border-accent bg-accent"
            : role.status === "incoming"
            ? "border-accent bg-surface"
            : "border-line bg-surface"
        }`}
      >
        {role.status === "current" && (
          <span className="absolute inset-0 animate-ping bg-accent/60" />
        )}
      </span>
      {!last && (
        <span aria-hidden className="absolute -left-4 top-12 hidden h-full w-px bg-line lg:block" />
      )}

      <div>
        <p className="font-mono text-xs text-muted">{role.dates}</p>
        {role.status && (
          <span
            className={`chip mt-2 inline-block px-2 py-0.5 text-[10px] uppercase tracking-widest ${
              role.status === "current"
                ? "!border-accent/50 !text-accent"
                : ""
            }`}
          >
            {role.status}
          </span>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CompanyMark company={role.company} />
          <h3 className="font-mono text-xl font-bold tracking-tight">{role.company}</h3>
          <p className="text-sm text-muted">
            {role.title} · {role.location}
          </p>
        </div>
        <p className="mt-2 max-w-2xl text-[15px]">{role.quip}</p>

        {role.tags && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {role.tags.map((t) => (
              <span key={t} className="chip px-2 py-0.5 text-[10px]">
                {t}
              </span>
            ))}
          </div>
        )}

        {role.points.length > 0 && (
          <>
            <button
              onClick={() => {
                setOpen(!open);
                if (!open) bumpVibe("curiosity", 10);
              }}
              className="mt-3 font-mono text-[11px] text-accent transition hover:opacity-80"
            >
              {open ? "$ less --quit ↑" : "$ cat what_i_did.md ↓"}
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  {role.points.map((p) => (
                    <li
                      key={p.slice(0, 40)}
                      className="mt-2 max-w-2xl border-l-2 border-accent/30 pl-3 text-sm leading-relaxed text-muted first:mt-3"
                    >
                      {p}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </article>
  );
}
