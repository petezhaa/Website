import Image from "next/image";
import { getSteamGames, STEAM_URL } from "@/lib/steam";
import { Reveal } from "@/components/Reveal";

// Server component: top Steam games by hours, pulled from the public
// community profile. Renders a fallback until game details are public.
export async function GameShelf() {
  const games = await getSteamGames();
  const top = games?.slice(0, 6) ?? [];
  const totalHours = games?.reduce((sum, g) => sum + g.hours, 0) ?? 0;

  return (
    <Reveal>
      {top.length > 0 ? (
        <>
          <p className="mb-6 font-mono text-xs text-muted">
            {totalHours.toLocaleString()} hours across {games!.length} games.
            No further comment.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {top.map((g) => (
              <a
                key={g.appid}
                href={`https://store.steampowered.com/app/${g.appid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-xl border border-line bg-surface transition hover:border-accent"
              >
                <Image
                  src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`}
                  alt={g.name}
                  width={460}
                  height={215}
                  className="h-auto w-full"
                />
                <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <p className="truncate text-sm font-medium group-hover:text-accent">
                    {g.name}
                  </p>
                  <p className="shrink-0 font-mono text-xs text-gold">
                    {g.hours.toLocaleString()}h
                  </p>
                </div>
              </a>
            ))}
          </div>
        </>
      ) : (
        <p className="leading-relaxed text-muted">
          Steam isn&apos;t sharing my playtime right now. The profile is at{" "}
          <a
            href={STEAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline decoration-accent/30 underline-offset-4"
          >
            steamcommunity.com/id/PeterZhaoOfficial
          </a>
          , and the hours are real.
        </p>
      )}
    </Reveal>
  );
}
