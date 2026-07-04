// The site measures its own source. The counts are baked into
// lib/sitecode.json at build time (count-loc.mjs, prebuild hook) because
// the deployed worker ships no source tree to walk.
import counts from "./sitecode.json";

export type SiteCode = {
  ts: number; // TypeScript/TSX lines
  rust: number;
  css: number;
  wasmKB: number;
};

export function getSiteCode(): SiteCode | null {
  const c = counts as SiteCode;
  return c.ts > 0 ? c : null;
}
