"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PARK_TIERS, PARK_FACTS, TIER_DEFENSE } from "@/lib/parks";
import { bumpVibe } from "@/lib/vibeBus";
import { encodeHeresy, parkIndexOf, tierDigit } from "@/lib/heresy";
import { copyToClipboard } from "@/lib/clipboard";

type Rebuttal = {
  park: string;
  from: string;
  to: string;
  text: string[];
};

const CLOSERS = [
  "Your edit has been reverted. This is a benevolent dictatorship.",
  "The change did not survive review. The reviewer was me.",
  "Reverted. You may appeal by email; bring elevation profiles.",
  "The committee (me, alone, at my desk) has restored the original ranking.",
];

const tierRank = (label: string) =>
  PARK_TIERS.findIndex((t) => t.label === label);

function buildRebuttal(park: string, from: string, to: string, n: number): string[] {
  const fact = PARK_FACTS[park] ?? "it is a national park, which is already something";
  const movedUp = tierRank(to) < tierRank(from);
  const opener = movedUp
    ? `You want ${park} up in ${to}-tier. I understand the instinct: ${fact}.`
    : `${park}, down to ${to}-tier? Bold. And yes, ${fact}.`;
  const defense = TIER_DEFENSE[from] ?? "";
  const middle = movedUp
    ? `But here is the problem. ${defense} ${park} living in ${from} is not a snub; it is the whole system working.`
    : `Which is exactly why it does not belong any lower. ${defense} Dropping it to ${to} ignores all of that.`;
  return [opener, middle, CLOSERS[n % CLOSERS.length]];
}

export function ParkTierList() {
  const [tiers, setTiers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(PARK_TIERS.map((t) => [t.label, [...t.parks]]))
  );
  const [rebuttal, setRebuttal] = useState<Rebuttal | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // tap-to-move fallback
  const dragParkRef = useRef<string | null>(null);
  const rebuttalCount = useRef(0);
  const revertTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // the revert erases moves from `tiers`, so remember each park's INTENDED tier
  const intendedRef = useRef(new Map<string, string>());
  const [heresyLink, setHeresyLink] = useState<string | null>(null);
  const [heresyCopied, setHeresyCopied] = useState(false);

  const originalTier = (park: string) =>
    PARK_TIERS.find((t) => t.parks.includes(park))?.label ?? "C";

  const currentTier = (park: string) =>
    Object.keys(tiers).find((label) => tiers[label].includes(park)) ?? "C";

  const moveTo = (park: string, to: string) => {
    const from = currentTier(park);
    if (from === to) return;
    bumpVibe("chaos", 15);
    // record intent before the timed revert can erase it
    intendedRef.current.set(park, to);
    setHeresyLink(null); // a new edit invalidates the last published link

    setTiers((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([label, parks]) => [
          label,
          parks.filter((p) => p !== park),
        ])
      );
      next[to] = [...next[to], park];
      return next;
    });

    const home = originalTier(park);
    const pending = revertTimers.current.get(park);
    if (pending) clearTimeout(pending); // reschedule THIS park only

    if (to !== home) {
      bumpVibe("menace", 22); // they came to argue
      // let them see it land, then argue and put it back
      setRebuttal({
        park,
        from: home,
        to,
        text: buildRebuttal(park, home, to, rebuttalCount.current++),
      });
      const timer = setTimeout(() => {
        revertTimers.current.delete(park);
        setTiers((prev) => {
          const next = Object.fromEntries(
            Object.entries(prev).map(([label, parks]) => [
              label,
              parks.filter((p) => p !== park),
            ])
          );
          next[home] = [...next[home], park];
          return next;
        });
      }, 2400);
      revertTimers.current.set(park, timer);
    } else {
      setRebuttal(null);
    }
  };

  // parks whose intended tier differs from my canon — the heresy
  const heresyChanges = () => {
    const changes: { index: number; tier: number }[] = [];
    intendedRef.current.forEach((toLabel, park) => {
      if (toLabel !== originalTier(park)) {
        const idx = parkIndexOf(park);
        if (idx >= 0) changes.push({ index: idx, tier: tierDigit(toLabel) });
      }
    });
    return changes;
  };
  const heresyCount = heresyChanges().length;

  const publishHeresy = () => {
    if (typeof window === "undefined") return;
    const changes = heresyChanges();
    if (changes.length === 0) return;
    bumpVibe("menace", 20);
    const url = `${window.location.origin}/heresy/${encodeHeresy(changes)}`;
    setHeresyLink(url);
    void copyToClipboard(url).then(() => {
      setHeresyCopied(true);
      setTimeout(() => setHeresyCopied(false), 1800);
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {PARK_TIERS.map((tier) => (
        <div
          key={tier.label}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const park =
              dragParkRef.current ?? e.dataTransfer.getData("text/plain");
            if (park) moveTo(park, tier.label);
            dragParkRef.current = null;
          }}
          onClick={() => {
            if (selected) {
              moveTo(selected, tier.label);
              setSelected(null);
            }
          }}
          className={`panel flex overflow-hidden transition ${
            selected ? "cursor-pointer hover:border-accent" : ""
          }`}
        >
          <div
            className="flex w-14 shrink-0 items-center justify-center font-mono text-2xl font-bold text-[#26241e] sm:w-16"
            style={{ backgroundColor: tier.color }}
          >
            {tier.label}
          </div>
          <div className="flex min-h-14 flex-wrap items-center gap-1.5 p-3.5">
            <AnimatePresence>
              {tiers[tier.label].map((park) => (
                <motion.span
                  key={park}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  draggable
                  onDragStart={(e) => {
                    dragParkRef.current = park;
                    const dt = (e as unknown as React.DragEvent).dataTransfer;
                    dt?.setData("text/plain", park);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(selected === park ? null : park);
                  }}
                  className={`cursor-grab select-none rounded-[2px] border px-2.5 py-1 text-xs transition active:cursor-grabbing ${
                    selected === park
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-surface-2 hover:border-accent hover:text-accent"
                  }`}
                >
                  {park}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}

      <p className="font-mono text-[11px] text-muted">
        drag a park to a different tier (or tap it, then tap a tier)
      </p>

      {heresyCount > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={publishHeresy}
            className="btn-term self-start px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider"
          >
            publish it anyway ({heresyCount})
          </button>
          {heresyLink && (
            <div className="panel border-accent/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                your heresy is on the record
              </p>
              <p className="mt-1 text-sm text-muted">
                {heresyCount} park{heresyCount === 1 ? "" : "s"} moved off my
                canon. I reverted them here, but the receipt is permanent:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={heresyLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-[2px] border border-line bg-surface-2 px-3 py-1.5 font-mono text-[11px] text-muted"
                />
                <button
                  onClick={publishHeresy}
                  className="btn-solid shrink-0 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider"
                >
                  {heresyCopied ? "copied ✓" : "copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {rebuttal && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="panel relative mt-2 border-accent/40 p-5"
          >
            <button
              onClick={() => setRebuttal(null)}
              aria-label="dismiss"
              className="absolute right-3 top-3 font-mono text-xs text-muted transition hover:text-accent"
            >
              ✕
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              re: your proposed change — {rebuttal.park}, {rebuttal.from} →{" "}
              {rebuttal.to}
            </p>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
              {rebuttal.text.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
