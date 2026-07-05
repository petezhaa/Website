import { NextRequest } from "next/server";
import { PERSONA } from "@/lib/persona";
import { getLetterboxd } from "@/lib/letterboxd";
import { getSteamGames } from "@/lib/steam";

// live stats appended to the system prompt so the bot answers with
// current data; both fetchers are cached by Next, so this is cheap
async function liveContext(): Promise<string> {
  const [lb, steam] = await Promise.all([getLetterboxd(), getSteamGames()]);
  const parts: string[] = [];
  if (lb) {
    const recent = lb.films
      .slice(0, 5)
      .map((f) => `${f.title}${f.rating ? ` (${f.rating}/5)` : ""}`)
      .join(", ");
    parts.push(
      `LIVE LETTERBOXD: ${lb.filmsAllTime ?? "?"} films all time, ${
        lb.filmsThisYear ?? "?"
      } this year. Most recent watches: ${recent}.`
    );
  }
  if (steam) {
    const top = steam
      .slice(0, 5)
      .map((g) => `${g.name} (${g.hours}h)`)
      .join(", ");
    parts.push(`LIVE STEAM: top games by hours: ${top}.`);
  }
  return parts.length
    ? `\n\nLIVE DATA (current, cite freely):\n${parts.join("\n")}`
    : "";
}

// Llama 3.3 70B via Groq's OpenAI-compatible API, streamed straight through.
// Set GROQ_API_KEY in .env.local (free at console.groq.com).

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return new Response("offline", { status: 503 });
  }

  // per-IP rate limit (in-memory; resets on redeploy, good enough here)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  // periodic sweep so IPs that never return can't grow the map forever
  if (hits.size > 2000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return new Response("slow down", { status: 429 });
  }
  recent.push(now);
  hits.set(ip, recent);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("bad request", { status: 400 });
  }

  // the visitor's live vibe radar, if the client sent it
  const vibe = (body as { vibe?: Record<string, unknown> })?.vibe;
  const vibeSamples = Number(
    (body as { vibeSamples?: unknown })?.vibeSamples ?? 0
  );
  let vibeContext = "";
  if (vibe && typeof vibe === "object" && vibeSamples > 0) {
    const axes = ["explorer", "gamer", "chaos", "curiosity", "menace"]
      .map((k) => `${k} ${Math.round(Number(vibe[k]) || 0)}/100`)
      .join(", ");
    vibeContext = `\n\nVISITOR VIBE (live scores from how this visitor has behaved on my site: clicking around, playing the map game, dragging parks, texting style; based on ${vibeSamples} interactions): ${axes}. If they ask you to analyze them, their personality, or their vibe, use these numbers: give a short, specific, playful read (roast-adjacent, never mean), citing 2-3 of the standout axes. ${
      vibeSamples < 5
        ? "Samples are LOW: tell them to go touch the site more first, then come back."
        : "You have plenty of data. Analyze confidently; do NOT claim you lack data."
    }`;
  }

  // the visitor's live secret count: give the bot the real number so it
  // never invents one ("you're at 0/20" to someone holding twelve)
  const secretsRaw = Number((body as { secrets?: unknown })?.secrets);
  const secrets = Number.isFinite(secretsRaw)
    ? Math.min(20, Math.max(0, Math.floor(secretsRaw)))
    : null;
  const secretContext =
    secrets === null
      ? ""
      : `\n\nSECRET COUNT (live): this visitor has found exactly ${secrets}/20 secrets so far. If secrets come up, use this number; never guess or assume a count.`;

  // beer mode: the site is visibly drunk on their screen, and so are you
  const drunk = (body as { drunk?: unknown })?.drunk === true;
  const drunkContext = drunk
    ? `\n\nDRUNK MODE (active right now): the visitor turned on beer mode, so the whole site is swaying and blurring on their screen, and you have had a few yourself. Stay in your normal voice but drunker: looser grammar, occasional lowercase drift, maybe one *hic* mid-sentence, lose your train of thought once in a while, get a little too sentimental about wisconsin or the parks. Still answer the actual question underneath it. Keep replies just as short. Never explain that this is a mode or break character. If you emit an action tag it must still be EXACTLY formatted.`
    : "";

  const clean = messages
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .slice(-8)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 1000),
    }));
  if (clean.length === 0) {
    return new Response("bad request", { status: 400 });
  }

  const system = PERSONA + (await liveContext()) + vibeContext + secretContext + drunkContext;
  const callGroq = (model: string) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...clean],
        max_tokens: 140,
        temperature: drunk ? 0.95 : 0.85, // drunk loosens the sampler a notch; more and it starts inventing facts
        stream: true,
      }),
    });

  // 70B first; its free-tier token budget is small, so on any failure fall
  // back to the 8B model, which has far higher limits. Slightly dumber
  // beats "something broke".
  let upstream = await callGroq("llama-3.3-70b-versatile");
  if (!upstream.ok) {
    upstream = await callGroq("llama-3.1-8b-instant");
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
