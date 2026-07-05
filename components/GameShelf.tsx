import Image from "next/image";
import { getSteamGames, getSteamMeta, STEAM_URL } from "@/lib/steam";
import { Reveal } from "@/components/Reveal";

// Server component: what's actually being played right now, then the top
// shelf by lifetime hours — with bars, because numbers alone undersell it.
export async function GameShelf() {
  const [games, meta] = await Promise.all([getSteamGames(), getSteamMeta()]);
  const top = games?.slice(0, 6) ?? [];
  const totalHours = games?.reduce((sum, g) => sum + g.hours, 0) ?? 0;
  const maxHours = top[0]?.hours ?? 1;
  const recent = meta?.recent ?? null;
  const recentGame = recent ? games?.find((g) => g.name === recent.name) : null;

  return (
    <Reveal>
      {top.length > 0 ? (
        <>
          {/* what the last two weeks actually went to */}
          <div className="mb-6 rounded-xl border border-accent/40 bg-surface p-4 sm:flex sm:items-center sm:gap-5">
            {recentGame && (
              <a
                href={`https://store.steampowered.com/app/${recentGame.appid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block w-full max-w-56 shrink-0 overflow-hidden rounded-lg border border-line transition hover:border-accent sm:mb-0"
              >
                <Image
                  src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${recentGame.appid}/header.jpg`}
                  alt={recentGame.name}
                  width={460}
                  height={215}
                  className="h-auto w-full"
                />
              </a>
            )}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                right now
              </p>
              {recent ? (
                <>
                  <p className="mt-1 font-serif text-xl leading-snug">{recent.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {recent.hours2w}h in the last two weeks
                    {recentGame ? ` · ${recentGame.hours.toLocaleString()}h lifetime` : ""}
                  </p>
                </>
              ) : (
                <p className="mt-1 leading-relaxed text-muted">
                  0 hours in the last two weeks. school won this round.
                </p>
              )}
            </div>
          </div>

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
                <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
                  <p className="truncate text-sm font-medium group-hover:text-accent">
                    {g.name}
                  </p>
                  <p className="shrink-0 font-mono text-xs text-gold">
                    {g.hours.toLocaleString()}h
                  </p>
                </div>
                {/* share of the top game's hours: the shelf, to scale */}
                <div className="px-4 pb-3 pt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-gold/70"
                      style={{ width: `${Math.max((g.hours / maxHours) * 100, 3)}%` }}
                    />
                  </div>
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
