"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { bumpVibe } from "@/lib/vibeBus";

// Each cabinet is its own code-split chunk: opening a game fetches its JS,
// and nothing else. Twenty statically-imported games was one heavy bundle.
const booting = () => (
  <div className="panel grid h-40 place-items-center">
    <p className="animate-pulse text-sm text-muted">booting the cabinet…</p>
  </div>
);
const cab = (loader: () => Promise<{ [k: string]: React.ComponentType }>, name: string) =>
  dynamic(() => loader().then((m) => m[name]), { ssr: false, loading: booting });

const MapGame = cab(() => import("@/components/MapGame"), "MapGame");
const ChargeSim = cab(() => import("@/components/ChargeSim"), "ChargeSim");
const EpicycleDrawer = cab(() => import("@/components/EpicycleDrawer"), "EpicycleDrawer");
const MandelbrotExplorer = cab(() => import("@/components/MandelbrotExplorer"), "MandelbrotExplorer");
const PrisonersDilemma = cab(() => import("@/components/PrisonersDilemma"), "PrisonersDilemma");
const MagnetismSim = cab(() => import("@/components/MagnetismSim"), "MagnetismSim");
const CircuitSim = cab(() => import("@/components/CircuitSim"), "CircuitSim");
const InductionSim = cab(() => import("@/components/InductionSim"), "InductionSim");
const WaveSim = cab(() => import("@/components/WaveSim"), "WaveSim");
const AnalysisGame = cab(() => import("@/components/AnalysisGame"), "AnalysisGame");
const NimGame = cab(() => import("@/components/NimGame"), "NimGame");
const GoGame = cab(() => import("@/components/GoGame"), "GoGame");
const SnakeJava = cab(() => import("@/components/SnakeJava"), "SnakeJava");
const PendulumGame = cab(() => import("@/components/PendulumGame"), "PendulumGame");
const LogicPuzzle = cab(() => import("@/components/LogicPuzzle"), "LogicPuzzle");
const GuessYear = cab(() => import("@/components/GuessYear"), "GuessYear");
const WhichFirst = cab(() => import("@/components/WhichFirst"), "WhichFirst");
const TimelineBuilder = cab(() => import("@/components/TimelineBuilder"), "TimelineBuilder");
const FilterDesigner = cab(() => import("@/components/FilterDesigner"), "FilterDesigner");
const SmithChart = cab(() => import("@/components/SmithChart"), "SmithChart");
const PokerTrainer = cab(() => import("@/components/PokerTrainer"), "PokerTrainer");

// The arcade: a grid of cabinets. Pick one and the grid gets out of the way;
// "← all games" brings it back. Each game lazy-loads its engine only when
// opened. The area captions follow the real ECE taxonomy, filed correctly.
type GameDef = {
  key: string;
  label: string;
  tag: string; // the language
  area: string; // the department shelf it lives on
  render: () => ReactNode;
};

const GAMES: GameDef[] = [
  { key: "map", label: "Map game", tag: "Rust", area: "geography", render: () => <MapGame /> },
  { key: "gy", label: "Guess the year", tag: "Rust", area: "history", render: () => <GuessYear /> },
  { key: "wf", label: "Which came first?", tag: "Rust", area: "history", render: () => <WhichFirst /> },
  { key: "tl", label: "Timeline builder", tag: "Rust", area: "history", render: () => <TimelineBuilder /> },
  { key: "em", label: "Electrodynamics", tag: "C++", area: "fields & waves", render: () => <ChargeSim /> },
  { key: "mag", label: "Magnetism", tag: "C++", area: "fields & waves", render: () => <MagnetismSim /> },
  { key: "wav", label: "EM waves", tag: "C++", area: "fields & waves", render: () => <WaveSim /> },
  { key: "smith", label: "Smith chart", tag: "C++", area: "fields & waves", render: () => <SmithChart /> },
  { key: "cir", label: "Circuits", tag: "C++", area: "circuits & devices", render: () => <CircuitSim /> },
  { key: "ind", label: "Induction", tag: "C++", area: "power & machines", render: () => <InductionSim /> },
  { key: "pid", label: "Segway balance", tag: "C++", area: "systems & control", render: () => <PendulumGame /> },
  { key: "fourier", label: "Fourier", tag: "C++", area: "comms & signals", render: () => <EpicycleDrawer /> },
  { key: "filter", label: "Filter designer", tag: "C++", area: "comms & signals", render: () => <FilterDesigner /> },
  { key: "logic", label: "Logic gates", tag: "C++", area: "computers & computing", render: () => <LogicPuzzle /> },
  { key: "fractal", label: "Mandelbrot", tag: "C++", area: "math", render: () => <MandelbrotExplorer /> },
  { key: "pd", label: "Prisoner's Dilemma", tag: "C++", area: "math", render: () => <PrisonersDilemma /> },
  { key: "eps", label: "ε–δ & Riemann", tag: "C++", area: "math", render: () => <AnalysisGame /> },
  { key: "poker", label: "Texas Roadhouse", tag: "C++", area: "math", render: () => <PokerTrainer /> },
  { key: "nim", label: "Nim", tag: "Rust", area: "math", render: () => <NimGame /> },
  { key: "go", label: "Go", tag: "written in Go", area: "languages", render: () => <GoGame /> },
  { key: "java", label: "Snake", tag: "Java bytecode", area: "languages", render: () => <SnakeJava /> },
];

export function GameChooser() {
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const game = GAMES.find((g) => g.key === active) ?? null;

  const pick = (k: string | null) => {
    activeRef.current = k;
    setActive(k);
    if (k) bumpVibe("gamer", 10);
  };

  // the chatbot's {{act:play|...}} targets the map game; open that cabinet
  // first if needed, then re-fire once MapGame has mounted
  useEffect(() => {
    const onLaunch = (e: Event) => {
      if (activeRef.current === "map") return; // MapGame handles it itself
      pick("map");
      const detail = (e as CustomEvent).detail;
      // the cabinet is code-split now: give its chunk a moment to arrive
      // (MapGame's own listener then waits out the wasm load itself)
      setTimeout(() => window.dispatchEvent(new CustomEvent("mapgame:launch", { detail })), 1200);
    };
    window.addEventListener("mapgame:launch", onLaunch);
    return () => window.removeEventListener("mapgame:launch", onLaunch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (game) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <button
            onClick={() => pick(null)}
            className="btn-term px-3 py-1.5 text-[11px]"
          >
            ← all games
          </button>
          <span className="text-sm font-medium">{game.label}</span>
          <span className="text-[10px] text-muted">
            {game.tag} · {game.area}
          </span>
        </div>
        {game.render()}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted">
        {GAMES.length} machines · pick one
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {GAMES.map((g) => (
          <button
            key={g.key}
            onClick={() => pick(g.key)}
            className="panel group flex flex-col items-start gap-1 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent"
          >
            <span className="text-sm font-medium leading-tight group-hover:text-accent">
              {g.label}
            </span>
            <span className="text-[10px] text-accent/80">{g.tag}</span>
            <span className="text-[9px] uppercase tracking-widest text-muted">
              {g.area}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
