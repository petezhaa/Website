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
import { GoGame } from "@/components/GoGame";
import { SnakeJava } from "@/components/SnakeJava";

// The arcade. Each game is its own engine; only the selected one mounts (and
// lazy-loads its binary). Grouped by discipline, because there are majors to
// represent. Adding a game = one entry here.
type GameDef = { key: string; label: string; tag: string; render: () => ReactNode };
const GROUPS: { label: string; games: GameDef[] }[] = [
  {
    label: "geography",
    games: [{ key: "map", label: "Map game", tag: "Rust", render: () => <MapGame /> }],
  },
  {
    label: "physics (EE)",
    games: [
      { key: "em", label: "Electrodynamics", tag: "C++", render: () => <ChargeSim /> },
      { key: "mag", label: "Magnetism", tag: "C++", render: () => <MagnetismSim /> },
      { key: "cir", label: "Circuits", tag: "C++", render: () => <CircuitSim /> },
      { key: "ind", label: "Induction", tag: "C++", render: () => <InductionSim /> },
      { key: "wav", label: "EM waves", tag: "C++", render: () => <WaveSim /> },
      { key: "fourier", label: "Fourier", tag: "C++", render: () => <EpicycleDrawer /> },
    ],
  },
  {
    label: "math",
    games: [
      { key: "fractal", label: "Mandelbrot", tag: "C++", render: () => <MandelbrotExplorer /> },
      { key: "pd", label: "Prisoner's Dilemma", tag: "C++", render: () => <PrisonersDilemma /> },
      { key: "eps", label: "ε–δ & Riemann", tag: "C++", render: () => <AnalysisGame /> },
    ],
  },
  {
    label: "languages",
    games: [
      { key: "go", label: "Go", tag: "in Go", render: () => <GoGame /> },
      { key: "java", label: "Snake", tag: "Java bytecode", render: () => <SnakeJava /> },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.games);

export function GameChooser() {
  const [active, setActive] = useState("map");
  const activeRef = useRef("map");
  const game = ALL.find((g) => g.key === active) ?? ALL[0];

  const pick = (k: string) => {
    activeRef.current = k;
    setActive(k);
  };

  // the chatbot's {{act:play|...}} targets the map game; if another cabinet
  // is active, switch to it and re-fire the event once MapGame has mounted
  useEffect(() => {
    const onLaunch = (e: Event) => {
      if (activeRef.current === "map") return; // MapGame handles it itself
      pick("map");
      const detail = (e as CustomEvent).detail;
      setTimeout(() => window.dispatchEvent(new CustomEvent("mapgame:launch", { detail })), 400);
    };
    window.addEventListener("mapgame:launch", onLaunch);
    return () => window.removeEventListener("mapgame:launch", onLaunch);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted">
              {group.label}
            </span>
            {group.games.map((g) => (
              <button
                key={g.key}
                onClick={() => pick(g.key)}
                className={`rounded-xl border px-3.5 py-1.5 text-sm transition ${
                  active === g.key
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {g.label}
                <span className="ml-2 hidden font-mono text-[10px] opacity-70 sm:inline">
                  {g.tag}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {game.render()}
    </div>
  );
}
