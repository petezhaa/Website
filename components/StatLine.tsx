import { getLetterboxd } from "@/lib/letterboxd";
import { getSteamGames, getSteamMeta } from "@/lib/steam";
import { RandomLine } from "@/components/RandomLine";

// A batch of dry LLM-written one-liners about the live stats, cached
// in-process for 6 hours; each visitor gets a random one client-side.
let cache: { lines: string[]; at: number } | null = null;
const TTL = 6 * 60 * 60 * 1000;

async function synthesize(): Promise<string[] | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  if (cache && Date.now() - cache.at < TTL) return cache.lines;

  const [lb, steam, meta] = await Promise.all([
    getLetterboxd(),
    getSteamGames(),
    getSteamMeta(),
  ]);
  const facts: string[] = [];
  if (lb?.films[0]) {
    facts.push(
      `films this year: ${lb.filmsThisYear}; all-time: ${lb.filmsAllTime}; last watched: ${lb.films[0].title}` +
        (lb.films[0].rating ? ` rated ${lb.films[0].rating}/5` : "")
    );
  }
  if (steam?.[0]) {
    facts.push(
      `most-played game: ${steam[0].name} at ${steam[0].hours} hours; second: ${steam[1]?.name} at ${steam[1]?.hours} hours`
    );
  }
  if (meta?.recent) {
    facts.push(
      `last two weeks: ${meta.recent.hours2w} hours of ${meta.recent.name}`
    );
  }
  if (meta && meta.neverPlayed > 0) {
    facts.push(
      `owns ${meta.totalOwned} steam games, ${meta.neverPlayed} never launched`
    );
  }
  if (facts.length === 0) return null;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Write 6 DIFFERENT short dry sentences (each under 18 words) in the first person, each summarizing or riffing on these stats about me, a college student. One sentence per line, no numbering, no bullets. Plain words, lowercase start is fine, no exclamation marks, no em dashes, no hashtags. Vary the angle: some factual, some self-aware, some deadpan.",
          },
          { role: "user", content: facts.join("; ") },
        ],
        max_tokens: 240,
        temperature: 0.95,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string | undefined = data.choices?.[0]?.message?.content;
    const lines = (text ?? "")
      .split("\n")
      .map((l: string) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter((l: string) => l.length > 8 && l.length < 160);
    if (lines.length === 0) return null;
    cache = { lines, at: Date.now() };
    return lines;
  } catch {
    return null;
  }
}

export async function StatLine() {
  const lines = await synthesize();
  if (!lines) return null;
  return <RandomLine lines={lines} />;
}
