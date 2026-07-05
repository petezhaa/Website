"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  geoAlbersUsa,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection } from "geojson";
import { US_CAPITALS, WORLD_CAPITALS } from "@/lib/capitals";
import { bumpVibe, foundSecret } from "@/lib/vibeBus";
import { buildShare, dailyNumber, dailySeed, dayNumber, squares } from "@/lib/daily";
import { copyToClipboard } from "@/lib/clipboard";
import { encodeChallenge, type Challenge } from "@/lib/challenge";

type Engine = {
  memory: WebAssembly.Memory;
  mode_count: () => number;
  mode_name: (m: number) => number;
  mode_uses_us_map: (m: number) => number;
  mode_scale_km: (m: number) => number;
  round_count: () => number;
  current_round: () => number;
  total_score: () => number;
  max_score: () => number;
  game_finished: () => number;
  game_start: (m: number, seed: number) => void;
  prompt_name: () => number;
  target_lat: () => number;
  target_lon: () => number;
  submit_guess: (lat: number, lon: number, elapsedMs: number) => number;
  last_distance_km: () => number;
  last_points: () => number;
  last_bonus: () => number;
  streak: () => number;
  best_streak: () => number;
  next_round: () => number;
};

type Phase = "loading" | "menu" | "guess" | "reveal" | "done" | "failed";
type Pt = [number, number];
type View = { k: number; tx: number; ty: number };

const W = 960;
const H = 520;
const ROUND_SECONDS = 20;


function havKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Paper-map palette, grand-strategy style: every region gets its own
// muted tint, borders are drawn in ink, capitals get a marker.
type Palette = {
  water: string;
  space: string; // backdrop behind the globe
  pastels: string[];
  ink: string;
  hoverTint: string;
  graticule: string;
  guess: string;
  target: string;
  line: string;
  capital: string;
  label: string;
  halo: string;
};

const LIGHT: Palette = {
  water: "#4f6d87",
  space: "#efe9db",
  pastels: [
    "#6f8351",
    "#b1a068",
    "#7e8389",
    "#9a5a50",
    "#5f8d85",
    "#68809f",
    "#8a9a62",
    "#a58263",
  ],
  ink: "#2e3237",
  hoverTint: "rgba(255, 255, 255, 0.3)",
  graticule: "rgba(255, 255, 255, 0.1)",
  guess: "#bf5b32",
  target: "#c8891a",
  line: "#bf5b32",
  capital: "#23272e",
  label: "#f4f2ea",
  halo: "rgba(30, 35, 42, 0.85)",
};

const DARK: Palette = {
  water: "#26374a",
  space: "#0c0e0a",
  pastels: [
    "#4c5c37",
    "#7d7148",
    "#585c62",
    "#6e3f38",
    "#42625c",
    "#485a72",
    "#5f6b43",
    "#755c46",
  ],
  ink: "#1b1f24",
  hoverTint: "rgba(255, 255, 255, 0.14)",
  graticule: "rgba(255, 255, 255, 0.07)",
  guess: "#d3805a",
  target: "#c9a545",
  line: "#d3805a",
  capital: "#14171b",
  label: "#e8e4d8",
  halo: "rgba(15, 18, 22, 0.85)",
};

function nameHash(name: string): number {
  let h = 0;
  for (let c = 0; c < name.length; c++) h = (h * 31 + name.charCodeAt(c)) >>> 0;
  return h;
}

// stable tint per region name so colors don't shuffle between renders
function tintIndex(f: Feature, fallback: number, n: number): number {
  const name = (f.properties as { name?: string } | null)?.name;
  return name ? nameHash(name) % n : fallback % n;
}

function rankTitle(pct: number): string {
  if (pct >= 90) return "Excellent. Genuinely.";
  if (pct >= 70) return "Solid.";
  if (pct >= 50) return "Not bad.";
  if (pct >= 30) return "Rough round.";
  return "We can pretend this one didn't happen.";
}

export function MapGame({ challenge }: { challenge?: Challenge } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const worldRef = useRef<FeatureCollection | null>(null);
  const usRef = useRef<FeatureCollection | null>(null);
  const projRef = useRef<GeoProjection | null>(null);
  const shapesRef = useRef<FeatureCollection | null>(null);
  const usMapRef = useRef(false); // which map is loaded (not React state: draw runs in rAF closures)
  const globeRef = useRef(true); // world modes render as a 3D globe by default
  const rotRef = useRef({ l: -35, p: -18 }); // globe rotation (lambda, phi)
  const spinRafRef = useRef(0); // globe momentum spin
  const paletteRef = useRef<Palette>(LIGHT);

  // current view + animation target (smooth, AE-style eased zoom)
  const viewRef = useRef<View>({ k: 1, tx: 0, ty: 0 });
  const viewTargetRef = useRef<View>({ k: 1, tx: 0, ty: 0 });
  const viewRafRef = useRef(0);

  const hoverRef = useRef<Feature | null>(null);
  const guessRef = useRef<Pt | null>(null); // [lon, lat]
  const revealRef = useRef(0);
  const revealRafRef = useRef(0);
  const introRef = useRef(1); // 0..1 map draw-in progress
  const introRafRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const velRef = useRef({ x: 0, y: 0, t: 0 }); // drag velocity for momentum
  const roundStartRef = useRef(0);
  const baselineRef = useRef(0); // expected score of a random clicker so far
  const phaseRef = useRef<Phase>("loading");
  const dailyRef = useRef(false); // is the current game today's daily challenge?
  const dailyDayRef = useRef(0); // the UTC day whose board is being played
  const roundPtsRef = useRef<number[]>([]); // per-round points, for the share block
  const modesRef = useRef<string[]>([]); // mode names, for the chatbot's remote launch
  const seedRef = useRef(0); // the seed of the current game (for challenge links)
  const guessesRef = useRef<Pt[]>([]); // your [lon,lat] guesses this game
  const challengeRef = useRef<Challenge | null>(challenge ?? null); // opponent to race
  const challengeStartedRef = useRef(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [phase, setPhaseState] = useState<Phase>("loading");
  const [modes, setModes] = useState<string[]>([]);
  const [modeIdx, setModeIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [round, setRound] = useState(0);
  const [rounds, setRounds] = useState(6);
  const [score, setScore] = useState(0);
  const [shownPts, setShownPts] = useState(0);
  const [lastBonus, setLastBonus] = useState(0);
  const [lastDist, setLastDist] = useState(0);
  const [streakNow, setStreakNow] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [best, setBest] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<number[]>([]);
  const [globeUi, setGlobeUi] = useState(true);
  // daily challenge: menu button state + the finished share block
  const [dailyInfo, setDailyInfo] = useState<{ num: number; played: boolean; streak: number }>({
    num: 0,
    played: false,
    streak: 0,
  });
  const [dailyResult, setDailyResult] = useState<{ squares: string; streak: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // the daily leaderboard: everyone plays the same board, so they can compare
  const [board, setBoard] = useState<{ name: string; score: number }[] | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [lbState, setLbState] = useState<"idle" | "sending" | "done" | "failed">("idle");

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  // read today's daily status out of localStorage (client only)
  const refreshDaily = useCallback(() => {
    if (typeof window === "undefined") return;
    const d = dayNumber();
    setDailyInfo({
      num: dailyNumber(),
      played: localStorage.getItem(`mapgame-daily-${d}`) !== null,
      streak: Number(localStorage.getItem("mapgame-daily-streak")) || 0,
    });
  }, []);

  const copyText = useCallback(async (text: string) => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  const readString = useCallback((ptr: number): string => {
    const engine = engineRef.current;
    if (!engine) return "";
    const bytes = new Uint8Array(engine.memory.buffer);
    let end = ptr;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(ptr, end));
  }, []);

  // ---------- drawing ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const engine = engineRef.current;
    const shapes = shapesRef.current;
    const projection = projRef.current;
    if (!canvas || !ctx || !engine || !shapes || !projection) return;

    const P = paletteRef.current;
    const { k, tx, ty } = viewRef.current;
    const usMap = usMapRef.current;
    const globe = !usMap && globeRef.current;

    ctx.clearRect(0, 0, W, H);
    // behind a globe the backdrop reads as "space"; flat maps are all water
    ctx.fillStyle = globe ? P.space : P.water;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);
    const path = geoPath(projection, ctx);

    // only the front hemisphere of a globe gets point markers
    const rot = globe ? projection.rotate() : null;
    const isVisible = (ll: Pt) =>
      !rot ||
      geoDistance(ll, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.01;

    if (!usMap) {
      if (globe) {
        ctx.beginPath();
        path({ type: "Sphere" } as GeoPermissibleObjects);
        ctx.fillStyle = P.water;
        ctx.fill();
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.4 / k;
        ctx.stroke();
      }
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = P.graticule;
      ctx.lineWidth = 1 / k;
      ctx.stroke();
    }

    // during the intro, regions appear one by one, outlines first
    const intro = introRef.current;
    const feats = shapes.features;
    const shown = intro >= 1 ? feats.length : Math.ceil(feats.length * intro);
    for (let i = 0; i < shown; i++) {
      const f = feats[i];
      ctx.beginPath();
      path(f as GeoPermissibleObjects);
      ctx.globalAlpha = intro >= 1 ? 1 : Math.min(1, intro * 1.5);
      ctx.fillStyle = P.pastels[tintIndex(f as Feature, i, P.pastels.length)];
      ctx.fill();
      if (f === hoverRef.current) {
        ctx.fillStyle = P.hoverTint;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = (usMap ? 0.9 : 0.55) / k;
      ctx.stroke();
    }

    // one icon per meaning: capitals are circled stars (grand-strategy
    // style), your guess is a map pin, the answer is a gold flag
    const starPath = (
      x: number,
      y: number,
      r: number,
      points = 5,
      rotate = 0
    ) => {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = (Math.PI / points) * i - Math.PI / 2 + rotate;
        const px = x + rr * Math.cos(a);
        const py = y + rr * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    // every capital gets a unique badge: shape x emblem x ring color are
    // assigned by index so no two capitals on a map share a design
    const badgeBase = (x: number, y: number, r: number, shape: number) => {
      ctx.beginPath();
      if (shape === 0) {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      } else if (shape === 1) {
        // shield
        ctx.moveTo(x - r, y - r * 0.8);
        ctx.lineTo(x + r, y - r * 0.8);
        ctx.lineTo(x + r, y + r * 0.1);
        ctx.quadraticCurveTo(x + r * 0.9, y + r * 0.75, x, y + r * 1.05);
        ctx.quadraticCurveTo(x - r * 0.9, y + r * 0.75, x - r, y + r * 0.1);
        ctx.closePath();
      } else if (shape === 2) {
        // diamond
        ctx.moveTo(x, y - r * 1.1);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r * 1.1);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      } else if (shape === 3) {
        // hexagon
        for (let j = 0; j < 6; j++) {
          const a = (Math.PI / 3) * j - Math.PI / 6;
          const px = x + r * Math.cos(a);
          const py = y + r * Math.sin(a);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        // square, slightly tilted
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.16);
        ctx.rect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76);
        ctx.restore();
      }
    };

    const drawBadge = (
      i: number,
      name: string,
      x: number,
      y: number,
      r: number
    ) => {
      const shape = i % 5;
      const emblem = Math.floor(i / 5) % 6;
      const ring = P.pastels[Math.floor(i / 30) % P.pastels.length];
      const h = nameHash(name);

      badgeBase(x, y, r, shape);
      ctx.fillStyle = P.label;
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = r * 0.3;
      ctx.stroke();
      badgeBase(x, y, r, shape);
      ctx.strokeStyle = P.capital;
      ctx.lineWidth = r * 0.11;
      ctx.stroke();

      ctx.fillStyle = P.capital;
      const gr = r * 0.52;
      if (emblem === 0) {
        starPath(x, y, gr * 1.2, 4 + (h % 4), ((h >> 3) % 10) * 0.1);
        ctx.fill();
      } else if (emblem === 1) {
        // crescent
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + gr * 0.55, y - gr * 0.25, gr * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = P.label;
        ctx.fill();
      } else if (emblem === 2) {
        // cross
        ctx.fillRect(x - gr * 0.28, y - gr, gr * 0.56, gr * 2);
        ctx.fillRect(x - gr, y - gr * 0.28, gr * 2, gr * 0.56);
      } else if (emblem === 3) {
        // ring
        ctx.beginPath();
        ctx.arc(x, y, gr * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = P.capital;
        ctx.lineWidth = gr * 0.5;
        ctx.stroke();
      } else if (emblem === 4) {
        // chevron
        ctx.strokeStyle = P.capital;
        ctx.lineWidth = gr * 0.42;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - gr, y + gr * 0.55);
        ctx.lineTo(x, y - gr * 0.65);
        ctx.lineTo(x + gr, y + gr * 0.55);
        ctx.stroke();
      } else {
        // triad of dots
        for (const [dx, dy] of [
          [0, -0.65],
          [-0.6, 0.45],
          [0.6, 0.45],
        ]) {
          ctx.beginPath();
          ctx.arc(x + dx * gr, y + dy * gr, gr * 0.34, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const capitals = usMap ? US_CAPITALS : WORLD_CAPITALS;
    ctx.globalAlpha = Math.max(0, intro * 1.2 - 0.2);
    for (let ci = 0; ci < capitals.length; ci++) {
      const c = capitals[ci];
      if (!isVisible([c.lon, c.lat])) continue;
      const pt = projection([c.lon, c.lat]);
      if (!pt) continue;
      const [x, y] = pt;
      const u = 1 / k; // one screen pixel in map units

      const badgeR = Math.min(7.5, 2.4 + 1.1 * k) * u;
      drawBadge(ci, c.name, x, y, badgeR);

      if (k >= 1.8) {
        // label size scales with zoom, capped so it never gets comical
        const labelPx = Math.min(26, 9 + 4 * k);
        ctx.font = `italic ${labelPx * u}px Newsreader, Georgia, serif`;
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.miterLimit = 2;
        ctx.strokeStyle = P.halo;
        ctx.lineWidth = labelPx * 0.22 * u;
        ctx.strokeText(c.name, x + badgeR + 3 * u, y);
        ctx.fillStyle = P.label;
        ctx.fillText(c.name, x + badgeR + 3 * u, y);
      }
    }
    ctx.globalAlpha = 1;

    // your guess: a map pin whose tip is the exact click point.
    // ghost=true draws a translucent opponent pin in a challenge race.
    const drawPin = (ll: Pt, ghost = false) => {
      if (!isVisible(ll)) return;
      const pt = projection(ll);
      if (!pt) return;
      const [x, y] = pt;
      const u = Math.min(1.7, 0.85 + 0.15 * k) / k;
      if (ghost) ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y - 6 * u, 4.5 * u, Math.PI * 0.82, Math.PI * 0.18, false);
      ctx.closePath();
      ctx.fillStyle = ghost ? P.ink : P.guess;
      ctx.fill();
      ctx.strokeStyle = P.label;
      ctx.lineWidth = 1.4 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 6 * u, 1.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = P.label;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    // the answer: a flag planted at the true location
    const drawFlag = (ll: Pt, scale: number) => {
      if (!isVisible(ll)) return;
      const pt = projection(ll);
      if (!pt) return;
      const [x, y] = pt;
      const u = (scale * Math.min(1.7, 0.85 + 0.15 * k)) / k;
      ctx.strokeStyle = P.capital;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 12 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 12 * u);
      ctx.lineTo(x + 9 * u, y - 9.5 * u);
      ctx.lineTo(x, y - 7 * u);
      ctx.closePath();
      ctx.fillStyle = P.target;
      ctx.fill();
      ctx.strokeStyle = P.capital;
      ctx.lineWidth = 0.9 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = P.capital;
      ctx.fill();
    };

    const g = guessRef.current;
    const p = revealRef.current;

    if (g && phaseRef.current === "reveal") {
      const target: Pt = [engine.target_lon(), engine.target_lat()];
      if (globe && p > 0.15) {
        // on the globe the line is a real great-circle arc
        ctx.save();
        ctx.setLineDash([8 / k, 6 / k]);
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 2.5 / k;
        ctx.beginPath();
        path({
          type: "LineString",
          coordinates: [g, target],
        } as GeoPermissibleObjects);
        ctx.stroke();
        ctx.restore();
      }
      const a = projection(g);
      const b = projection(target);
      if (!globe && a && b && p > 0) {
        const lx = a[0] + (b[0] - a[0]) * Math.min(1, p * 1.25);
        const ly = a[1] + (b[1] - a[1]) * Math.min(1, p * 1.25);
        ctx.save();
        ctx.setLineDash([8 / k, 6 / k]);
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 2.5 / k;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.restore();
      }
      if (p > 0.75) {
        const t = Math.min(1, (p - 0.75) / 0.25);
        const pop = 1 + 0.5 * Math.sin(t * Math.PI);
        drawFlag(target, t * pop);
      }
      // challenge race: show the opponent's guess for this round as a ghost pin
      const chal = challengeRef.current;
      if (chal) {
        const gg = chal.guesses[engine.current_round()];
        if (gg) drawPin(gg as Pt, true);
      }
      drawPin(g);
    } else if (g) {
      drawPin(g);
    }

    ctx.restore();
  }, []);

  // ---------- theme awareness: redraw the canvas when dark mode toggles ----------
  useEffect(() => {
    const apply = () => {
      paletteRef.current = document.documentElement.classList.contains("dark")
        ? DARK
        : LIGHT;
      draw();
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [draw]);

  // ---------- map draw-in intro ----------
  const playIntro = useCallback(() => {
    cancelAnimationFrame(introRafRef.current);
    const t0 = performance.now();
    const DURATION = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      introRef.current = 1 - Math.pow(1 - p, 2);
      draw();
      if (p < 1) introRafRef.current = requestAnimationFrame(tick);
    };
    introRef.current = 0;
    introRafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  // ---------- smooth view animation ----------
  // Exponential ease toward the target view. Higher ease = tighter follow
  // (used while dragging); lower ease = longer glide (momentum, zoom).
  const animateView = useCallback(
    (ease = 0.16) => {
      cancelAnimationFrame(viewRafRef.current);
      const step = () => {
        const v = viewRef.current;
        const t = viewTargetRef.current;
        v.k += (t.k - v.k) * ease;
        v.tx += (t.tx - v.tx) * ease;
        v.ty += (t.ty - v.ty) * ease;
        const done =
          Math.abs(t.k - v.k) < 0.002 &&
          Math.abs(t.tx - v.tx) < 0.3 &&
          Math.abs(t.ty - v.ty) < 0.3;
        if (done) {
          viewRef.current = { ...t };
          draw();
          return;
        }
        draw();
        viewRafRef.current = requestAnimationFrame(step);
      };
      viewRafRef.current = requestAnimationFrame(step);
    },
    [draw]
  );

  // keep the map in reach: full pan range when zoomed, elastic give at k=1
  const clampView = useCallback((v: View) => {
    const slack = 80;
    v.tx = Math.min(slack, Math.max(W - W * v.k - slack, v.tx));
    v.ty = Math.min(slack, Math.max(H - H * v.k - slack, v.ty));
    return v;
  }, []);

  const zoomBy = useCallback(
    (factor: number, mx = W / 2, my = H / 2) => {
      const t = viewTargetRef.current;
      const k = factor === 0 ? 1 : Math.min(10, Math.max(1, t.k * factor));
      if (k === 1) {
        viewTargetRef.current = { k: 1, tx: 0, ty: 0 };
      } else {
        viewTargetRef.current = {
          k,
          tx: mx - ((mx - t.tx) / t.k) * k,
          ty: my - ((my - t.ty) / t.k) * k,
        };
      }
      animateView();
    },
    [animateView]
  );

  // Wheel zoom needs a native non-passive listener so we can preventDefault.
  // The map only captures scrolling during an active round; on the menu,
  // results, and loading screens the page scrolls straight through it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (phaseRef.current !== "guess" && phaseRef.current !== "reveal") return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * W;
      const my = ((e.clientY - rect.top) / rect.height) * H;
      zoomBy(e.deltaY < 0 ? 1.3 : 0.75, mx, my);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const fitProjection = useCallback((usMap: boolean) => {
    const shapes = usMap ? usRef.current : worldRef.current;
    if (!shapes) return;
    shapesRef.current = shapes;
    usMapRef.current = usMap;
    projRef.current = usMap
      ? geoAlbersUsa().fitExtent([[24, 24], [W - 24, H - 24]], shapes)
      : globeRef.current
        ? geoOrthographic()
            .rotate([rotRef.current.l, rotRef.current.p])
            .fitExtent(
              [[14, 14], [W - 14, H - 14]],
              { type: "Sphere" } as GeoPermissibleObjects
            )
        : geoNaturalEarth1().fitExtent(
            [[16, 16], [W - 16, H - 16]],
            { type: "Sphere" } as GeoPermissibleObjects
          );
    viewRef.current = { k: 1, tx: 0, ty: 0 };
    viewTargetRef.current = { k: 1, tx: 0, ty: 0 };
  }, []);

  // ---------- load wasm + geometry ----------
  useEffect(() => {
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    // the engine + map data are ~MBs; don't fetch until the section is close
    const load = () => Promise.all([
      // .bin extension + instantiate(arrayBuffer): dodges a wrangler bundler
      // bug with .wasm files in public/ on Windows, and drops the MIME requirement
      fetch("/mapgame.bin")
        .then((r) => r.arrayBuffer())
        .then((buf) => WebAssembly.instantiate(buf)),
      fetch("/maps/countries-110m.json").then((r) => r.json()),
      fetch("/maps/states-10m.json").then((r) => r.json()),
    ])
      .then(([wasm, worldTopo, usTopo]) => {
        if (cancelled) return;
        const engine = wasm.instance.exports as unknown as Engine;
        engineRef.current = engine;

        const wt = worldTopo as Topology;
        const ut = usTopo as Topology;
        worldRef.current = feature(
          wt,
          wt.objects.countries as GeometryCollection
        ) as FeatureCollection;
        usRef.current = feature(
          ut,
          ut.objects.states as GeometryCollection
        ) as FeatureCollection;

        const names: string[] = [];
        for (let m = 0; m < engine.mode_count(); m++) {
          names.push(readString(engine.mode_name(m)));
        }
        modesRef.current = names;
        setModes(names);
        setRounds(engine.round_count());
        fitProjection(false);
        refreshDaily();
        setPhase("menu");
        playIntro();
      })
      .catch(() => !cancelled && setPhase("failed"));

    const canvas = canvasRef.current;
    if (canvas && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            io?.disconnect();
            io = null;
            load();
          }
        },
        { rootMargin: "600px" }
      );
      io.observe(canvas);
    } else {
      load();
    }
    return () => {
      cancelled = true;
      io?.disconnect();
      cancelAnimationFrame(revealRafRef.current);
      cancelAnimationFrame(viewRafRef.current);
      cancelAnimationFrame(introRafRef.current);
      cancelAnimationFrame(spinRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- keyboard: Enter/Space advances after a guess ----------
  const advanceRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== "reveal") return;
      if (e.key !== "Enter" && e.key !== " ") return;
      // never steal keystrokes from inputs (e.g. the chat)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      advanceRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- the chatbot can launch a mode ({{act:play|...}}) ----------
  useEffect(() => {
    const onLaunch = (e: Event) => {
      const query = (((e as CustomEvent).detail as string) || "").trim().toLowerCase();
      // scrolling here also trips the IntersectionObserver that loads the wasm
      document.getElementById("play")?.scrollIntoView({ behavior: "smooth" });
      let tries = 0;
      const attempt = () => {
        const engine = engineRef.current;
        if (!engine || phaseRef.current === "loading") {
          if (tries++ < 24) setTimeout(attempt, 250); // wait out the wasm load
          return;
        }
        const names = modesRef.current;
        let idx = 0;
        if (query) {
          let found = names.findIndex((n) => n.toLowerCase().includes(query));
          if (found < 0) {
            const toks = query.split(/\s+/).filter((t) => t.length > 2);
            found = names.findIndex((n) =>
              toks.some((t) => n.toLowerCase().includes(t))
            );
          }
          if (found >= 0) idx = found;
        }
        startGame(idx);
      };
      attempt();
    };
    window.addEventListener("mapgame:launch", onLaunch);
    return () => window.removeEventListener("mapgame:launch", onLaunch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- challenge mode: skip the menu, replay the opponent's rounds ----------
  useEffect(() => {
    if (!challenge || challengeStartedRef.current || phase !== "menu") return;
    const engine = engineRef.current;
    if (!engine) return;
    challengeStartedRef.current = true;
    // the engine clamps out-of-range modes internally; the UI must apply the
    // same clamp or the map/scale/best-key disagree with what's being played
    const mode = Math.min(Math.max(challenge.mode, 0), engine.mode_count() - 1);
    challengeRef.current = { ...challenge, mode };
    startGame(mode, { seed: challenge.seed, keepChallenge: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, challenge]);

  // ---------- idle globe spin on the menu screen ----------
  const onScreenRef = useRef(true);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const io = new IntersectionObserver(([entry]) => {
      onScreenRef.current = entry.isIntersecting;
    });
    io.observe(canvas);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "menu") return;
    let raf = 0;
    const spin = () => {
      if (onScreenRef.current && !usMapRef.current && globeRef.current && !dragRef.current) {
        rotRef.current.l += 0.09;
        projRef.current?.rotate([rotRef.current.l, rotRef.current.p]);
        draw();
      }
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [phase, draw]);

  // ---------- round timer ----------
  useEffect(() => {
    if (phase !== "guess") return;
    setTimeLeft(ROUND_SECONDS);
    const id = setInterval(() => {
      const elapsed = (performance.now() - roundStartRef.current) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(ROUND_SECONDS - elapsed)));
    }, 250);
    return () => clearInterval(id);
  }, [phase, round]);

  // ---------- interaction ----------
  const toMap = (e: { clientX: number; clientY: number }): Pt | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { k, tx, ty } = viewRef.current;
    const x = (((e.clientX - rect.left) / rect.width) * W - tx) / k;
    const y = (((e.clientY - rect.top) / rect.height) * H - ty) / k;
    return [x, y];
  };

  // two active pointers = pinch zoom (phones have no scroll wheel)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistRef = useRef<number | null>(null);
  const pinchingRef = useRef(false); // stays true until every finger lifts
  const pinchDist = () => {
    const pts = [...pointersRef.current.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 2) {
      // a second finger turns the gesture into a pinch, not a drag
      dragRef.current = null;
      pinchingRef.current = true;
      pinchDistRef.current = pinchDist();
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    velRef.current = { x: 0, y: 0, t: performance.now() };
    cancelAnimationFrame(spinRafRef.current); // grab a spinning globe to stop it
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size >= 2) {
      if (phaseRef.current !== "guess" && phaseRef.current !== "reveal") return;
      const d = pinchDist();
      const prev = pinchDistRef.current;
      pinchDistRef.current = d;
      const canvas = canvasRef.current;
      if (prev && d > 0 && canvas) {
        const rect = canvas.getBoundingClientRect();
        const pts = [...pointersRef.current.values()];
        const mx = (((pts[0].x + pts[1].x) / 2 - rect.left) / rect.width) * W;
        const my = (((pts[0].y + pts[1].y) / 2 - rect.top) / rect.height) * H;
        zoomBy(d / prev, mx, my);
      }
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (dx / rect.width) * W;
        const cy = (dy / rect.height) * H;
        const now = performance.now();
        const dt = Math.max(1, now - (velRef.current.t || now));

        if (!usMapRef.current && globeRef.current) {
          // dragging spins the globe
          const rot = rotRef.current;
          const sens = 0.28 / viewRef.current.k;
          const dl = cx * sens;
          const dp = cy * sens;
          rot.l += dl;
          rot.p = Math.max(-85, Math.min(85, rot.p - dp));
          projRef.current?.rotate([rot.l, rot.p]);
          velRef.current = {
            x: velRef.current.x * 0.75 + (dl / dt) * 0.25,
            y: velRef.current.y * 0.75 + (dp / dt) * 0.25,
            t: now,
          };
          drag.x = e.clientX;
          drag.y = e.clientY;
          draw();
          return;
        }

        // flat maps pan: move the TARGET and let the eased follower chase it
        const t = viewTargetRef.current;
        t.tx += cx;
        t.ty += cy;
        clampView(t);
        velRef.current = {
          x: velRef.current.x * 0.75 + (cx / dt) * 0.25,
          y: velRef.current.y * 0.75 + (cy / dt) * 0.25,
          t: now,
        };
        drag.x = e.clientX;
        drag.y = e.clientY;
        animateView(0.4); // tight but cushioned follow
        return;
      }
    }

    if (phaseRef.current !== "guess") return;
    const projection = projRef.current;
    const shapes = shapesRef.current;
    if (!projection?.invert || !shapes) return;
    const xy = toMap(e);
    if (!xy) return;
    const ll = projection.invert(xy);
    if (ll && (isNaN(ll[0]) || isNaN(ll[1]))) return; // off the globe's edge
    let found: Feature | null = null;
    if (ll) {
      for (const f of shapes.features) {
        if (geoContains(f as GeoPermissibleObjects, ll)) {
          found = f as Feature;
          break;
        }
      }
    }
    if (found !== hoverRef.current) {
      hoverRef.current = found;
      draw();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchingRef.current) {
      // fingers lifting off a pinch are not taps; never submit a guess here,
      // not even for the last finger to leave
      if (pointersRef.current.size < 2) pinchDistRef.current = null;
      if (pointersRef.current.size === 0) pinchingRef.current = false;
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      if (!usMapRef.current && globeRef.current) {
        // throw the globe: it keeps spinning and coasts to a stop
        cancelAnimationFrame(spinRafRef.current);
        let vl = velRef.current.x * 16;
        let vp = velRef.current.y * 16;
        const spin = () => {
          if (Math.abs(vl) < 0.005 && Math.abs(vp) < 0.005) return;
          const rot = rotRef.current;
          rot.l += vl;
          rot.p = Math.max(-85, Math.min(85, rot.p - vp));
          vl *= 0.95;
          vp *= 0.95;
          projRef.current?.rotate([rot.l, rot.p]);
          draw();
          spinRafRef.current = requestAnimationFrame(spin);
        };
        spinRafRef.current = requestAnimationFrame(spin);
      } else if (viewRef.current.k <= 1.01) {
        // rubber-band home at default zoom
        viewTargetRef.current = { k: 1, tx: 0, ty: 0 };
        animateView(0.14);
      } else {
        // momentum: glide in the direction of the throw, then settle
        const vel = velRef.current;
        const t = viewTargetRef.current;
        t.tx += vel.x * 160;
        t.ty += vel.y * 160;
        clampView(t);
        animateView(0.09);
      }
      velRef.current = { x: 0, y: 0, t: 0 };
      return;
    }
    if (phaseRef.current !== "guess") return;

    const engine = engineRef.current;
    const projection = projRef.current;
    if (!engine || !projection?.invert) return;
    const xy = toMap(e);
    if (!xy) return;
    const ll = projection.invert(xy);
    if (!ll || isNaN(ll[0]) || isNaN(ll[1])) return; // clicked past the globe

    const elapsed = performance.now() - roundStartRef.current;
    const [lon, lat] = ll;
    engine.submit_guess(lat, lon, elapsed);
    bumpVibe("gamer", 8);

    // what would a uniformly random clicker have scored on this round?
    {
      const tLat = engine.target_lat();
      const tLon = engine.target_lon();
      const scale = engine.mode_scale_km(modeIdx); // straight from the engine
      let sum = 0;
      let count = 0;
      for (let tries = 0; tries < 900 && count < 300; tries++) {
        const rx = 16 + Math.random() * (W - 32);
        const ry = 16 + Math.random() * (H - 32);
        const rll = projection.invert([rx, ry]);
        if (!rll || isNaN(rll[0]) || isNaN(rll[1])) continue;
        const d = havKm(rll[1], rll[0], tLat, tLon);
        sum += d < 25 ? 1000 : (1000 * scale * scale) / (scale * scale + d * d);
        count++;
      }
      if (count > 0) baselineRef.current += sum / count;
    }

    guessRef.current = [lon, lat];
    guessesRef.current.push([lon, lat]); // for challenge links
    hoverRef.current = null;
    setLastBonus(engine.last_bonus());
    setLastDist(engine.last_distance_km());
    setScore(engine.total_score());
    setStreakNow(engine.streak());
    setPhase("reveal");

    const pts = engine.last_points();
    roundPtsRef.current.push(pts); // for the daily share block
    if (engine.last_distance_km() < 25) {
      // bullseye — small celebration (and it counts as a find)
      foundSecret("bullseye");
      setConfetti(Array.from({ length: 18 }, (_, i) => i));
      setTimeout(() => setConfetti([]), 1500);
    }
    revealRef.current = 0;
    setShownPts(0);
    const t0 = performance.now();
    const DURATION = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      revealRef.current = p;
      setShownPts(Math.round(pts * (1 - Math.pow(1 - p, 3))));
      draw();
      if (p < 1) revealRafRef.current = requestAnimationFrame(tick);
    };
    revealRafRef.current = requestAnimationFrame(tick);
  };

  // ---------- flow ----------
  const startGame = (
    m: number,
    opts?: { seed?: number; daily?: boolean; keepChallenge?: boolean }
  ) => {
    const engine = engineRef.current;
    if (!engine) return;
    bumpVibe("gamer", 20);
    const seed = opts?.seed ?? ((Date.now() & 0xffffffff) >>> 0);
    seedRef.current = seed;
    dailyRef.current = !!opts?.daily;
    roundPtsRef.current = [];
    guessesRef.current = [];
    if (!opts?.keepChallenge) challengeRef.current = null;
    setDailyResult(null);
    setCopiedLink(false);
    engine.game_start(m, seed);
    baselineRef.current = 0;
    setModeIdx(m);
    setScore(0);
    setRound(0);
    setStreakNow(0);
    guessRef.current = null;
    hoverRef.current = null;
    fitProjection(engine.mode_uses_us_map(m) === 1);
    setPrompt(readString(engine.prompt_name()));
    setBest(
      typeof window === "undefined"
        ? null
        : Number(localStorage.getItem(`mapgame-best-${m}`)) || null
    );
    roundStartRef.current = performance.now();
    setPhase("guess");
    playIntro();
  };

  // record the daily result once — under the day whose BOARD was played, so a
  // game finishing just past UTC midnight files under the day it started
  const persistDaily = (total: number, pts: number[]): number => {
    if (typeof window === "undefined") return 0;
    const d = dailyDayRef.current || dayNumber();
    if (localStorage.getItem(`mapgame-daily-${d}`) !== null) {
      return Number(localStorage.getItem("mapgame-daily-streak")) || 0;
    }
    localStorage.setItem(`mapgame-daily-${d}`, String(total));
    localStorage.setItem(`mapgame-daily-pts-${d}`, JSON.stringify(pts));
    const last = Number(localStorage.getItem("mapgame-daily-last"));
    const prev = Number(localStorage.getItem("mapgame-daily-streak")) || 0;
    const streak = last === d - 1 ? prev + 1 : 1;
    localStorage.setItem("mapgame-daily-streak", String(streak));
    localStorage.setItem("mapgame-daily-last", String(d));
    return streak;
  };

  const startDaily = () => {
    const engine = engineRef.current;
    if (!engine || !modes.length) return;
    dailyDayRef.current = dayNumber(); // pin the board's day at start
    const num = dailyNumber();
    // rotate through the modes, skipping the autobiographical one (strangers
    // can't guess it). Same deploy + same UTC day → same mode for everyone.
    const pool = modes.map((_, i) => i).filter((i) => modes[i] !== "Where's Peter?");
    const m = pool.length ? pool[(((num - 1) % pool.length) + pool.length) % pool.length] : 0;
    startGame(m, { seed: dailySeed(), daily: true });
  };

  // re-copy an already-finished daily from storage (menu "done" button)
  const copyDailyShare = () => {
    if (typeof window === "undefined") return;
    const d = dayNumber();
    const total = Number(localStorage.getItem(`mapgame-daily-${d}`)) || 0;
    let pts: number[] = [];
    try {
      pts = JSON.parse(localStorage.getItem(`mapgame-daily-pts-${d}`) || "[]");
    } catch {}
    copyText(buildShare(pts, total, engineRef.current?.max_score() ?? 6000, dailyNumber()));
  };

  // mint a /c/<code> link encoding this game's mode, seed, and your guesses
  const copyChallenge = () => {
    const engine = engineRef.current;
    if (typeof window === "undefined" || !engine) return;
    const beat = baselineRef.current > 0 ? score / Math.max(baselineRef.current, 1) : 0;
    const code = encodeChallenge({
      mode: modeIdx,
      seed: seedRef.current,
      guesses: guessesRef.current,
      score,
      streak: engine.best_streak(),
      beat,
    });
    const url = `${window.location.origin}/c/${code}`;
    void copyToClipboard(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    });
  };

  // post today's score under a chosen name; the board answers with your rank
  const submitScore = async () => {
    if (lbState === "sending" || lbState === "done") return;
    setLbState("sending");
    try {
      localStorage.setItem("daily-name", playerName);
      const res = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: dailyDayRef.current, name: playerName, score }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setRank(d.rank ?? null);
      setBoard(d.entries ?? []);
      setLbState("done");
      bumpVibe("gamer", 12);
    } catch {
      setLbState("failed");
    }
  };

  const advance = () => {
    const engine = engineRef.current;
    if (!engine) return;
    cancelAnimationFrame(revealRafRef.current);
    setConfetti([]);
    if (engine.game_finished()) {
      const total = engine.total_score();
      const prev = Number(localStorage.getItem(`mapgame-best-${modeIdx}`)) || 0;
      if (total > prev) {
        localStorage.setItem(`mapgame-best-${modeIdx}`, String(total));
        setBest(total);
      }
      if (dailyRef.current) {
        const streak = persistDaily(total, roundPtsRef.current);
        setDailyResult({ squares: squares(roundPtsRef.current), streak });
        refreshDaily();
        // pull today's board while the confetti settles
        setBoard(null);
        setRank(null);
        setLbState("idle");
        setPlayerName(localStorage.getItem("daily-name") ?? "");
        fetch(`/api/daily?day=${dailyDayRef.current}`)
          .then((r) => r.json())
          .then((d) => setBoard(d.entries?.slice(0, 10) ?? []))
          .catch(() => setBoard([]));
      }
      setPhase("done");
      return;
    }
    engine.next_round();
    setRound(engine.current_round());
    guessRef.current = null;
    revealRef.current = 0;
    viewTargetRef.current = { k: 1, tx: 0, ty: 0 };
    animateView();
    setPrompt(readString(engine.prompt_name()));
    roundStartRef.current = performance.now();
    setPhase("guess");
  };
  advanceRef.current = advance;

  const isUsMode = engineRef.current?.mode_uses_us_map(modeIdx) === 1;

  const quitToMenu = () => {
    cancelAnimationFrame(revealRafRef.current);
    cancelAnimationFrame(spinRafRef.current);
    guessRef.current = null;
    revealRef.current = 0;
    dailyRef.current = false;
    // the menu is always a spinning globe, whatever mode you came from
    globeRef.current = true;
    setGlobeUi(true);
    fitProjection(false);
    refreshDaily();
    setPhase("menu");
    requestAnimationFrame(() => draw());
  };

  const toggleGlobe = () => {
    globeRef.current = !globeRef.current;
    setGlobeUi(globeRef.current);
    cancelAnimationFrame(spinRafRef.current);
    fitProjection(false);
    draw();
  };

  if (phase === "failed") {
    return (
      <p className="font-mono text-sm text-muted">
        The game didn&apos;t load. Try refreshing, or your browser may be
        blocking WebAssembly.
      </p>
    );
  }

  const maxScore = engineRef.current?.max_score() ?? 6000;
  const pct = Math.round((score / maxScore) * 100);
  // engine floors exact elapsed and only pays when close; stay under, never over-promise
  const bonusForSpeed = Math.max(0, Math.floor(((timeLeft - 1) / ROUND_SECONDS) * 100));

  return (
    <div className="flex flex-col gap-3">
      {/* status bar */}
      {(phase === "guess" || phase === "reveal") && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-line bg-surface px-4 py-2 text-sm">
              {phase === "guess" ? "Find: " : ""}
              <span className="font-medium text-accent">{prompt}</span>
            </span>
            {streakNow >= 2 && (
              <span className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-xs font-bold text-gold">
                {streakNow}× streak
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono text-xs text-muted">
            {phase === "guess" && (
              <span
                className={timeLeft <= 5 ? "font-bold text-accent" : ""}
                title="fast AND close earns the bonus"
              >
                {timeLeft}s · +{bonusForSpeed} if close
              </span>
            )}
            <span>
              round {round + 1}/{rounds}
            </span>
            <span className="font-bold text-fg">{score} pts</span>
          </div>
        </div>
      )}

      {/* the map */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            pointersRef.current.delete(e.pointerId);
            pinchDistRef.current = null;
            dragRef.current = null;
            if (pointersRef.current.size === 0) pinchingRef.current = false;
          }}
          className={`block h-auto w-full select-none ${
            phase === "guess" || phase === "reveal"
              ? "touch-none"
              : "touch-pan-y"
          } ${phase === "guess" ? "cursor-crosshair" : "cursor-grab"}`}
        />

        {(phase === "guess" || phase === "reveal") && (
          <>
            <p className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] uppercase tracking-widest text-muted/70">
              {isUsMode || !globeUi
                ? "scroll or pinch to zoom · drag to pan"
                : "drag to spin · scroll or pinch to zoom"}
            </p>
            <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
              {[
                { label: "+", f: () => zoomBy(1.5) },
                { label: "−", f: () => zoomBy(1 / 1.5) },
                { label: "⤢", f: () => zoomBy(0) },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={b.f}
                  aria-label={`zoom ${b.label}`}
                  className="h-8 w-8 rounded-lg border border-line bg-surface/90 font-mono text-sm text-muted backdrop-blur transition hover:border-accent hover:text-accent"
                >
                  {b.label}
                </button>
              ))}
              {!isUsMode && (
                <button
                  onClick={toggleGlobe}
                  aria-label="toggle globe view"
                  title={globeUi ? "switch to flat map" : "switch to globe"}
                  className="h-8 w-8 rounded-lg border border-line bg-surface/90 font-mono text-xs text-muted backdrop-blur transition hover:border-accent hover:text-accent"
                >
                  {globeUi ? "2D" : "3D"}
                </button>
              )}
              <button
                onClick={quitToMenu}
                aria-label="quit to menu"
                title="back to the map menu"
                className="h-8 w-8 rounded-lg border border-line bg-surface/90 font-mono text-xs text-muted backdrop-blur transition hover:border-accent hover:text-accent"
              >
                ✕
              </button>
            </div>
          </>
        )}

        {phase === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-surface/90">
            <p className="animate-pulse font-mono text-sm text-muted">
              loading the map…
            </p>
          </div>
        )}

        {phase === "menu" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0 flex overflow-y-auto bg-bg/85 p-3 backdrop-blur-sm sm:p-6"
          >
            {/* m-auto centers when it fits and scrolls from the top when it doesn't
                (justify-center would clip the overflow on short phone screens) */}
            <div className="m-auto flex flex-col items-center gap-3 sm:gap-6">
              {/* daily challenge: same six rounds for everyone, once a day */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={dailyInfo.played ? copyDailyShare : startDaily}
                  className={`rounded-xl border-2 px-5 py-2.5 text-sm font-medium transition sm:text-base ${
                    dailyInfo.played
                      ? "border-line text-muted hover:border-accent hover:text-accent"
                      : "border-accent bg-accent-soft text-accent hover:-translate-y-0.5"
                  }`}
                >
                  {dailyInfo.played
                    ? `Daily #${dailyInfo.num} done ✓${dailyInfo.streak > 1 ? ` · 🔥 ${dailyInfo.streak}` : ""}`
                    : `🗓 Today's 6 — Daily #${dailyInfo.num}`}
                </button>
                <p className="font-mono text-[10px] text-muted">
                  {dailyInfo.played
                    ? copied
                      ? "copied to clipboard"
                      : "tap to copy your result · new one tomorrow"
                    : "same six rounds for everyone, worldwide, today"}
                </p>
              </div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
                or pick a map
              </p>
              <div className="flex max-w-xl flex-wrap justify-center gap-2 sm:gap-3">
                {modes.map((name, m) => (
                  <button
                    key={name}
                    onClick={() => startGame(m)}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-xs transition hover:-translate-y-0.5 hover:border-accent hover:text-accent sm:rounded-xl sm:px-5 sm:py-3 sm:text-sm"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="text-center font-mono text-[10px] text-muted sm:text-[11px]">
                {rounds} rounds · click the map · answering fast earns a bonus
              </p>
            </div>
          </motion.div>
        )}

        {/* bullseye confetti */}
        {confetti.map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
            style={{
              background: [
                "var(--accent)",
                "var(--gold)",
                "#22c55e",
                "#ec4899",
              ][i % 4],
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos((i / 18) * Math.PI * 2) * (90 + (i % 5) * 36),
              y:
                Math.sin((i / 18) * Math.PI * 2) * (60 + (i % 4) * 30) +
                120,
              opacity: 0,
              rotate: 200 + i * 40,
            }}
            transition={{ duration: 1.3, ease: [0.15, 0.6, 0.4, 1] }}
          />
        ))}

        {phase === "reveal" && (
          <div className="absolute bottom-4 left-1/2 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur sm:gap-4 sm:px-5 sm:py-3">
            <span className="min-w-20 font-mono text-2xl font-bold text-accent">
              +{shownPts}
            </span>
            <span className="font-mono text-xs text-muted">
              {Math.round(lastDist).toLocaleString()} km off
              {lastBonus > 0 && (
                <span className="text-gold"> · +{lastBonus} speed</span>
              )}
              {lastDist < 25 && <span className="text-gold"> · bullseye</span>}
            </span>
            <button
              onClick={advance}
              title="or press Enter"
              className="rounded-lg bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90"
            >
              {engineRef.current?.game_finished() ? "results" : "next ⏎"}
            </button>
          </div>
        )}

        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute inset-0 flex overflow-y-auto bg-bg/90 p-3 text-center backdrop-blur-sm sm:p-6"
          >
            <div className="m-auto flex flex-col items-center gap-2.5 sm:gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">
              final score
            </p>
            <p className="font-mono text-4xl font-bold sm:text-5xl">
              {score}
              <span className="text-xl text-muted"> / {maxScore}</span>
            </p>
            <p className="rounded-full border border-accent/40 bg-accent-soft px-5 py-2 text-sm text-accent">
              {rankTitle(pct)}
            </p>
            <div className="flex gap-6 font-mono text-xs text-muted">
              <span>best streak: {engineRef.current?.best_streak() ?? 0}</span>
              {best !== null && <span>personal best: {best}</span>}
            </div>
            {challengeRef.current && (
              <div className="w-full max-w-60 rounded-xl border border-line bg-surface p-3 font-mono text-[11px]">
                <p className="uppercase tracking-widest text-accent">head to head</p>
                <div className="mt-1.5 flex justify-between">
                  <span className="text-muted">you</span>
                  <span className="font-bold text-fg">{score}</span>
                </div>
                <div className="mt-0.5 flex justify-between text-muted">
                  <span>them</span>
                  <span>{challengeRef.current.score}</span>
                </div>
                <p className="mt-1.5 text-center text-fg">
                  {score > challengeRef.current.score
                    ? "you win. rub it in."
                    : score < challengeRef.current.score
                    ? "they win this one."
                    : "a perfect tie. spooky."}
                </p>
              </div>
            )}
            {baselineRef.current > 0 && (
              <div className="w-full max-w-60">
                {[
                  { label: "you", value: score, cls: "bg-accent" },
                  {
                    label: "random clicker",
                    value: Math.round(baselineRef.current),
                    cls: "bg-line",
                  },
                ].map((row) => (
                  <div key={row.label} className="mb-1.5 flex items-center gap-2">
                    <span className="w-24 text-left font-mono text-[10px] text-muted">
                      {row.label}
                    </span>
                    <div
                      className={`h-3 rounded-full ${row.cls}`}
                      style={{
                        width: `${Math.max(
                          (row.value / Math.max(score, baselineRef.current, 1)) * 100,
                          2
                        )}%`,
                      }}
                    />
                    <span className="font-mono text-[10px] text-muted tabular-nums">
                      {row.value.toLocaleString()}
                    </span>
                  </div>
                ))}
                <p className="mt-1 text-center font-mono text-[10px] text-muted">
                  {score > baselineRef.current
                    ? `you beat random chance by ${(score / Math.max(baselineRef.current, 1)).toFixed(1)}×`
                    : "a random clicker beat you. sit with that."}
                </p>
              </div>
            )}
            {dailyResult && (
              <div className="w-full max-w-xs rounded-xl border border-accent/40 bg-accent-soft/40 p-3">
                <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
                  Daily #{dailyInfo.num}
                  {dailyResult.streak > 1 ? ` · 🔥 ${dailyResult.streak} day streak` : ""}
                </p>
                <p className="mt-1 text-2xl tracking-[0.2em]">{dailyResult.squares}</p>
                <button
                  onClick={() =>
                    copyText(buildShare(roundPtsRef.current, score, maxScore, dailyInfo.num))
                  }
                  className="mt-2 rounded-lg bg-accent px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90"
                >
                  {copied ? "copied ✓" : "share result"}
                </button>
                <p className="mt-1.5 font-mono text-[10px] text-muted">
                  new challenge tomorrow
                </p>

                {/* the leaderboard: same board, whole planet */}
                <div className="mt-3 border-t border-accent/20 pt-3 text-left">
                  {lbState !== "done" ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        maxLength={16}
                        placeholder="name for the board"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] outline-none transition focus:border-accent"
                      />
                      <button
                        onClick={submitScore}
                        disabled={lbState === "sending"}
                        className="shrink-0 rounded-lg border border-accent/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-accent transition hover:bg-accent-soft disabled:opacity-50"
                      >
                        {lbState === "sending" ? "posting…" : lbState === "failed" ? "retry" : "post score"}
                      </button>
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-accent">
                      {rank ? `#${rank} today, worldwide.` : "posted."}
                    </p>
                  )}
                  {board && board.length > 0 && (
                    <div className="mt-2 space-y-0.5 font-mono text-[10.5px] text-muted">
                      {board.slice(0, 10).map((e, i) => (
                        <p key={`${e.name}-${i}`} className="flex justify-between gap-3">
                          <span className="truncate">
                            {i + 1}. {e.name}
                          </span>
                          <span className="tabular-nums">{e.score.toLocaleString()}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {board && board.length === 0 && lbState !== "done" && (
                    <p className="mt-2 font-mono text-[10px] text-muted">
                      nobody on today&apos;s board yet. claim it.
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="mt-1 flex flex-wrap justify-center gap-3 sm:mt-2">
              {!dailyResult && (
                <button
                  onClick={() => startGame(modeIdx)}
                  className="rounded-lg bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg transition hover:opacity-90"
                >
                  play again
                </button>
              )}
              {!dailyResult && (
                <button
                  onClick={copyChallenge}
                  title="copy a link that replays these exact rounds"
                  className="rounded-lg border border-accent/50 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-accent transition hover:bg-accent-soft"
                >
                  {copiedLink ? "link copied ✓" : "challenge a friend"}
                </button>
              )}
              <button
                onClick={quitToMenu}
                className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition hover:border-accent hover:text-accent"
              >
                other maps
              </button>
            </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
