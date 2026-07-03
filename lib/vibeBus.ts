// Client-side store + event bus for the visitor-vibe radar. Components
// report behavior with bumpVibe(); the corner widget re-renders off the
// event; the chatbot reads getVibe() to analyze the visitor on request.
export type VibeAxis = "explorer" | "gamer" | "chaos" | "curiosity" | "menace";
export type Vibe = Record<VibeAxis, number>;

const state: Vibe = {
  explorer: 0,
  gamer: 0,
  chaos: 0,
  curiosity: 0,
  menace: 0,
};
let samples = 0;

export function bumpVibe(axis: VibeAxis, amount: number) {
  if (typeof window === "undefined" || amount <= 0) return;
  state[axis] = Math.min(100, Math.round(state[axis] + amount));
  samples++;
  window.dispatchEvent(new CustomEvent("vibe"));
}

export function getVibe(): Vibe {
  return { ...state };
}

export function getVibeSamples(): number {
  return samples;
}
