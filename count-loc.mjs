// Counts the site's own source lines at build time and bakes them into
// lib/sitecode.json, because the deployed worker has no filesystem to
// walk. Runs automatically via the prebuild hook.
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const SKIP = new Set([
  "node_modules",
  ".next",
  ".open-next",
  ".git",
  "public",
  "scripts",
  "legacy-static",
  "target",
]);

const acc = { ts: 0, rust: 0, css: 0 };

function countLines(file) {
  return readFileSync(file, "utf-8").split("\n").length;
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.ts += countLines(full);
    else if (/\.rs$/.test(entry.name)) acc.rust += countLines(full);
    else if (/\.css$/.test(entry.name)) acc.css += countLines(full);
  }
}

walk(process.cwd());

let wasmKB = 0;
try {
  wasmKB = Math.round(statSync(join(process.cwd(), "public", "mapgame.bin")).size / 1024);
} catch {}

writeFileSync(
  join(process.cwd(), "lib", "sitecode.json"),
  JSON.stringify({ ...acc, wasmKB }, null, 2) + "\n"
);
console.log("sitecode.json:", JSON.stringify({ ...acc, wasmKB }));
