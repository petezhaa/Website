import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// The site measures its own source. Computed once per server process;
// wrapped in try/catch because serverless bundles may not ship the source.
export type SiteCode = {
  ts: number; // TypeScript/TSX lines
  rust: number;
  css: number;
  wasmKB: number;
};

const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
  "public",
  "scripts",
  "legacy-static",
  "target",
]);

let cached: SiteCode | null | undefined;

function countLines(file: string): number {
  return readFileSync(file, "utf-8").split("\n").length;
}

function walk(dir: string, acc: { ts: number; rust: number; css: number }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(join(dir, entry.name), acc);
      continue;
    }
    const p = join(dir, entry.name);
    if (/\.(ts|tsx)$/.test(entry.name)) acc.ts += countLines(p);
    else if (/\.rs$/.test(entry.name)) acc.rust += countLines(p);
    else if (/\.css$/.test(entry.name)) acc.css += countLines(p);
  }
}

export function getSiteCode(): SiteCode | null {
  if (cached !== undefined) return cached;
  try {
    const acc = { ts: 0, rust: 0, css: 0 };
    walk(process.cwd(), acc);
    const wasmKB = Math.round(
      statSync(join(process.cwd(), "public", "mapgame.wasm")).size / 1024
    );
    cached = acc.ts > 0 ? { ...acc, wasmKB } : null;
  } catch {
    cached = null;
  }
  return cached;
}
