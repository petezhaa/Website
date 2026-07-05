import type { Metadata } from "next";
import { decodeChallenge } from "@/lib/challenge";
import { MapGame } from "@/components/MapGame";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const c = decodeChallenge(code);
  const title = c
    ? `Beat my ${c.score.toLocaleString()} — Peter's map game`
    : "Map game challenge · Peter Zhao";
  const description = c
    ? `I scored ${c.score.toLocaleString()}/6000 on the same six rounds. Race my ghost pins and see if you can do better.`
    : "Play six rounds of Peter's geography game and race a ghost.";
  // the opengraph-image.tsx in this segment is wired in automatically
  return {
    title,
    description,
    openGraph: { title, description, url: `/c/${code}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const challenge = decodeChallenge(code);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <a href="/" className="font-mono text-xs text-muted transition hover:text-accent">
          ← petezha.xyz
        </a>
        <span className="font-mono text-xs text-muted">map game · challenge</span>
      </header>

      {challenge ? (
        <>
          <h1 className="font-mono font-bold text-3xl tracking-tight sm:text-4xl">
            Beat my {challenge.score.toLocaleString()}
          </h1>
          <p className="mb-8 mt-3 max-w-xl leading-relaxed text-muted">
            The same six rounds I played. My guesses drop as translucent ghost
            pins on each reveal.{" "}
            {challenge.beat >= 1
              ? `I beat a random clicker by ${challenge.beat.toFixed(1)}×. `
              : ""}
            Your move.
          </p>
          <MapGame challenge={challenge} />
        </>
      ) : (
        <>
          <h1 className="font-mono font-bold text-3xl tracking-tight sm:text-4xl">
            That challenge link looks broken
          </h1>
          <p className="mb-8 mt-3 max-w-xl leading-relaxed text-muted">
            The code didn&apos;t decode — maybe the game was updated since the
            link was made. Play a fresh round instead.
          </p>
          <MapGame />
        </>
      )}
    </main>
  );
}
