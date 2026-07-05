import Image from "next/image";
import { getSteamGames, getSteamMeta, getRareAchievements, STEAM_URL } from "@/lib/steam";
import { Reveal } from "@/components/Reveal";
import { StardewPeter } from "@/components/StardewPeter";

// Server component: what's actually being played right now, the damage in
// numbers, where the hours actually went, then the top shelf.
export async function GameShelf() {
  const [games, meta, rare] = await Promise.all([
    getSteamGames(),
    getSteamMeta(),
    getRareAchievements(),
  ]);
  const top = games?.slice(0, 6) ?? [];
  const totalHours = games?.reduce((sum, g) => sum + g.hours, 0) ?? 0;
  const maxHours = top[0]?.hours ?? 1;
  const recent = meta?.recent ?? null;
  const recentGame = recent ? games?.find((g) => g.name === recent.name) : null;
  const rarest = rare?.[0] ?? null;
  // where the hours went: top five games' share of the whole library
  const strip = top.slice(0, 5).map((g) => ({
    name: g.name,
    pct: totalHours > 0 ? (g.hours / totalHours) * 100 : 0,
  }));
  const stripRest = Math.max(0, 100 - strip.reduce((s, x) => s + x.pct, 0));
  const stripColors = ["bg-accent", "bg-gold", "bg-moss", "bg-accent/60", "bg-gold/60"];

  return (
    <Reveal>
      {top.length > 0 ? (
        <>
          {/* what the last two weeks actually went to */}
          <div className="panel mb-6 border-accent/40 p-4 sm:flex sm:items-center sm:gap-5">
            {recentGame && (
              <a
                href={`https://store.steampowered.com/app/${recentGame.appid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block w-full max-w-56 shrink-0 overflow-hidden rounded-[2px] border border-line transition hover:border-accent sm:mb-0"
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
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                right now
              </p>
              {recent ? (
                <>
                  <p className="mt-1 font-mono text-xl font-bold leading-snug">{recent.name}</p>
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
            <div className="hidden shrink-0 flex-col items-center gap-1 pr-2 sm:flex">
              <StardewPeter size={52} />
              <p className="font-mono text-sm text-muted">me, in the valley</p>
            </div>
          </div>

          {/* the damage, quantified */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="panel px-5 py-4">
              <p className="font-mono text-2xl font-bold text-accent">
                {Math.round(totalHours / 24)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                full days played ({totalHours.toLocaleString()}h)
              </p>
            </div>
            {meta && (
              <div className="panel px-5 py-4">
                <p className="font-mono text-2xl font-bold text-accent">{meta.totalOwned}</p>
                <p className="mt-0.5 text-xs text-muted">games owned</p>
              </div>
            )}
            {meta && (
              <div className="panel px-5 py-4">
                <p className="font-mono text-2xl font-bold text-accent">{meta.neverPlayed}</p>
                <p className="mt-0.5 text-xs text-muted">never launched. the graveyard</p>
              </div>
            )}
            {rarest && (
              <div className="panel px-5 py-4">
                <p className="font-mono text-2xl font-bold text-accent">
                  {rarest.globalPct.toFixed(1)}%
                </p>
                <p className="mt-0.5 truncate text-xs text-muted" title={`${rarest.name} — ${rarest.game}`}>
                  of players have my rarest achievement
                </p>
              </div>
            )}
          </div>

          {/* where the hours actually went */}
          {totalHours > 0 && (
            <div className="mb-6">
              <div className="flex h-3 overflow-hidden rounded-[2px]">
                {strip.map((s, i) => (
                  <div
                    key={s.name}
                    title={`${s.name} — ${Math.round(s.pct)}%`}
                    className={`h-full ${stripColors[i]}`}
                    style={{ width: `${s.pct}%` }}
                  />
                ))}
                <div className="h-full bg-surface-2" style={{ width: `${stripRest}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted">
                {strip.map((s, i) => (
                  <span key={s.name} className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-sm ${stripColors[i]}`} />
                    {s.name} {Math.round(s.pct)}%
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm bg-surface-2" />
                  the other {games!.length - 5} games {Math.round(stripRest)}%
                </span>
              </div>
            </div>
          )}

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
                className="panel group overflow-hidden transition hover:border-accent"
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
                  <div className="h-1.5 overflow-hidden rounded-[2px] bg-surface-2">
                    <div
                      className="h-full rounded-[2px] bg-gold/70"
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
            className="tlink"
          >
            steamcommunity.com/id/PeterZhaoOfficial
          </a>
          , and the hours are real.
        </p>
      )}
    </Reveal>
  );
}
