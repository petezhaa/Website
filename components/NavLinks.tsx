"use client";

import { useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

const SECTIONS = [
  { id: "work", label: "work" },
  { id: "projects", label: "projects" },
  { id: "play", label: "arcade" },
  { id: "about", label: "about" },
  { id: "parks", label: "parks" },
  { id: "films", label: "watching" },
  { id: "games", label: "playing" },
  { id: "stats", label: "stats" },
  { id: "chinawok", label: "chinawok" },
  { id: "contact", label: "contact" },
];

// Highlights the section you're currently in: the last section whose top
// has crossed a line 40% down the viewport. Deterministic, no flicker.
export function NavLinks() {
  const [active, setActive] = useState("");
  const visited = useRef(new Set<string>());

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const line = window.innerHeight * 0.4;
      let current = "";
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = s.id;
      }
      // reaching a section for the first time is exploring, nav or not
      if (current && !visited.current.has(current)) {
        visited.current.add(current);
        if (visited.current.size > 1) bumpVibe("explorer", 8);
      }
      setActive(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav className="hidden items-center gap-1 font-mono text-xs lg:flex">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={() => bumpVibe("explorer", 12)}
          className={`px-1.5 py-0.5 transition ${
            active === s.id
              ? "text-accent before:text-accent before:content-['~/']"
              : "text-muted hover:text-accent"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
