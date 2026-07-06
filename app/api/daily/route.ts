import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { dayNumber } from "@/lib/daily";

// The daily-challenge leaderboard, the site's first backend state. One KV
// key per UTC day holding the top 50, expiring after a week. Scores are
// client-reported and capped at the game's max; this is a personal site,
// not a casino. Honor system, lightly enforced.

type Entry = { name: string; score: number };
type LeaderboardKV = {
  get: (key: string, type: "json") => Promise<Entry[] | null>;
  put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>;
};

const MAX_SCORE = 6000;
const KEEP = 50;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function kv(): LeaderboardKV | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { LEADERBOARD?: LeaderboardKV }).LEADERBOARD ?? null;
  } catch {
    return null; // local dev without the binding
  }
}

export async function GET(req: NextRequest) {
  const store = kv();
  if (!store) return Response.json({ entries: [] });
  const day = Number(req.nextUrl.searchParams.get("day")) || dayNumber();
  const entries = (await store.get(`day:${day}`, "json")) ?? [];
  return Response.json({ entries });
}

export async function POST(req: NextRequest) {
  const store = kv();
  if (!store) return new Response("no leaderboard here", { status: 503 });

  // per-IP rate limit, same in-memory pattern as the chat route
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return new Response("slow down", { status: 429 });
  recent.push(now);
  hits.set(ip, recent);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const { day, name, score } = (body ?? {}) as { day?: unknown; name?: unknown; score?: unknown };

  // only today's board accepts scores; yesterday is history
  if (Number(day) !== dayNumber()) return new Response("not today's board", { status: 400 });
  const s = Math.round(Number(score));
  if (!Number.isFinite(s) || s < 0 || s > MAX_SCORE) return new Response("bad score", { status: 400 });
  const cleanName = String(name ?? "")
    .replace(/[^\p{L}\p{N} _\-.]/gu, "")
    .trim()
    .slice(0, 16) || "anonymous";

  const key = `day:${dayNumber()}`;
  const entries = (await store.get(key, "json")) ?? [];
  entries.push({ name: cleanName, score: s });
  entries.sort((a, b) => b.score - a.score);
  const kept = entries.slice(0, KEEP);
  await store.put(key, JSON.stringify(kept), { expirationTtl: 7 * 86400 });

  const rank = kept.findIndex((e) => e.name === cleanName && e.score === s) + 1;
  return Response.json({ rank: rank || null, entries: kept.slice(0, 10) });
}
