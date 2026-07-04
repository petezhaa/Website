"use client";

import { useState, type ReactNode } from "react";
import { bumpVibe } from "@/lib/vibeBus";

export type StatsData = {
  ratings: {
    bins: { stars: number; count: number }[];
    total: number;
    mean: number;
    sd: number;
    pGte4: number;
    ci95: number;
    mu0: number;
    t: number;
    pValue: number;
    population: number | null;
    wkndTest: {
      mWknd: number;
      mWk: number;
      nWknd: number;
      nWk: number;
      t: number;
      p: number;
    } | null;
  } | null;
  drift: {
    points: {
      date: string;
      title: string;
      rating: number;
      mean: number;
      sd: number;
    }[];
    window: number;
    delta: number;
  } | null;
  hours: {
    min: number;
    q1: number;
    median: number;
    q3: number;
    whiskerHi: number;
    outliers: { name: string; hours: number }[];
    count: number;
  } | null;
  lorenz: {
    points: [number, number][];
    gini: number;
    top3Share: number;
  } | null;
  nostalgia: {
    points: { year: number; rating: number; title: string }[];
    r: number;
    n: number;
    t: number;
    p: number;
    slope: number;
    intercept: number;
    minYear: number;
    maxYear: number;
  } | null;
  momentum: {
    pairs: { a: number; b: number; from: string; to: string }[];
    r1: number;
    n: number;
    z: number;
    p: number;
  } | null;
  survival: {
    points: { x: number; y: number; name: string }[];
    median: number;
    totalOwned: number | null;
    neverPlayed: number | null;
    recent: { name: string; hours2w: number } | null;
  } | null;
  achievements:
    | { game: string; name: string; description: string; globalPct: number }[]
    | null;
  topGames: { name: string; hours: number }[] | null;
  github: { repos: number } | null;
  siteCode: { ts: number; rust: number; css: number; wasmKB: number } | null;
};

type Tip = { x: number; y: number; lines: string[] } | null;

const MARK = "var(--chart)";
const GRID = "var(--line)";
const INK_MUTED = "var(--muted)";

// bar with a 4px rounded data-end and a square baseline
function vBarPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${
    x + w - r
  },${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
function hBarPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h / 2, w);
  return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${
    x + w
  },${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
}

function Card({
  title,
  sub,
  table,
  children,
}: {
  title: string;
  sub: string;
  table: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-4 font-mono text-[11px] text-muted">{sub}</p>
      {children}
      <details className="mt-3" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && bumpVibe("curiosity", 12)}>
        <summary className="cursor-pointer font-mono text-[11px] text-muted transition hover:text-accent">
          view as table
        </summary>
        <div className="mt-2 max-h-44 overflow-y-auto">{table}</div>
      </details>
    </div>
  );
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: "translate(-50%, -110%)" }}
    >
      {tip.lines.map((l) => (
        <p key={l} className="whitespace-nowrap text-xs first:font-medium">
          {l}
        </p>
      ))}
    </div>
  );
}

const tableCls = "w-full text-left font-mono text-[11px] text-muted";
const thCls = "border-b border-line py-1 pr-4 font-normal";
const tdCls = "border-b border-line py-1 pr-4 tabular-nums";

/* ---------------- film ratings histogram ---------------- */
function Ratings({ data }: { data: NonNullable<StatsData["ratings"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 180;
  const PAD = { l: 26, r: 8, t: 14, b: 22 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const max = Math.max(...data.bins.map((b) => b.count), 1);
  const slot = plotW / data.bins.length;
  const barW = Math.min(24, slot - 2);
  const yTicks = [0, Math.ceil(max / 2), max];
  const peak = data.bins.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <Card
      title="How I rate films"
      sub={`n=${data.total} recent watches · μ ${data.mean.toFixed(2)}★ · σ ${data.sd.toFixed(2)} · P(★≥4) = ${data.pGte4.toFixed(2)}`}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>rating</th>
              <th className={thCls}>films</th>
            </tr>
          </thead>
          <tbody>
            {data.bins.map((b) => (
              <tr key={b.stars}>
                <td className={tdCls}>{b.stars}★</td>
                <td className={tdCls}>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {yTicks.map((t) => {
            const y = PAD.t + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={PAD.l - 5} y={y + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                  {t}
                </text>
              </g>
            );
          })}
          {data.bins.map((b, i) => {
            const h = (b.count / max) * plotH;
            const x = PAD.l + i * slot + (slot - barW) / 2;
            const y = PAD.t + plotH - h;
            return (
              <g key={b.stars}>
                {b.count > 0 && (
                  <path d={vBarPath(x, y, barW, h)} fill={MARK} />
                )}
                {b === peak && b.count > 0 && (
                  <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                    {b.count}
                  </text>
                )}
                <text x={PAD.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={9.5} fill={INK_MUTED}>
                  {Number.isInteger(b.stars) ? `${b.stars}★` : ""}
                </text>
                <rect
                  x={PAD.l + i * slot}
                  y={PAD.t}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
                    setTip({
                      x: ((PAD.l + i * slot + slot / 2) / W) * r.width,
                      y: (y / H) * r.height,
                      lines: [`${b.stars}★`, `${b.count} film${b.count === 1 ? "" : "s"}`],
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
        <div className="mt-3 space-y-1 border-t border-line pt-2 font-mono text-[10.5px] leading-relaxed text-muted">
          <p>
            sample of {data.total}
            {data.population ? ` from a population of ${data.population}` : ""} · 95% CI: μ ∈ [
            {(data.mean - data.ci95).toFixed(2)}, {(data.mean + data.ci95).toFixed(2)}]
          </p>
          <p>
            H₀: I rate like the average user (μ = {data.mu0}) → t = {data.t.toFixed(2)}, p ={" "}
            {data.pValue < 0.001 ? "<0.001" : data.pValue.toFixed(3)} →{" "}
            {data.pValue < 0.05 ? "rejected. I am built different, statistically." : "fail to reject. I rate like everyone else, statistically."}
          </p>
          {data.wkndTest && (
            <p>
              H₀: weekends don&apos;t change my ratings (μ_wknd {data.wkndTest.mWknd.toFixed(2)}, n={data.wkndTest.nWknd} vs μ_wk {data.wkndTest.mWk.toFixed(2)}, n={data.wkndTest.nWk}; Welch) → t ={" "}
              {data.wkndTest.t.toFixed(2)}, p = {data.wkndTest.p < 0.001 ? "<0.001" : data.wkndTest.p.toFixed(3)} →{" "}
              {data.wkndTest.p < 0.05
                ? data.wkndTest.mWknd > data.wkndTest.mWk
                  ? "rejected. movies hit harder on weekends."
                  : "rejected. I am harsher on weekends."
                : "fail to reject. the weekend changes nothing."}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------------- rating drift control chart ---------------- */
function Drift({ data }: { data: NonNullable<StatsData["drift"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 190;
  const PAD = { l: 30, r: 10, t: 12, b: 22 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const pts = data.points;
  const sx = (i: number) => PAD.l + (i / Math.max(pts.length - 1, 1)) * plotW;
  const sy = (v: number) =>
    PAD.t + (1 - (Math.min(Math.max(v, 0.5), 5) - 0.5) / 4.5) * plotH;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i)},${sy(p.mean)}`).join(" ");
  const band =
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i)},${sy(p.mean + p.sd)}`).join(" ") +
    " " +
    [...pts]
      .reverse()
      .map((p, j) => `L${sx(pts.length - 1 - j)},${sy(p.mean - p.sd)}`)
      .join(" ") +
    " Z";
  const fmt = (d: string) => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`;
  const trend =
    data.delta < -0.05 ? "getting harsher" : data.delta > 0.05 ? "getting softer" : "steady";

  return (
    <Card
      title="Am I becoming a harsher critic?"
      sub={`rolling μ over ${data.window}-film window ±1σ · drift ${data.delta >= 0 ? "+" : ""}${data.delta.toFixed(2)}★ → ${trend}`}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>date</th>
              <th className={thCls}>film</th>
              <th className={thCls}>rating</th>
              <th className={thCls}>rolling μ</th>
            </tr>
          </thead>
          <tbody>
            {pts.map((p, i) => (
              <tr key={`${p.date}-${i}`}>
                <td className={tdCls}>{p.date}</td>
                <td className={tdCls}>{p.title}</td>
                <td className={tdCls}>{p.rating}★</td>
                <td className={tdCls}>{p.mean.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const fx = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((fx - PAD.l) / plotW) * (pts.length - 1));
            const p = pts[Math.min(Math.max(i, 0), pts.length - 1)];
            if (!p) return;
            setTip({
              x: (sx(pts.indexOf(p)) / W) * r.width,
              y: (sy(p.mean) / H) * r.height,
              lines: [p.title, `rated ${p.rating}★ · rolling μ ${p.mean.toFixed(2)}`],
            });
          }}
          onMouseLeave={() => setTip(null)}
        >
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 5} y={sy(v) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                {v}★
              </text>
            </g>
          ))}
          <path d={band} fill={MARK} opacity={0.12} />
          {pts.map((p, i) => (
            <circle key={i} cx={sx(i)} cy={sy(p.rating)} r={2} fill={MARK} opacity={0.35} />
          ))}
          <path d={line} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <text x={PAD.l} y={H - 6} fontSize={10} fill={INK_MUTED}>
            {fmt(pts[0].date)}
          </text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize={10} fill={INK_MUTED}>
            {fmt(pts[pts.length - 1].date)}
          </text>
        </svg>
        <Tooltip tip={tip} />
      </div>
    </Card>
  );
}

/* ---------------- playtime boxplot (log scale) ---------------- */
function HoursBox({ data }: { data: NonNullable<StatsData["hours"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 180;
  const PAD = { l: 10, r: 14, t: 26, b: 24 };
  const plotW = W - PAD.l - PAD.r;
  const maxVal = Math.max(data.outliers[data.outliers.length - 1]?.hours ?? 0, data.whiskerHi);
  const logMax = Math.log10(Math.max(maxVal, 10)) * 1.04;
  const sx = (v: number) => PAD.l + (Math.log10(Math.max(v, 1)) / logMax) * plotW;
  const cy = PAD.t + 52;
  const boxH = 40;
  const ticks = [1, 10, 100, 1000].filter((t) => t <= maxVal * 1.2);
  const topOutlier = data.outliers[data.outliers.length - 1];

  const show = (e: React.MouseEvent<SVGElement>, xSvg: number, ySvg: number, lines: string[]) => {
    const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
    setTip({ x: (xSvg / W) * r.width, y: (ySvg / H) * r.height, lines });
  };

  return (
    <Card
      title="Hours per game, distribution"
      sub={`${data.count} games with playtime, log scale, steam`}
      table={
        <table className={tableCls}>
          <tbody>
            <tr><td className={tdCls}>median</td><td className={tdCls}>{data.median}h</td></tr>
            <tr><td className={tdCls}>quartiles</td><td className={tdCls}>{data.q1}h – {data.q3}h</td></tr>
            <tr><td className={tdCls}>typical range</td><td className={tdCls}>{data.min}h – {data.whiskerHi}h</td></tr>
            {data.outliers.map((o) => (
              <tr key={o.name}>
                <td className={tdCls}>{o.name}</td>
                <td className={tdCls}>{o.hours.toLocaleString()}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} stroke={GRID} strokeWidth={1} />
              <text x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {t.toLocaleString()}h
              </text>
            </g>
          ))}

          {/* whisker */}
          <line x1={sx(data.min)} x2={sx(data.whiskerHi)} y1={cy} y2={cy} stroke={MARK} strokeWidth={2} strokeLinecap="round" />
          <line x1={sx(data.min)} x2={sx(data.min)} y1={cy - 8} y2={cy + 8} stroke={MARK} strokeWidth={2} strokeLinecap="round" />
          <line x1={sx(data.whiskerHi)} x2={sx(data.whiskerHi)} y1={cy - 8} y2={cy + 8} stroke={MARK} strokeWidth={2} strokeLinecap="round" />

          {/* box */}
          <rect
            x={sx(data.q1)}
            y={cy - boxH / 2}
            width={Math.max(sx(data.q3) - sx(data.q1), 2)}
            height={boxH}
            fill={MARK}
            opacity={0.12}
            stroke={MARK}
            strokeWidth={2}
            rx={4}
            onMouseMove={(e) =>
              show(e, (sx(data.q1) + sx(data.q3)) / 2, cy - boxH / 2, [
                "middle half of my library",
                `${data.q1}h to ${data.q3}h per game`,
              ])
            }
            onMouseLeave={() => setTip(null)}
          />
          {/* median */}
          <line x1={sx(data.median)} x2={sx(data.median)} y1={cy - boxH / 2} y2={cy + boxH / 2} stroke={MARK} strokeWidth={2.5} />
          <text x={sx(data.median)} y={cy - boxH / 2 - 6} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
            median {data.median}h
          </text>

          {/* outliers */}
          {data.outliers.map((o) => (
            <circle
              key={o.name}
              cx={sx(o.hours)}
              cy={cy}
              r={4.5}
              fill={MARK}
              stroke="var(--surface)"
              strokeWidth={2}
              onMouseMove={(e) => show(e, sx(o.hours), cy - 8, [o.name, `${o.hours.toLocaleString()}h`])}
              onMouseLeave={() => setTip(null)}
            />
          ))}
          {topOutlier && (
            <text x={sx(topOutlier.hours)} y={cy + 24} textAnchor="end" fontSize={10} fill={INK_MUTED}>
              {topOutlier.name}, {topOutlier.hours.toLocaleString()}h
            </text>
          )}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </Card>
  );
}

/* ---------------- dev tiles: the site measuring itself ---------------- */
function DevTiles({
  github,
  siteCode,
}: {
  github: StatsData["github"];
  siteCode: StatsData["siteCode"];
}) {
  const tiles: { value: string; label: string }[] = [];
  if (github) tiles.push({ value: String(github.repos), label: "public repos on github" });
  if (siteCode) {
    tiles.push(
      { value: siteCode.ts.toLocaleString(), label: "lines of TypeScript in this site" },
      { value: siteCode.rust.toLocaleString(), label: "lines of Rust in the map engine" },
      { value: `${siteCode.wasmKB} KB`, label: "compiled engine, zero dependencies" }
    );
  }
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="font-mono text-2xl font-bold text-accent">{t.value}</p>
          <p className="mt-0.5 text-xs text-muted">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Lorenz curve of playtime concentration ---------------- */
function Lorenz({ data }: { data: NonNullable<StatsData["lorenz"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 200;
  const PAD = { l: 34, r: 12, t: 12, b: 24 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const sx = (v: number) => PAD.l + v * plotW;
  const sy = (v: number) => PAD.t + (1 - v) * plotH;

  const curve = data.points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x)},${sy(y)}`)
    .join(" ");
  const area = `${curve} L${sx(1)},${sy(0)} Z`;

  return (
    <Card
      title="Playtime concentration"
      sub={`Lorenz curve · Gini = ${data.gini.toFixed(2)} · top 3 games hold ${Math.round(data.top3Share * 100)}% of all hours`}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>bottom share of games</th>
              <th className={thCls}>share of hours</th>
            </tr>
          </thead>
          <tbody>
            {[0.25, 0.5, 0.75, 0.9, 1].map((q) => {
              const pt = data.points.reduce((a, p) =>
                Math.abs(p[0] - q) < Math.abs(a[0] - q) ? p : a
              );
              return (
                <tr key={q}>
                  <td className={tdCls}>{Math.round(pt[0] * 100)}%</td>
                  <td className={tdCls}>{Math.round(pt[1] * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const fx = ((e.clientX - r.left) / r.width) * W;
            const q = Math.min(1, Math.max(0, (fx - PAD.l) / plotW));
            const pt = data.points.reduce((a, p) =>
              Math.abs(p[0] - q) < Math.abs(a[0] - q) ? p : a
            );
            setTip({
              x: (sx(pt[0]) / W) * r.width,
              y: (sy(pt[1]) / H) * r.height,
              lines: [
                `bottom ${Math.round(pt[0] * 100)}% of games`,
                `${Math.round(pt[1] * 100)}% of my hours`,
              ],
            });
          }}
          onMouseLeave={() => setTip(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} stroke={GRID} strokeWidth={1} />
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
              <text x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {t * 100}%
              </text>
              <text x={PAD.l - 5} y={sy(t) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                {t * 100}%
              </text>
            </g>
          ))}
          {/* equality line: what a balanced library would look like */}
          <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={INK_MUTED} strokeWidth={1} opacity={0.5} />
          <path d={area} fill={MARK} opacity={0.1} />
          <path d={curve} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <text x={sx(0.55)} y={sy(0.62)} fontSize={9.5} fill={INK_MUTED} transform={`rotate(-37 ${sx(0.55)} ${sy(0.62)})`}>
            perfectly even library
          </text>
        </svg>
        <Tooltip tip={tip} />
      </div>
    </Card>
  );
}

/* ---------------- nostalgia: rating vs release year ---------------- */
function Nostalgia({ data }: { data: NonNullable<StatsData["nostalgia"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 200;
  const PAD = { l: 30, r: 12, t: 12, b: 22 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const span = Math.max(data.maxYear - data.minYear, 1);
  const x0 = data.minYear - span * 0.05;
  const x1 = data.maxYear + span * 0.05;
  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * plotW;
  const sy = (v: number) =>
    PAD.t + (1 - (Math.min(Math.max(v, 0.5), 5) - 0.5) / 4.5) * plotH;
  const ticks: number[] = [];
  const step = span > 60 ? 20 : 10;
  for (let y = Math.ceil(x0 / step) * step; y <= x1; y += step) ticks.push(y);
  const perDecade = data.slope * 10;

  return (
    <Card
      title="Do I overrate old films?"
      sub={`rating vs release year · r = ${data.r.toFixed(2)} · ${perDecade >= 0 ? "+" : ""}${perDecade.toFixed(2)}★ per decade newer · n=${data.n}`}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>film</th>
              <th className={thCls}>year</th>
              <th className={thCls}>rating</th>
            </tr>
          </thead>
          <tbody>
            {[...data.points]
              .sort((a, b) => a.year - b.year)
              .map((p, i) => (
                <tr key={`${p.title}-${i}`}>
                  <td className={tdCls}>{p.title}</td>
                  <td className={tdCls}>{p.year}</td>
                  <td className={tdCls}>{p.rating}★</td>
                </tr>
              ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 5} y={sy(v) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                {v}★
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={sx(t)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
              {t}
            </text>
          ))}
          {/* least-squares fit */}
          <line
            x1={sx(data.minYear)}
            y1={sy(data.slope * data.minYear + data.intercept)}
            x2={sx(data.maxYear)}
            y2={sy(data.slope * data.maxYear + data.intercept)}
            stroke={MARK}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
          {data.points.map((p, i) => (
            <circle
              key={`${p.title}-${i}`}
              cx={sx(p.year)}
              cy={sy(p.rating)}
              r={4}
              fill={MARK}
              opacity={0.5}
              stroke="var(--surface)"
              strokeWidth={1}
              onMouseMove={(e) => {
                const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
                setTip({
                  x: (sx(p.year) / W) * r.width,
                  y: (sy(p.rating) / H) * r.height,
                  lines: [p.title, `${p.year} · rated ${p.rating}★`],
                });
              }}
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </svg>
        <Tooltip tip={tip} />
        <div className="mt-3 border-t border-line pt-2 font-mono text-[10.5px] leading-relaxed text-muted">
          <p>
            H₀: release year tells you nothing about my rating → t = {data.t.toFixed(2)}, p ={" "}
            {data.p < 0.001 ? "<0.001" : data.p.toFixed(3)} →{" "}
            {data.p < 0.05
              ? data.r < 0
                ? "rejected. nostalgia is real and it is inflating my ratings."
                : "rejected. I like them newer, apparently."
              : "fail to reject. a film's age buys it nothing from me."}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- mood momentum: lag-1 autocorrelation ---------------- */
function Momentum({ data }: { data: NonNullable<StatsData["momentum"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 210;
  const PAD = { l: 30, r: 12, t: 14, b: 26 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const sx = (v: number) => PAD.l + ((v - 0.5) / 4.5) * plotW;
  const sy = (v: number) => PAD.t + (1 - (v - 0.5) / 4.5) * plotH;
  // ratings are half-star quantized, so stacked pairs need a deterministic
  // nudge apart (Math.random would break SSR hydration)
  const jit = (i: number, k: number) =>
    ((((i * 7919 + k * 104729) % 13) - 6) / 6) * 0.09;

  return (
    <Card
      title="Does one film's rating leak into the next?"
      sub={`each dot: a rating and the one after it · lag-1 r₁ = ${data.r1.toFixed(2)} · n=${data.n} pairs`}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>watched</th>
              <th className={thCls}>then</th>
            </tr>
          </thead>
          <tbody>
            {data.pairs.map((p, i) => (
              <tr key={i}>
                <td className={tdCls}>{p.from} ({p.a}★)</td>
                <td className={tdCls}>{p.to} ({p.b}★)</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke={GRID} strokeWidth={1} />
              <line x1={sx(v)} x2={sx(v)} y1={PAD.t} y2={H - PAD.b} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 5} y={sy(v) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                {v}★
              </text>
              <text x={sx(v)} y={H - 10} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {v}★
              </text>
            </g>
          ))}
          {/* the "same rating again" diagonal */}
          <line x1={sx(0.5)} y1={sy(0.5)} x2={sx(5)} y2={sy(5)} stroke={INK_MUTED} strokeWidth={1} opacity={0.4} strokeDasharray="3 4" />
          {data.pairs.map((p, i) => (
            <circle
              key={i}
              cx={sx(Math.min(Math.max(p.a + jit(i, 1), 0.5), 5))}
              cy={sy(Math.min(Math.max(p.b + jit(i, 2), 0.5), 5))}
              r={4}
              fill={MARK}
              opacity={0.45}
              stroke="var(--surface)"
              strokeWidth={1}
              onMouseMove={(e) => {
                const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
                setTip({
                  x: (sx(p.a) / W) * r.width,
                  y: (sy(p.b) / H) * r.height,
                  lines: [`${p.from}: ${p.a}★`, `then ${p.to}: ${p.b}★`],
                });
              }}
              onMouseLeave={() => setTip(null)}
            />
          ))}
          <text x={W - PAD.r - 4} y={PAD.t + 10} textAnchor="end" fontSize={9.5} fill={INK_MUTED}>
            next rating ↑ · previous rating →
          </text>
        </svg>
        <Tooltip tip={tip} />
        <div className="mt-3 border-t border-line pt-2 font-mono text-[10.5px] leading-relaxed text-muted">
          <p>
            H₀: consecutive ratings are independent → z = {data.z.toFixed(2)}, p ={" "}
            {data.p < 0.001 ? "<0.001" : data.p.toFixed(3)} →{" "}
            {data.p < 0.05
              ? data.r1 > 0
                ? "rejected. a good film puts me in a good mood and the next one profits."
                : "rejected. a great film makes the next one look worse."
              : "fail to reject. every film gets judged on its own."}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- backlog survival curve ---------------- */
function Survival({ data }: { data: NonNullable<StatsData["survival"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const H = 200;
  const PAD = { l: 34, r: 14, t: 12, b: 24 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const asc = [...data.points].sort((a, b) => a.x - b.x);
  const n = asc.length;
  const maxX = asc[n - 1]?.x ?? 10;
  const logMax = Math.log10(Math.max(maxX, 10)) * 1.04;
  const sx = (v: number) => PAD.l + (Math.log10(Math.max(v, 1)) / logMax) * plotW;
  const sy = (frac: number) => PAD.t + (1 - frac) * plotH;
  const ticks = [1, 10, 100, 1000].filter((t) => t <= maxX * 1.2);

  // step function: S(h) = share of played games with at least h hours
  let d = `M${sx(1)},${sy(1)}`;
  asc.forEach((p, i) => {
    d += ` L${sx(p.x)},${sy((n - i) / n)} L${sx(p.x)},${sy((n - i - 1) / n)}`;
  });
  const sAt = (h: number) => asc.filter((p) => p.x >= h).length / n;
  const s100 = Math.round(sAt(100) * 100);
  const gravePct =
    data.totalOwned && data.neverPlayed !== null
      ? Math.round((data.neverPlayed / data.totalOwned) * 100)
      : null;

  return (
    <Card
      title="How long before I abandon a game?"
      sub={`survival curve: share of library still alive after h hours · log scale · n=${n}`}
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>hours in</th>
              <th className={thCls}>games surviving</th>
            </tr>
          </thead>
          <tbody>
            {[1, 5, 10, 25, 50, 100, 500].filter((h) => h <= maxX).map((h) => (
              <tr key={h}>
                <td className={tdCls}>{h}h</td>
                <td className={tdCls}>{Math.round(sAt(h) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const fx = ((e.clientX - r.left) / r.width) * W;
            const h = Math.pow(10, (Math.min(Math.max(fx - PAD.l, 0), plotW) / plotW) * logMax);
            const frac = sAt(h);
            setTip({
              x: (sx(h) / W) * r.width,
              y: (sy(frac) / H) * r.height,
              lines: [`${Math.round(h)}h in`, `${Math.round(frac * 100)}% of games survive`],
            });
          }}
          onMouseLeave={() => setTip(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 5} y={sy(t) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                {t * 100}%
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} stroke={GRID} strokeWidth={1} />
              <text x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {t.toLocaleString()}h
              </text>
            </g>
          ))}
          <path d={`${d} L${sx(maxX)},${sy(0)} L${sx(1)},${sy(0)} Z`} fill={MARK} opacity={0.08} />
          <path d={d} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* median lifespan marker */}
          <line x1={sx(data.median)} x2={sx(data.median)} y1={sy(0.5) - 14} y2={sy(0.5) + 14} stroke={INK_MUTED} strokeWidth={1} strokeDasharray="3 3" />
          <text x={sx(data.median) + 4} y={sy(0.5) - 16} fontSize={9.5} fill={INK_MUTED}>
            median {data.median}h
          </text>
        </svg>
        <Tooltip tip={tip} />
        <div className="mt-3 space-y-1 border-t border-line pt-2 font-mono text-[10.5px] leading-relaxed text-muted">
          <p>
            half my played games die before {data.median}h · only {s100}% make it past 100h
          </p>
          {gravePct !== null && (
            <p>
              I own {data.totalOwned} games and have never launched {data.neverPlayed} of them ({gravePct}%). the backlog is a graveyard.
            </p>
          )}
          <p>
            {data.recent
              ? `last 2 weeks: ${data.recent.hours2w}h, mostly ${data.recent.name}.`
              : "last 2 weeks: 0 hours. school won."}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- rarest achievements ---------------- */
function RareAchievements({
  data,
}: {
  data: NonNullable<StatsData["achievements"]>;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 440;
  const rowH = 36;
  const PAD = { l: 4, r: 56, t: 4, b: 20 };
  const H = PAD.t + PAD.b + data.length * rowH;
  const plotW = W - PAD.l - PAD.r;
  const max = Math.max(...data.map((a) => a.globalPct), 1);

  return (
    <Card
      title="Rarest achievements I hold"
      sub="P(random player has it) · across my most-played games"
      table={
        <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>achievement</th>
              <th className={thCls}>game</th>
              <th className={thCls}>players</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.game + a.name}>
                <td className={tdCls}>{a.name}</td>
                <td className={tdCls}>{a.game}</td>
                <td className={tdCls}>{a.globalPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {data.map((a, i) => {
            const y = PAD.t + i * rowH;
            const w = Math.max((a.globalPct / max) * plotW, 3);
            return (
              <g
                key={a.game + a.name}
                onMouseMove={(e) => {
                  const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
                  setTip({
                    x: ((PAD.l + w) / W) * r.width,
                    y: (y / H) * r.height,
                    lines: [
                      a.name,
                      `${a.game} · ${a.globalPct.toFixed(1)}% of players`,
                      ...(a.description ? [a.description] : []),
                    ],
                  });
                }}
                onMouseLeave={() => setTip(null)}
              >
                <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
                <text x={PAD.l} y={y + 10} fontSize={10.5} fill="var(--fg)">
                  {a.name.length > 34 ? a.name.slice(0, 33) + "…" : a.name}
                  <tspan fill={INK_MUTED}> · {a.game.length > 20 ? a.game.slice(0, 19) + "…" : a.game}</tspan>
                </text>
                <path d={hBarPath(PAD.l, y + 15, w, 12)} fill={MARK} />
                <text x={PAD.l + w + 6} y={y + 25} fontSize={10.5} fill={INK_MUTED} className="tabular-nums">
                  {a.globalPct.toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </Card>
  );
}

/* ---------------- top games bars ---------------- */
function TopGames({ data }: { data: NonNullable<StatsData["topGames"]> }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 640;
  const rowH = 30;
  // names live in their own left column so they can never clip inside a bar
  const PAD = { l: 168, r: 64, t: 4, b: 4 };
  const H = PAD.t + PAD.b + data.length * rowH;
  const plotW = W - PAD.l - PAD.r;
  const max = data[0]?.hours ?? 1;

  return (
    <Card
      title="Most played"
      sub="top games by hours, steam"
      table={
        <table className={tableCls}>
          <tbody>
            {data.map((g) => (
              <tr key={g.name}>
                <td className={tdCls}>{g.name}</td>
                <td className={tdCls}>{g.hours.toLocaleString()}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {data.map((g, i) => {
            const y = PAD.t + i * rowH;
            const w = Math.max((g.hours / max) * plotW, 3);
            return (
              <g
                key={g.name}
                onMouseMove={(e) => {
                  const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
                  setTip({
                    x: ((PAD.l + w) / W) * r.width,
                    y: (y / H) * r.height,
                    lines: [g.name, `${g.hours.toLocaleString()} hours`],
                  });
                }}
                onMouseLeave={() => setTip(null)}
              >
                <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
                <text x={PAD.l - 10} y={y + 19} textAnchor="end" fontSize={11.5} fill="var(--fg)">
                  {g.name.length > 24 ? g.name.slice(0, 23) + "…" : g.name}
                </text>
                <path d={hBarPath(PAD.l, y + 6, w, 18)} fill={MARK} />
                <text x={PAD.l + w + 6} y={y + 19} fontSize={10.5} fill={INK_MUTED} className="tabular-nums">
                  {g.hours.toLocaleString()}h
                </text>
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </Card>
  );
}

export function StatsCharts({ data }: { data: StatsData }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <DevTiles github={data.github} siteCode={data.siteCode} />
      {data.ratings && <Ratings data={data.ratings} />}
      {data.drift && <Drift data={data.drift} />}
      {data.nostalgia && <Nostalgia data={data.nostalgia} />}
      {data.momentum && <Momentum data={data.momentum} />}
      {data.hours && <HoursBox data={data.hours} />}
      {data.lorenz && <Lorenz data={data.lorenz} />}
      {data.survival && <Survival data={data.survival} />}
      {data.achievements && data.achievements.length > 0 && (
        <RareAchievements data={data.achievements} />
      )}
      {data.topGames && data.topGames.length > 0 && (
        <TopGames data={data.topGames} />
      )}
    </div>
  );
}
