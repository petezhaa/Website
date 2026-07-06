// Daily Geo Challenge, pure, DOM-free helpers so they stay testable.
// The whole feature is client-side: the Rust engine's game_start(m, seed)
// runs a deterministic seeded Fisher-Yates, so the same seed yields the same
// six rounds for every visitor worldwide on a given UTC day.

export const DAY_MS = 86_400_000;

// Which UTC day it is (days since the Unix epoch).
export function dayNumber(now: number = Date.now()): number {
  return Math.floor(now / DAY_MS);
}

// 2026-07-05 is Daily #1. (Date.UTC is a constant expression, evaluated once.)
const ANCHOR_DAY = Math.floor(Date.UTC(2026, 6, 5) / DAY_MS);

export function dailyNumber(now: number = Date.now()): number {
  return dayNumber(now) - ANCHOR_DAY + 1;
}

// A nonzero u32 seed derived from the day number (murmur-ish avalanche).
export function dailySeed(now: number = Date.now()): number {
  let x = (dayNumber(now) * 2654435761 + 0x9e3779b9) >>> 0;
  x ^= x >>> 16;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  x = (x * 3266489917) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) || 0x9e3779b9;
}

// One square per round: green ≥800, yellow ≥400, else white.
export function squares(scores: number[]): string {
  return scores
    .map((s) => (s >= 800 ? "\u{1F7E9}" : s >= 400 ? "\u{1F7E8}" : "⬜"))
    .join("");
}

// The Wordle-style clipboard block.
export function buildShare(
  scores: number[],
  total: number,
  max: number,
  num: number
): string {
  return (
    `Peter's Daily Geo #${num}, ${total.toLocaleString()}/${max.toLocaleString()}\n` +
    `${squares(scores)}\n` +
    `https://petezha.xyz`
  );
}
