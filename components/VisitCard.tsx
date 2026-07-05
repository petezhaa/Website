"use client";

import { useEffect, useState } from "react";
import { getVibe, getVibeSamples, secretsFound, SECRET_TOTAL, type Vibe } from "@/lib/vibeBus";

// The stats section quantifies Peter; this card quantifies you. Everything
// here is computed in your browser from this visit and goes nowhere.
export function VisitCard() {
  const [seconds, setSeconds] = useState(0);
  const [depth, setDepth] = useState(0);
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [samples, setSamples] = useState(0);
  const [secrets, setSecrets] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    const tick = () => {
      setSeconds(Math.floor((performance.now() - t0) / 1000) + Math.floor(performance.timeOrigin ? (Date.now() - performance.timeOrigin) / 1000 - (performance.now() - t0) / 1000 : 0));
    };
    // simpler and honest: time since the page loaded
    const id = setInterval(() => setSeconds(Math.floor(performance.now() / 1000)), 1000);
    tick();

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) {
        setDepth((d) => Math.max(d, Math.min(100, Math.round((window.scrollY / max) * 100))));
      }
    };
    const onVibe = () => {
      setVibe(getVibe());
      setSamples(getVibeSamples());
    };
    const onSecret = () => setSecrets(secretsFound());
    onScroll();
    onVibe();
    onSecret();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("vibe", onVibe);
    window.addEventListener("secret-found", onSecret);
    return () => {
      clearInterval(id);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("vibe", onVibe);
      window.removeEventListener("secret-found", onSecret);
    };
  }, []);

  const mins = Math.floor(seconds / 60);
  const timeStr = mins > 0 ? `${mins}m ${seconds % 60}s` : `${seconds}s`;
  const topAxes = vibe
    ? (Object.entries(vibe) as [string, number][])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
    : [];

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-sm font-medium">Meanwhile, you</p>
      <p className="mb-4 font-mono text-[11px] text-muted">
        this visit, measured locally · nothing leaves your browser
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="font-mono text-2xl font-bold text-accent">{timeStr}</p>
          <p className="mt-0.5 text-xs text-muted">on this page</p>
        </div>
        <div>
          <p className="font-mono text-2xl font-bold text-accent">{depth}%</p>
          <p className="mt-0.5 text-xs text-muted">deepest scroll</p>
        </div>
        <div>
          <p className="font-mono text-2xl font-bold text-accent">{samples}</p>
          <p className="mt-0.5 text-xs text-muted">interactions the radar counted</p>
        </div>
        <div>
          <p className={`font-mono text-2xl font-bold ${secrets >= SECRET_TOTAL ? "text-gold" : "text-accent"}`}>
            {secrets}/{SECRET_TOTAL}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {secrets >= SECRET_TOTAL ? "secrets. all of them. respect." : "secrets found. keep looking"}
          </p>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3 font-mono text-[10.5px] leading-relaxed text-muted">
        {topAxes.length > 0 ? (
          <p>
            current read:{" "}
            {topAxes.map(([k, v], i) => (
              <span key={k}>
                {i > 0 && " · "}
                <span className="text-fg">{k}</span> {v}/100
              </span>
            ))}
            {" — the full pentagon lives in the corner widget. the bot can read it too."}
          </p>
        ) : (
          <p>no reads yet. click something. the radar is patient.</p>
        )}
      </div>
    </div>
  );
}
