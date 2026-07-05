import Image from "next/image";
import {
  getLetterboxd,
  stars,
  LETTERBOXD_URL,
  type LetterboxdData,
} from "@/lib/letterboxd";
import { Reveal } from "@/components/Reveal";

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <p className="font-mono text-2xl font-bold text-accent">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

// GitHub-contributions style: 16 weeks of diary activity, one cell per day.
// Server-rendered divs; the RSS diary only reaches back ~50 films, which is
// exactly the point — the gaps are honest.
function WatchHeatmap({ films }: { films: LetterboxdData["films"] }) {
  const counts = new Map<string, number>();
  for (const f of films) {
    if (f.watchedDate) counts.set(f.watchedDate, (counts.get(f.watchedDate) ?? 0) + 1);
  }
  const WEEKS = 16;
  // pure UTC calendar math throughout: diary dates are plain YYYY-MM-DD
  // strings, so one calendar, no local-vs-UTC drift. Columns are true
  // Sunday-to-Saturday weeks; cells after today simply don't render.
  const DAY = 86_400_000;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const gridStart = todayUTC - (new Date(todayUTC).getUTCDay() + (WEEKS - 1) * 7) * DAY;
  const weeks: { date: string; n: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: { date: string; n: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = gridStart + (w * 7 + d) * DAY;
      const key = new Date(ms).toISOString().slice(0, 10);
      col.push({ date: key, n: counts.get(key) ?? 0, future: ms > todayUTC });
    }
    weeks.push(col);
  }
  const total = films.filter((f) => f.watchedDate).length;

  return (
    <div className="mb-8">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        the last {WEEKS} weeks
      </p>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {col.map((cell) => (
              <div
                key={cell.date}
                title={cell.future ? undefined : `${cell.date}${cell.n ? ` — ${cell.n} film${cell.n > 1 ? "s" : ""}` : ""}`}
                className={`h-3.5 w-3.5 rounded-[3px] ${
                  cell.future
                    ? "bg-transparent"
                    : cell.n >= 2
                    ? "bg-accent"
                    : cell.n === 1
                    ? "bg-accent/45"
                    : "bg-surface-2"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted">
        {total} diary entries in view · darker = double feature
      </p>
    </div>
  );
}

function Shelf({ data }: { data: LetterboxdData }) {
  const recent = data.films.slice(0, 8);
  const thisYear = new Date().getFullYear();

  return (
    <>
      {data.favorites.length > 0 && (
        <div className="mb-10">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            the all-time four
          </p>
          <div className="grid grid-cols-4 gap-3 sm:max-w-md">
            {data.favorites.map((fav) => (
              <a
                key={fav.url}
                href={fav.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
                title={fav.title}
              >
                <div className="overflow-hidden rounded-lg border-2 border-gold/60 transition group-hover:-translate-y-1 group-hover:border-gold">
                  {fav.poster ? (
                    <Image
                      src={fav.poster}
                      alt={`${fav.title} poster`}
                      width={230}
                      height={345}
                      className="h-auto w-full"
                    />
                  ) : (
                    <div className="grid aspect-2/3 place-items-center bg-surface-2 p-2 text-center font-serif text-xs">
                      {fav.title}
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-[11px] leading-tight text-muted group-hover:text-accent">
                  {fav.title}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.filmsAllTime !== null && (
          <StatTile value={String(data.filmsAllTime)} label="films, all time" />
        )}
        {data.filmsThisYear !== null && (
          <StatTile
            value={String(data.filmsThisYear)}
            label={`watched in ${thisYear}`}
          />
        )}
        {data.avgRecentRating !== null && (
          <StatTile
            value={data.avgRecentRating.toFixed(1) + "★"}
            label="avg rating lately"
          />
        )}
        {recent[0] && (
          <StatTile
            value={recent[0].rating !== null ? stars(recent[0].rating) : "—"}
            label={`last watch: ${recent[0].title}`}
          />
        )}
      </div>

      {/* the diary as a heatmap: one cell per day, github-contributions style */}
      <WatchHeatmap films={data.films} />

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {recent.map((film, i) => (
          <a
            key={`${film.url}-${film.watchedDate}-${i}`}
            href={film.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group"
            title={`${film.title} (${film.year})${
              film.rating !== null ? ` — ${stars(film.rating)}` : ""
            }`}
          >
            <div className="overflow-hidden rounded-lg border border-line transition group-hover:-translate-y-1 group-hover:border-accent">
              {film.poster ? (
                <Image
                  src={film.poster}
                  alt={`${film.title} poster`}
                  width={230}
                  height={345}
                  className="h-auto w-full"
                />
              ) : (
                <div className="grid aspect-2/3 place-items-center bg-surface-2 p-2 text-center font-serif text-xs">
                  {film.title}
                </div>
              )}
            </div>
            <p className="mt-1.5 truncate text-[11px] leading-tight text-muted group-hover:text-accent">
              {film.title}
            </p>
            <p className="font-mono text-[10px] text-gold">
              {film.rating !== null ? stars(film.rating) : "unrated"}
              {film.rewatch && <span className="text-muted"> ↻</span>}
            </p>
          </a>
        ))}
      </div>
    </>
  );
}

// Server component: pulls the Letterboxd diary at render time (ISR, 1h).
export async function FilmShelf() {
  const data = await getLetterboxd();

  return (
    <Reveal>
      {data && data.films.length > 0 ? (
        <Shelf data={data} />
      ) : (
        <p className="leading-relaxed text-muted">
          Letterboxd isn&apos;t answering right now — the diary lives at{" "}
          <a
            href={LETTERBOXD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline decoration-accent/30 underline-offset-4"
          >
            letterboxd.com/petezha
          </a>
          .
        </p>
      )}
      <p className="mt-6 text-sm text-muted">
        Pulled live from my{" "}
        <a
          href={LETTERBOXD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-accent/30 underline-offset-4"
        >
          Letterboxd
        </a>
        , so judge accordingly.
      </p>
    </Reveal>
  );
}
