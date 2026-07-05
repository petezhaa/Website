"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MapGame } from "@/components/MapGame";
import { ChargeSim } from "@/components/ChargeSim";
import { EpicycleDrawer } from "@/components/EpicycleDrawer";
import { MandelbrotExplorer } from "@/components/MandelbrotExplorer";
import { PrisonersDilemma } from "@/components/PrisonersDilemma";
import { MagnetismSim } from "@/components/MagnetismSim";
import { CircuitSim } from "@/components/CircuitSim";
import { InductionSim } from "@/components/InductionSim";
import { WaveSim } from "@/components/WaveSim";
import { AnalysisGame } from "@/components/AnalysisGame";
import { NimGame } from "@/components/NimGame";
import { GoGame } from "@/components/GoGame";
import { SnakeJava } from "@/components/SnakeJava";
import { PendulumGame } from "@/components/PendulumGame";
import { LogicPuzzle } from "@/components/LogicPuzzle";
import { FilterDesigner } from "@/components/FilterDesigner";
import { SmithChart } from "@/components/SmithChart";
import { bumpVibe } from "@/lib/vibeBus";

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
      setTimeout(() => window.dispatchEvent(new CustomEvent("mapgame:launch", { detail })), 400);
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
            className="rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] text-muted transition hover:border-accent hover:text-accent"
          >
            ← all games
          </button>
          <span className="text-sm font-medium">{game.label}</span>
          <span className="font-mono text-[10px] text-muted">
            {game.tag} · {game.area}
          </span>
        </div>
        {game.render()}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[11px] text-muted">
        {GAMES.length} machines · pick one
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {GAMES.map((g) => (
          <button
            key={g.key}
            onClick={() => pick(g.key)}
            className="group flex flex-col items-start gap-1 rounded-xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-accent"
          >
            <span className="text-sm font-medium leading-tight group-hover:text-accent">
              {g.label}
            </span>
            <span className="font-mono text-[10px] text-accent/80">{g.tag}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
              {g.area}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
