import { getLetterboxd } from "@/lib/letterboxd";
import { getSteamGames, getSteamMeta, getRareAchievements } from "@/lib/steam";
import { getGithubStats } from "@/lib/github";
import { getSiteCode } from "@/lib/sitecode";
import { Reveal } from "@/components/Reveal";
import { StatsCharts, type StatsData } from "@/components/StatsCharts";

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Abramowitz–Stegun approximation of the normal CDF
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const k = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k -
      0.284496736) *
      k +
      0.254829592) *
      k *
      Math.exp(-x * x);
  return 0.5 * (1 + (z < 0 ? -erf : erf));
}

// Wilson-Hilferty: chi-square upper tail via the normal CDF
function chiSqP(x: number, k: number): number {
  const z =
    (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - phi(z);
}

const meanOf = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
function pearson(xs: number[], ys: number[]): number | null {
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
const varOf = (a: number[], m: number) =>
  a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);

export async function StatsSection() {
  const [lb, steam, steamMeta, rare, github] = await Promise.all([
    getLetterboxd(),
    getSteamGames(),
    getSteamMeta(),
    getRareAchievements(),
    getGithubStats(),
  ]);
  const siteCode = getSiteCode();

  // film rating distribution + moments
  let ratings: StatsData["ratings"] = null;
  let drift: StatsData["drift"] = null;
  const rated = (lb?.films.filter((f) => f.rating !== null) ?? []).map(
    (f) => f.rating as number
  );
  if (rated.length >= 5) {
    const bins = Array.from({ length: 10 }, (_, i) => ({
      stars: (i + 1) / 2,
      count: 0,
    }));
    for (const r of rated) {
      const idx = Math.round(r * 2) - 1;
      if (bins[idx]) bins[idx].count++;
    }
    const n = rated.length;
    const mean = rated.reduce((s, r) => s + r, 0) / n;
    const sd = Math.sqrt(
      rated.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)
    );
    const pGte4 = rated.filter((r) => r >= 4).length / n;

    // inference: this window is a sample of my whole diary. 95% CI on the
    // mean, plus a test of H0: "I rate like the average letterboxd user"
    // (the site-wide mean rating is roughly 3.2).
    const se = sd / Math.sqrt(n);
    const ci95 = 1.96 * se;
    const mu0 = 3.2;
    const t = (mean - mu0) / se;
    const pValue = 2 * (1 - phi(Math.abs(t)));

    // second test: do I rate differently on weekends? (Welch's t)
    const dated = (lb?.films ?? [])
      .filter((f) => f.rating !== null && f.watchedDate)
      .map((f) => ({
        date: f.watchedDate,
        title: f.title,
        rating: f.rating as number,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const dayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
    const wknd = dated.filter((x) => [0, 6].includes(dayOf(x.date)));
    const wk = dated.filter((x) => ![0, 6].includes(dayOf(x.date)));
    let wkndTest: NonNullable<StatsData["ratings"]>["wkndTest"] = null;
    if (wknd.length >= 5 && wk.length >= 5) {
      const m1 = meanOf(wknd.map((x) => x.rating));
      const m2 = meanOf(wk.map((x) => x.rating));
      const v1 = varOf(wknd.map((x) => x.rating), m1);
      const v2 = varOf(wk.map((x) => x.rating), m2);
      const tW = (m1 - m2) / Math.sqrt(v1 / wknd.length + v2 / wk.length);
      wkndTest = {
        mWknd: m1,
        mWk: m2,
        nWknd: wknd.length,
        nWk: wk.length,
        t: tW,
        p: 2 * (1 - phi(Math.abs(tW))),
      };
    }

    ratings = {
      bins,
      total: n,
      mean,
      sd,
      pGte4,
      ci95,
      mu0,
      t,
      pValue,
      population: lb?.filmsAllTime ?? null,
      wkndTest,
    };

    // control chart: rolling mean of ratings in watch order, ±1σ band
    const W = 10;
    if (dated.length >= W + 2) {
      const points = [];
      for (let i = W - 1; i < dated.length; i++) {
        const win = dated.slice(i - W + 1, i + 1).map((d) => d.rating);
        const m = meanOf(win);
        points.push({
          date: dated[i].date,
          title: dated[i].title,
          rating: dated[i].rating,
          mean: m,
          sd: Math.sqrt(varOf(win, m)),
        });
      }
      drift = {
        points,
        window: W,
        delta: points[points.length - 1].mean - points[0].mean,
      };
    }
  }

  // playtime distribution
  let hours: StatsData["hours"] = null;
  let lorenz: StatsData["lorenz"] = null;
  if (steam && steam.length >= 8) {
    const values = steam.map((g) => g.hours).sort((a, b) => a - b);
    const q1 = quantile(values, 0.25);
    const median = quantile(values, 0.5);
    const q3 = quantile(values, 0.75);
    const hiFence = q3 + 1.5 * (q3 - q1);
    const inliers = values.filter((v) => v <= hiFence);
    hours = {
      min: values[0],
      q1,
      median,
      q3,
      whiskerHi: inliers[inliers.length - 1],
      outliers: steam
        .filter((g) => g.hours > hiFence)
        .map((g) => ({ name: g.name, hours: g.hours }))
        .sort((a, b) => a.hours - b.hours), // ascending: last = biggest
      count: values.length,
    };

    // Lorenz curve of playtime concentration + Gini coefficient
    const total = values.reduce((s, v) => s + v, 0);
    let cum = 0;
    const points: [number, number][] = [[0, 0]];
    values.forEach((v, i) => {
      cum += v;
      points.push([(i + 1) / values.length, cum / total]);
    });
    // Gini via trapezoids: 1 - 2 * area under the Lorenz curve
    let area = 0;
    for (let i = 1; i < points.length; i++) {
      area +=
        ((points[i][0] - points[i - 1][0]) *
          (points[i][1] + points[i - 1][1])) /
        2;
    }
    const top3 = steam.slice(0, 3).reduce((s, g) => s + g.hours, 0) / total;
    lorenz = { points, gini: 1 - 2 * area, top3Share: top3 };
  }

  // nostalgia: does a film's release year predict my rating?
  let nostalgia: StatsData["nostalgia"] = null;
  const yearRated = (lb?.films ?? [])
    .filter((f) => f.rating !== null && /^\d{4}$/.test(f.year))
    .map((f) => ({
      year: parseInt(f.year, 10),
      rating: f.rating as number,
      title: f.title,
    }));
  if (yearRated.length >= 10) {
    const xs = yearRated.map((p) => p.year);
    const ys = yearRated.map((p) => p.rating);
    const r = pearson(xs, ys);
    if (r !== null) {
      const n = xs.length;
      const t = r * Math.sqrt((n - 2) / Math.max(1 - r * r, 1e-9));
      const mx = meanOf(xs);
      const slope =
        (r * Math.sqrt(varOf(ys, meanOf(ys)))) / Math.sqrt(varOf(xs, mx));
      nostalgia = {
        points: yearRated,
        r,
        n,
        t,
        p: 2 * (1 - phi(Math.abs(t))),
        slope,
        intercept: meanOf(ys) - slope * mx,
        minYear: Math.min(...xs),
        maxYear: Math.max(...xs),
      };
    }
  }

  // guess-my-rating: a playable card built from the same scraped posters and
  // a self-contained least-squares fit (so it survives even when the Nostalgia
  // chart's n>=10 gate fails). You guess my star rating; the model guesses too.
  let guessGame: StatsData["guessGame"] = null;
  const guessable = (lb?.films ?? [])
    .filter((f) => f.rating !== null && f.poster && /^\d{4}$/.test(f.year))
    .map((f) => ({
      title: f.title,
      year: parseInt(f.year, 10),
      rating: f.rating as number,
      poster: f.poster as string,
    }));
  if (guessable.length >= 8) {
    const xs = guessable.map((p) => p.year);
    const ys = guessable.map((p) => p.rating);
    const r = pearson(xs, ys);
    const mx = meanOf(xs);
    const vx = varOf(xs, mx);
    let slope = 0;
    let intercept = meanOf(ys);
    if (r !== null && vx > 0) {
      slope = (r * Math.sqrt(varOf(ys, meanOf(ys)))) / Math.sqrt(vx);
      intercept = meanOf(ys) - slope * mx;
    }
    // deterministic FNV-1a shuffle: stable order across renders/revalidations,
    // no Math.random reaching the client
    const hash = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    const films = [...guessable]
      .sort((a, b) => hash(a.title + a.year) - hash(b.title + b.year))
      .slice(0, 14);
    guessGame = { films, slope, intercept };
  }

  // momentum: does the previous rating leak into the next one? (lag-1)
  let momentum: StatsData["momentum"] = null;
  const chrono = (lb?.films ?? [])
    .filter((f) => f.rating !== null && f.watchedDate)
    .sort((a, b) => a.watchedDate.localeCompare(b.watchedDate));
  if (chrono.length >= 12) {
    const pairs = [];
    for (let i = 1; i < chrono.length; i++) {
      pairs.push({
        a: chrono[i - 1].rating as number,
        b: chrono[i].rating as number,
        from: chrono[i - 1].title,
        to: chrono[i].title,
      });
    }
    const r1 = pearson(
      pairs.map((p) => p.a),
      pairs.map((p) => p.b)
    );
    if (r1 !== null) {
      const z = r1 * Math.sqrt(pairs.length);
      momentum = { pairs, r1, n: pairs.length, z, p: 2 * (1 - phi(Math.abs(z))) };
    }
  }

  // weekday: is any day of the week actually movie night? (chi-square)
  let weekday: StatsData["weekday"] = null;
  const datedAll = (lb?.films ?? []).filter((f) => f.watchedDate);
  if (datedAll.length >= 14) {
    const counts = Array(7).fill(0) as number[]; // monday-first
    for (const f of datedAll) {
      const d = new Date(`${f.watchedDate}T12:00:00Z`).getUTCDay();
      counts[(d + 6) % 7]++;
    }
    const n = datedAll.length;
    const e = n / 7;
    const chi2 = counts.reduce((sum, o) => sum + ((o - e) ** 2) / e, 0);
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    weekday = {
      counts,
      n,
      chi2,
      p: chiSqP(chi2, 6),
      topDay: days[counts.indexOf(Math.max(...counts))],
    };
  }

  // survival: how much of the library is still alive past h hours?
  let survival: StatsData["survival"] = null;
  if (steam && steam.length >= 8) {
    survival = {
      // steam is sorted by hours desc, so (i+1)/n = share with >= that many
      points: steam.map((g, i) => ({
        x: g.hours,
        y: (i + 1) / steam.length,
        name: g.name,
      })),
      median: quantile(
        steam.map((g) => g.hours).sort((a, b) => a - b),
        0.5
      ),
      totalOwned: steamMeta?.totalOwned ?? null,
      neverPlayed: steamMeta?.neverPlayed ?? null,
      recent: steamMeta?.recent ?? null,
    };
  }

  const counts: StatsData["counts"] = {
    filmsAllTime: lb?.filmsAllTime ?? null,
    steamHours: steam ? steam.reduce((sum, g) => sum + g.hours, 0) : null,
    gamesOwned: steamMeta?.totalOwned ?? null,
  };

  const topGames: StatsData["topGames"] =
    steam?.slice(0, 8).map((g) => ({ name: g.name, hours: g.hours })) ?? null;

  if (!ratings && !hours && !topGames) {
    return (
      <p className="leading-relaxed text-muted">
        The stats sources aren&apos;t answering right now. Check back shortly.
      </p>
    );
  }

  return (
    <Reveal>
      <StatsCharts
        data={{
          ratings,
          drift,
          nostalgia,
          guessGame,
          momentum,
          weekday,
          hours,
          lorenz,
          survival,
          achievements: rare,
          topGames,
          github,
          siteCode,
          counts,
        }}
      />
    </Reveal>
  );
}
