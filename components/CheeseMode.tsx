"use client";

import { useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// The site's one secret: type "cheese" anywhere (or the Konami code) and
// Wisconsin takes over. Type it again to put the state away.
const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

type Drop = { id: number; x: number; delay: number; size: number; spin: number; glyph: string };

export function CheeseMode() {
  const [on, setOn] = useState(false);
  const [beer, setBeer] = useState(false);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const typed = useRef("");
  const konami = useRef(0);
  const nextId = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rain = (glyph: string) => {
    const batch: Drop[] = Array.from({ length: 26 }, (_, i) => ({
      id: nextId.current++,
      x: ((i * 61) % 100) + (((i * 13) % 7) - 3),
      delay: ((i * 37) % 20) / 10,
      size: 18 + ((i * 29) % 22),
      spin: (((i * 53) % 2) === 0 ? 1 : -1) * (180 + ((i * 41) % 360)),
      glyph,
    }));
    setDrops(batch);
    setTimeout(() => setDrops([]), 5200);
  };

  const say = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  const trigger = () => {
    setOn((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("cheese", next);
      if (next) {
        bumpVibe("chaos", 40);
        rain("🧀");
      }
      say(
        next
          ? "cheese mode. wisconsin sends its regards."
          : "cheese mode off. the state thanks you for visiting."
      );
      return next;
    });
  };

  // the other wisconsin food group. type "beer" and the site has a few.
  const triggerBeer = () => {
    setBeer((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("beer", next);
      if (next) {
        bumpVibe("chaos", 45);
        rain("🍺");
      }
      say(
        next
          ? "beer mode. the site is 21, don't worry."
          : "sober. the site remembers nothing."
      );
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // never intercept real typing
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      konami.current = e.key === KONAMI[konami.current] ? konami.current + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (konami.current === KONAMI.length) {
        konami.current = 0;
        trigger();
        return;
      }

      if (/^[a-z]$/i.test(e.key)) {
        typed.current = (typed.current + e.key.toLowerCase()).slice(-6);
        if (typed.current === "cheese") {
          typed.current = "";
          trigger();
        } else if (typed.current.endsWith("beer")) {
          typed.current = "";
          triggerBeer();
        }
      }
    };
    // the phone dispatches these when someone texts peter a magic word
    const onEvent = () => trigger();
    const onBeer = () => triggerBeer();
    window.addEventListener("keydown", onKey);
    window.addEventListener("cheesemode", onEvent);
    window.addEventListener("beermode", onBeer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cheesemode", onEvent);
      window.removeEventListener("beermode", onBeer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {drops.length > 0 && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
          {drops.map((d) => (
            <span
              key={d.id}
              className="cheese-drop absolute"
              style={{
                left: `${d.x}%`,
                fontSize: d.size,
                animationDelay: `${d.delay}s`,
                ["--spin" as string]: `${d.spin}deg`,
              }}
            >
              {d.glyph}
            </span>
          ))}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[95] -translate-x-1/2 rounded-full border border-line bg-surface px-5 py-2.5 font-mono text-xs text-fg shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
