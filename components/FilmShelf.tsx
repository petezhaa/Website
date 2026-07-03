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
