"use client";

import { useEffect, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

const SECTIONS = [
  { id: "work", label: "Work" },
  { id: "projects", label: "Projects" },
  { id: "play", label: "Map game" },
  { id: "about", label: "About" },
  { id: "parks", label: "Parks" },
  { id: "films", label: "Films" },
  { id: "games", label: "Games" },
  { id: "stats", label: "Stats" },
  { id: "chinawok", label: "China Wok" },
  { id: "contact", label: "Contact" },
];

// Highlights the section you're currently in: the last section whose top
// has crossed a line 40% down the viewport. Deterministic, no flicker.
export function NavLinks() {
  const [active, setActive] = useState("");

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
    <nav className="hidden items-center gap-4 text-sm lg:flex">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={() => bumpVibe("explorer", 12)}
          className={`transition ${
            active === s.id
              ? "font-medium text-accent"
              : "text-muted hover:text-accent"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
