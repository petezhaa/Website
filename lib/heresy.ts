// "Publish your heresy", the park tier list reverts your edits after 2.4s,
// so we capture your INTENDED ordering at move time and pack the parks you
// moved off-canon into a /heresy/<code> URL. Stateless, all in the path
// (opengraph-image routes only receive path params, not query).

import { PARK_TIERS } from "@/lib/parks";

export const TIER_LABELS = ["S", "A", "B", "C", "D"];
export const TIER_HEX = ["#ff7f7e", "#ffbf7f", "#ffdf80", "#feff7f", "#bfff7f"];

// canon order: every park flattened S→D, giving each a stable index 0..62
export const PARK_LIST: string[] = PARK_TIERS.flatMap((t) => t.parks);

const CANON: number[] = PARK_TIERS.flatMap((t, ti) => t.parks.map(() => ti));

export function parkIndexOf(name: string): number {
  return PARK_LIST.indexOf(name);
}
export function tierDigit(label: string): number {
  return TIER_LABELS.indexOf(label);
}
export function canonTier(index: number): number {
  return CANON[index] ?? 3;
}

export type Heresy = { index: number; tier: number }[];

const VERSION = 1; // bump if PARK_TIERS order changes

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeHeresy(changes: Heresy): string {
  const n = Math.min(changes.length, 63);
  const buf = new Uint8Array(2 + n * 2);
  buf[0] = VERSION;
  buf[1] = n;
  for (let i = 0; i < n; i++) {
    buf[2 + i * 2] = changes[i].index & 0xff;
    buf[2 + i * 2 + 1] = changes[i].tier & 0xff;
  }
  return toB64Url(buf);
}

export function decodeHeresy(code: string): Heresy | null {
  try {
    const b = fromB64Url(code);
    if (b[0] !== VERSION) return null;
    const n = b[1];
    if (2 + n * 2 > b.length) return null;
    const out: Heresy = [];
    for (let i = 0; i < n; i++) {
      const index = b[2 + i * 2];
      const tier = b[2 + i * 2 + 1];
      if (index < PARK_LIST.length && tier < TIER_LABELS.length) {
        out.push({ index, tier });
      }
    }
    return out;
  } catch {
    return null;
  }
}
