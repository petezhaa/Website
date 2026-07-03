// Letterboxd has no public API, but every profile ships a public RSS diary
// feed and a stats block on the profile page. Both are fetched server-side
// and revalidated hourly, so the section keeps itself up to date.

const USERNAME = "petezha";
export const LETTERBOXD_URL = `https://letterboxd.com/${USERNAME}/`;

export type Film = {
  title: string;
  year: string;
  rating: number | null; // 0.5–5, null if unrated
  watchedDate: string;
  rewatch: boolean;
  poster: string | null;
  url: string;
};

export type Favorite = {
  title: string;
  url: string;
  poster: string | null;
};

export type LetterboxdData = {
  films: Film[];
  favorites: Favorite[];
  filmsAllTime: number | null;
  filmsThisYear: number | null;
  avgRecentRating: number | null;
};

function tag(item: string, name: string): string | null {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
}

function parseItem(item: string): Film | null {
  const title = tag(item, "letterboxd:filmTitle");
  if (!title) return null; // lists and reviews of non-films
  const ratingRaw = tag(item, "letterboxd:memberRating");
  const posterMatch = item.match(/<img src="([^"]+)"/);
  return {
    title,
    year: tag(item, "letterboxd:filmYear") ?? "",
    rating: ratingRaw ? parseFloat(ratingRaw) : null,
    watchedDate: tag(item, "letterboxd:watchedDate") ?? "",
    rewatch: tag(item, "letterboxd:rewatch") === "Yes",
    poster: posterMatch ? posterMatch[1].replace(/&amp;/g, "&") : null,
    url: tag(item, "link") ?? LETTERBOXD_URL,
  };
}

export async function getLetterboxd(): Promise<LetterboxdData | null> {
  try {
    const [rssRes, profileRes] = await Promise.all([
      fetch(`https://letterboxd.com/${USERNAME}/rss/`, {
        next: { revalidate: 3600 },
      }),
      fetch(LETTERBOXD_URL, { next: { revalidate: 3600 } }),
    ]);
    if (!rssRes.ok) return null;

    const xml = await rssRes.text();
    const films = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map((m) => parseItem(m[1]))
      .filter((f): f is Film => f !== null);

    let filmsAllTime: number | null = null;
    let filmsThisYear: number | null = null;
    let favorites: Favorite[] = [];
    if (profileRes.ok) {
      const html = await profileRes.text();
      const stats = [
        ...html.matchAll(
          /<span class="value">([\d,]+)<\/span>\s*<span class="definition[^"]*">([^<]+)<\/span>/g
        ),
      ];
      for (const [, value, label] of stats) {
        const n = parseInt(value.replace(/,/g, ""), 10);
        if (/^films$/i.test(label.trim())) filmsAllTime = n;
        if (/this year/i.test(label.trim())) filmsThisYear = n;
      }

      // favorites: profile lists slugs + names; posters come from each
      // film page's og:image (the profile lazy-loads its posters)
      const favSection = html.match(
        /<section id="favourites"[\s\S]*?<\/section>/
      );
      if (favSection) {
        const slugs = [...favSection[0].matchAll(/data-item-slug="([^"]+)"/g)];
        const names = [...favSection[0].matchAll(/data-item-name="([^"]+)"/g)];
        favorites = await Promise.all(
          slugs.slice(0, 4).map(async ([, slug], i) => {
            const url = `https://letterboxd.com/film/${slug}/`;
            let poster: string | null = null;
            try {
              const page = await fetch(url, { next: { revalidate: 86400 } });
              if (page.ok) {
                const m = (await page.text()).match(
                  /property="og:image"\s+content="([^"]+)"/
                );
                poster = m ? m[1] : null;
              }
            } catch {
              poster = null;
            }
            return { title: names[i]?.[1] ?? slug, url, poster };
          })
        );
      }
    }

    const rated = films.filter((f) => f.rating !== null);
    const avgRecentRating =
      rated.length > 0
        ? rated.reduce((sum, f) => sum + (f.rating ?? 0), 0) / rated.length
        : null;

    return { films, favorites, filmsAllTime, filmsThisYear, avgRecentRating };
  } catch {
    return null;
  }
}

export function stars(rating: number): string {
  return "★".repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? "½" : "");
}
