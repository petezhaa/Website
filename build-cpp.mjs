// Compiles every freestanding C++ engine in cpp/ to a bare wasm32 binary in
// public/. Needs LLVM clang (any clang ≥ 15 with the wasm32 backend — the
// stock LLVM installer has it). The .bin files are committed, so this only
// needs to run when an engine changes.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const CLANG_CANDIDATES = [
  "clang", // on PATH
  "C:/Program Files/LLVM/bin/clang.exe",
];
const clang = CLANG_CANDIDATES.find((c) => {
  try {
    execFileSync(c, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!clang) {
  console.error("no clang found — install LLVM or add clang to PATH");
  process.exit(1);
}

// [source, output, extra link flags]
const ENGINES = [
  ["cpp/bench.cpp", "public/bench.bin", ["-Wl,--export=bench_run"]],
  ["cpp/charges.cpp", "public/charges.bin", []],
  ["cpp/epicycles.cpp", "public/epicycles.bin", []],
  ["cpp/mandelbrot.cpp", "public/mandelbrot.bin", []],
  ["cpp/dilemma.cpp", "public/dilemma.bin", []],
  ["cpp/magnet.cpp", "public/magnet.bin", []],
  ["cpp/circuits.cpp", "public/circuits.bin", []],
  ["cpp/faraday.cpp", "public/faraday.bin", []],
  ["cpp/waves.cpp", "public/waves.bin", []],
  ["cpp/analysis.cpp", "public/analysis.bin", []],
];

for (const [src, out, extra] of ENGINES) {
  if (!existsSync(src)) {
    console.log(`skip ${src} (missing)`);
    continue;
  }
  execFileSync(clang, [
    "--target=wasm32", "-O3", "-nostdlib", "-Wl,--no-entry", ...extra, "-o", out, src,
  ]);
  console.log(`built ${out}`);
}
