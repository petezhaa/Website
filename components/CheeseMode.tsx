"use client";

import { useEffect, useRef, useState } from "react";
import { bumpVibe, foundSecret, SECRET_TOTAL } from "@/lib/vibeBus";

// The site's one secret: type "cheese" anywhere (or the Konami code) and
// Wisconsin takes over. Type it again to put the state away.
const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

type Drop = { id: number; x: number; delay: number; size: number; spin: number; glyph: string };

export function CheeseMode() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const typed = useRef("");
  const konami = useRef(0);
  const nextId = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // mode flags are refs, not state: nothing renders off them (the CSS class
  // on <html> is the render), and side effects don't belong in updaters
  const cheeseOn = useRef(false);
  const beerOn = useRef(false);

  const rain = (glyphs: string | string[], count = 26) => {
    const pool = Array.isArray(glyphs) ? glyphs : [glyphs];
    const batch: Drop[] = Array.from({ length: count }, (_, i) => ({
      id: nextId.current++,
      x: ((i * 61) % 100) + (((i * 13) % 7) - 3),
      delay: count === 1 ? 0 : ((i * 37) % 20) / 10,
      size: 18 + ((i * 29) % 22),
      spin: (((i * 53) % 2) === 0 ? 1 : -1) * (180 + ((i * 41) % 360)),
      glyph: pool[i % pool.length],
    }));
    setDrops(batch);
    // a fresh rain owns the sky: the previous clear-timer must not cut it short
    if (rainTimer.current) clearTimeout(rainTimer.current);
    rainTimer.current = setTimeout(() => setDrops([]), 5200);
  };

  // the full bar. beer is the door; the rest pour once you're in.
  const BEVERAGES = ["🍺", "🍷", "🥃", "🍸", "🥂", "🍺"];

  // while drunk, the site occasionally does drunk things: a hiccup, a lean,
  // a moment where it can't quite focus, a stray drink from somewhere
  const chaosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drunkChaos = () => {
    if (!beerOn.current) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const root = document.documentElement;
      const effects = [
        () => { root.classList.add("beer-hiccup"); pulseTimer.current = setTimeout(() => root.classList.remove("beer-hiccup"), 500); },
        () => { root.classList.add("beer-lean"); pulseTimer.current = setTimeout(() => root.classList.remove("beer-lean"), 1400); },
        () => { root.classList.add("beer-blur"); pulseTimer.current = setTimeout(() => root.classList.remove("beer-blur"), 700); },
        () => rain([BEVERAGES[Math.floor(Math.random() * BEVERAGES.length)]], 1),
      ];
      effects[Math.floor(Math.random() * effects.length)]();
    }
    chaosTimer.current = setTimeout(drunkChaos, 5000 + Math.random() * 8000);
  };
  const stopChaos = () => {
    if (chaosTimer.current) clearTimeout(chaosTimer.current);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    document.documentElement.classList.remove("beer-hiccup", "beer-lean", "beer-blur");
  };

  const say = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  const trigger = () => {
    const next = !cheeseOn.current;
    cheeseOn.current = next;
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
  };

  // the other wisconsin food group. type "beer" (or "wine", we don't judge)
  // and the site has a few — then keeps having a few.
  const triggerBeer = () => {
    const next = !beerOn.current;
    beerOn.current = next;
    document.documentElement.classList.toggle("beer", next);
    if (next) {
      bumpVibe("chaos", 45);
      rain(BEVERAGES);
      chaosTimer.current = setTimeout(drunkChaos, 2500); // first stumble comes quick
    } else {
      stopChaos();
    }
    say(
      next
        ? "beer mode. the site is 21, don't worry."
        : "sober. the site remembers nothing."
    );
  };

  const found = foundSecret;

  // the lesser typed secrets: one effect, one dry line each
  const MINOR: Record<string, () => void> = {
    packers: () => {
      rain("🏈");
      bumpVibe("chaos", 20);
      say("go pack go.");
    },
    sudo: () => {
      bumpVibe("menace", 25);
      say("permission denied. this site is static and unbribable.");
    },
    zion: () => {
      bumpVibe("menace", 20);
      document.getElementById("parks")?.scrollIntoView({ behavior: "smooth" });
      say("zion stays in c-tier. the committee has been notified.");
    },
    tso: () => {
      bumpVibe("explorer", 10);
      document.getElementById("chinawok")?.scrollIntoView({ behavior: "smooth" });
      say("the general will see you now.");
    },
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // never intercept real typing
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      konami.current = e.key === KONAMI[konami.current] ? konami.current + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (konami.current === KONAMI.length) {
        konami.current = 0;
        found("konami");
        trigger();
        return;
      }

      if (/^[a-z]$/i.test(e.key)) {
        typed.current = (typed.current + e.key.toLowerCase()).slice(-8);
        if (typed.current.endsWith("cheese")) {
          typed.current = "";
          found("cheese");
          trigger();
        } else if (typed.current.endsWith("beer") || typed.current.endsWith("wine")) {
          typed.current = "";
          found("beer"); // same drunk, different glass
          triggerBeer();
        } else {
          for (const word of Object.keys(MINOR)) {
            if (typed.current.endsWith(word)) {
              typed.current = "";
              found(word);
              MINOR[word]();
              break;
            }
          }
        }
      }
    };
    // the phone dispatches these when someone texts peter a magic word
    const onEvent = () => { found("cheese"); trigger(); };
    const onBeer = () => { found("beer"); triggerBeer(); };
    // any component can log a secret; the toast is the site acknowledging it
    const onSecret = (e: Event) => {
      const d = (e as CustomEvent).detail as { count: number };
      if (d?.count) {
        setTimeout(() => say(`secret ${d.count}/${SECRET_TOTAL}, on the record.`), 900);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("cheesemode", onEvent);
    window.addEventListener("beermode", onBeer);
    window.addEventListener("secret-found", onSecret);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cheesemode", onEvent);
      window.removeEventListener("beermode", onBeer);
      window.removeEventListener("secret-found", onSecret);
      stopChaos();
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
