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

// ---- the secrets ledger ----
// Twenty discoverable things across the site: typed words, feats in the
// games, small interactions. Components report finds here; the count (never
// the list) shows on the "meanwhile, you" card. Finding secrets is the
// explorer endgame.
export const SECRET_TOTAL = 20;

export function foundSecret(key: string) {
  if (typeof window === "undefined") return;
  try {
    const set = new Set<string>(
      JSON.parse(localStorage.getItem("secrets-found") ?? "[]")
    );
    if (set.has(key)) return; // already on the record
    set.add(key);
    localStorage.setItem("secrets-found", JSON.stringify([...set]));
    bumpVibe("explorer", 15);
    window.dispatchEvent(
      new CustomEvent("secret-found", { detail: { key, count: set.size } })
    );
  } catch {}
}

export function secretsFound(): number {
  if (typeof window === "undefined") return 0;
  try {
    return (JSON.parse(localStorage.getItem("secrets-found") ?? "[]") as string[]).length;
  } catch {
    return 0;
  }
}
