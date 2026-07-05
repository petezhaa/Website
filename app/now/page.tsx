import type { Metadata } from "next";
import { getLetterboxd, stars } from "@/lib/letterboxd";
import { getSteamMeta } from "@/lib/steam";
import { ROLES } from "@/lib/resume";
import { NOW_LINES, NOW_UPDATED } from "@/lib/now";

export const metadata: Metadata = {
  title: "Peter Zhao · what I'm doing now",
  description:
    "A /now page: what Peter Zhao is working on, watching, and playing this month. Half hand-written, half pulled live from Letterboxd and Steam.",
  openGraph: {
    title: "Peter Zhao · now",
    description: "What I'm working on, watching, and playing this month.",
    url: "/now",
    siteName: "Peter Zhao",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Pixel Peter says hi" }],
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line pt-4 sm:grid-cols-[130px_1fr] sm:gap-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
        {label}
      </p>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

export default async function NowPage() {
  const [lb, steamMeta] = await Promise.all([getLetterboxd(), getSteamMeta()]);
  const current = ROLES.find((r) => r.status === "current");
  const incoming = ROLES.find((r) => r.status === "incoming");
  const lastFilm = lb?.films?.[0] ?? null;
  const recent = steamMeta?.recent ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="mb-14 flex items-center justify-between">
        <a
          href="/"
          className="font-mono text-xs text-muted transition hover:text-accent"
        >
          ← petezha.xyz
        </a>
        <span className="font-mono text-xs text-muted">updated {NOW_UPDATED}</span>
      </header>

      <p className="flex items-center gap-2.5 font-mono text-xs text-muted">
        <span className="h-2 w-2 rounded-full bg-accent" />
        a /now page
      </p>
      <h1 className="mt-4 font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl">
        What I&apos;m doing now
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        The{" "}
        <a
          href="https://nownownow.com/about"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent"
        >
          /now page
        </a>{" "}
        idea: a snapshot of what has my attention this month. Half of this is
        hand-written; half is pulled live from what I&apos;m actually watching
        and playing.
      </p>

      <div className="mt-12 space-y-6">
        <Row label="working on">
          {current ? (
            <>
              {current.quip}{" "}
              <span className="text-muted">
                — {current.title} at {current.company}, {current.location}.
              </span>
            </>
          ) : (
            "heads-down on a few things."
          )}
          {incoming && (
            <>
              {" "}
              Later this summer:{" "}
              <span className="text-fg">{incoming.company}</span> (
              {incoming.title}).
            </>
          )}
        </Row>

        <Row label="last watched">
          {lastFilm ? (
            <>
              <span className="text-fg">{lastFilm.title}</span>
              {lastFilm.year ? ` (${lastFilm.year})` : ""}
              {lastFilm.rating !== null ? (
                <span className="text-gold"> — {stars(lastFilm.rating)}</span>
              ) : null}
              {lastFilm.rewatch ? " (a rewatch)" : ""}.
            </>
          ) : (
            "between films at the moment."
          )}
        </Row>

        <Row label="playing">
          {recent ? (
            <>
              <span className="text-fg">{recent.name}</span> — {recent.hours2w}h
              in the last two weeks.
            </>
          ) : (
            "not much, lately. School and work won this round."
          )}
        </Row>

        {NOW_LINES.map((l) => (
          <Row key={l.label} label={l.label}>
            {l.text}
          </Row>
        ))}
      </div>

      <p className="mt-14 border-t border-line pt-6 font-mono text-xs text-muted">
        Watching and playing refresh themselves hourly. The rest updates when I
        remember to.
      </p>
    </main>
  );
}
