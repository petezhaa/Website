"use client";

import type { Vibe, VibeAxis } from "@/lib/vibeBus";

const AXES: { key: VibeAxis; label: string }[] = [
  { key: "explorer", label: "explorer" },
  { key: "gamer", label: "gamer" },
  { key: "chaos", label: "chaos" },
  { key: "curiosity", label: "curiosity" },
  { key: "menace", label: "menace" },
];

// score a chat message's style (what feeds chaos/curiosity/menace)
export function readMessage(text: string): {
  chaos: number;
  curiosity: number;
  menace: number;
} {
  const t = text.trim();
  const lower = t.toLowerCase();

  let chaos = 0;
  if (/^[a-z]/.test(t)) chaos += 35;
  if (!/[.!?]$/.test(t)) chaos += 20;
  if (/(.)\1{2,}/.test(lower)) chaos += 20;
  if (/\b(lol|lmao|bruh|idk|ngl|fr|wtf)\b/.test(lower)) chaos += 25;

  const curiosity = Math.min(100, (t.match(/\?/g)?.length ?? 0) * 60);

  let menace = 0;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (
    letters.length >= 4 &&
    letters.replace(/[a-z]/g, "").length / letters.length > 0.6
  )
    menace += 45;
  if (/\b(gay|stupid|trash|mid|suck|cooked|ratio|L)\b/i.test(t)) menace += 40;
  if (/!{2,}/.test(t)) menace += 20;

  return { chaos: Math.min(100, chaos), curiosity, menace: Math.min(100, menace) };
}

export function VibeRadar({ vibe, samples }: { vibe: Vibe; samples: number }) {
  const C = 88;
  const R = 56;
  const pt = (i: number, v: number): [number, number] => {
    const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [C + Math.cos(a) * R * (v / 100), C + Math.sin(a) * R * (v / 100)];
  };
  const poly = AXES.map(({ key }, i) => pt(i, Math.max(vibe[key], 4)))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
        your visit, graphed
      </p>
      <svg viewBox="0 0 176 176" className="w-64 overflow-visible sm:w-72">
        {[0.33, 0.66, 1].map((ring) => (
          <polygon
            key={ring}
            points={AXES.map((_, i) => pt(i, ring * 100).join(",")).join(" ")}
            fill="none"
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))}
        {AXES.map((_, i) => {
          const [x, y] = pt(i, 100);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
        })}
        <polygon points={poly} fill="var(--chart)" opacity={0.15} />
        <polygon points={poly} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" />
        {AXES.map(({ key }, i) => {
          const [x, y] = pt(i, Math.max(vibe[key], 4));
          return (
            <circle key={key} cx={x} cy={y} r={3} fill="var(--chart)" stroke="var(--surface)" strokeWidth={1.5} />
          );
        })}
        {AXES.map(({ key, label }, i) => {
          const [x, y] = pt(i, 128);
          return (
            <text
              key={key}
              x={x}
              y={y + 3}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted)"
              fontFamily="var(--font-mono)"
            >
              {label} {vibe[key]}
            </text>
          );
        })}
      </svg>
      <p className="max-w-64 text-[11px] leading-snug text-muted">
        {samples === 0
          ? "click around, play the game, text the bot. it's watching."
          : `reading ${samples} interaction${samples === 1 ? "" : "s"} so far`}
      </p>
    </div>
  );
}
