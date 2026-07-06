// Steam playtime via the official Web API, revalidated every 6 hours.
// Steam login-walls the community games page for everyone now, so the API
// is the only route. Needs STEAM_API_KEY in .env.local (free, instant:
// https://steamcommunity.com/dev/apikey, any domain works, even localhost).
// Profile game details must be public (they are).

const STEAM_ID64 = "76561198195642403"; // PeterZhaoOfficial
export const STEAM_URL = "https://steamcommunity.com/id/PeterZhaoOfficial/";

export type SteamGame = {
  appid: number;
  name: string;
  hours: number;
};

export type SteamMeta = {
  totalOwned: number;
  neverPlayed: number; // owned, zero minutes: the graveyard
  recent: { name: string; hours2w: number } | null; // last two weeks
};

export type RareAchievement = {
  game: string;
  name: string;
  description: string;
  globalPct: number; // share of that game's players who have it
};

// Rarest achievements I actually hold, across my most-played games,
// ranked by global unlock rate. Games without achievement APIs are skipped.
export async function getRareAchievements(): Promise<
  RareAchievement[] | null
> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return null;
  const games = (await getSteamGames())?.slice(0, 6);
  if (!games) return null;

  const perGame = await Promise.all(
    games.map(async (g) => {
      try {
        const [mineRes, globalRes] = await Promise.all([
          fetch(
            `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${STEAM_ID64}&appid=${g.appid}&l=english`,
            { next: { revalidate: 21600 } }
          ),
          fetch(
            `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${g.appid}`,
            { next: { revalidate: 86400 } }
          ),
        ]);
        if (!mineRes.ok || !globalRes.ok) return [];
        const mine = (await mineRes.json()) as {
          playerstats?: {
            achievements?: Array<{
              apiname: string;
              achieved: number;
              name?: string;
              description?: string;
            }>;
          };
        };
        const global = (await globalRes.json()) as {
          achievementpercentages?: {
            achievements?: Array<{ name: string; percent: string | number }>;
          };
        };
        const pct = new Map(
          (global.achievementpercentages?.achievements ?? []).map((a) => [
            a.name,
            Number(a.percent),
          ])
        );
        return (mine.playerstats?.achievements ?? [])
          .filter((a) => a.achieved === 1 && pct.has(a.apiname))
          .map((a) => ({
            game: g.name,
            name: a.name ?? a.apiname,
            description: a.description ?? "",
            globalPct: pct.get(a.apiname)!,
          }));
      } catch {
        return [];
      }
    })
  );

  const all = perGame.flat().sort((a, b) => a.globalPct - b.globalPct);
  return all.length ? all.slice(0, 7) : null;
}

type OwnedGame = {
  appid: number;
  name: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
};

// One fetch feeds both getSteamGames and getSteamMeta; Next dedupes the
// identical URL within a render, so this stays a single API call.
async function fetchOwnedGames(): Promise<OwnedGame[] | null> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return null;
  try {
    const url =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
      `?key=${key}&steamid=${STEAM_ID64}&include_appinfo=1&include_played_free_games=1&format=json`;
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { games?: OwnedGame[] } };
    const games = data.response?.games;
    return games && games.length > 0 ? games : null;
  } catch {
    return null;
  }
}

export async function getSteamGames(): Promise<SteamGame[] | null> {
  const games = await fetchOwnedGames();
  if (!games) return null;
  return games
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      hours: Math.round((g.playtime_forever ?? 0) / 60),
    }))
    .filter((g) => g.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

export async function getSteamMeta(): Promise<SteamMeta | null> {
  const games = await fetchOwnedGames();
  if (!games) return null;
  const neverPlayed = games.filter((g) => (g.playtime_forever ?? 0) === 0).length;
  const top2w = games
    .filter((g) => (g.playtime_2weeks ?? 0) > 0)
    .sort((a, b) => (b.playtime_2weeks ?? 0) - (a.playtime_2weeks ?? 0))[0];
  return {
    totalOwned: games.length,
    neverPlayed,
    recent: top2w
      ? {
          name: top2w.name,
          hours2w: Math.round(((top2w.playtime_2weeks ?? 0) / 60) * 10) / 10,
        }
      : null,
  };
}
