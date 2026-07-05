# petezha.xyz

My personal site. Next.js and Tailwind on the outside, a Rust game engine on the inside.

**Live at [petezha.xyz](https://petezha.xyz)**

## What's in it

- **A 12-game arcade in 4 languages**, all in the browser, no plugins:
  - **The map game** (Rust → bare wasm, no wasm-bindgen): geography guessing across 8 modes, a Wordle-style daily challenge, and stateless challenge-a-friend links with generated OG cards.
  - **Physics sims** (freestanding C++ → wasm): electrodynamics with a draggable Gauss's-law surface, Lorentz-force magnetism, RC/RL/RLC circuits, Faraday induction, a 1D FDTD wave lab, and a Fourier epicycle drawer.
  - **Math** (C++): a Mandelbrot explorer, an iterated Prisoner's Dilemma with an Axelrod tournament, and an ε–δ / Riemann-sum game.
  - **Go, written in Go** (standard toolchain → wasm): 9×9 rules engine with a greedy bot.
  - **Snake, in actual Java**: javac-compiled bytecode executed by a ~250-line JVM interpreter written in TypeScript (lib/jvm.ts).
- **A live benchmark** racing the same hand-written haversine in C++, Rust, and JS.
- **PeterBot.** A phone-simulation chat that texts like me — and can drive the page (launch games, flip the theme). Groq behind it, my persona in front of it.
- **Live stats.** Letterboxd and Steam data pulled server-side and run through actual statistics: hypothesis tests, control charts, a Lorenz curve, a survival curve of my backlog, and a guess-my-rating game against a regression of my own taste. The charts are hand-rolled SVG.
- **A national park tier list** that argues back if you move Zion out of C tier — and mints a shareable /heresy receipt if you publish your defiance anyway.
- **A vibe radar** that graphs how you behave on the site. The bot can read it.
- **A /now page**, half hand-written, half live data.
- There is one secret. The bot will hint at it if you ask.

## Stack

Next.js (App Router, webpack build), Tailwind v4, motion, d3-geo, Rust + C++ + Go + Java → WebAssembly/bytecode, deployed to Cloudflare Workers via OpenNext.

## Develop

```bash
npm run dev            # dev server
npm run build:wasm     # rebuild the Rust map engine -> public/mapgame.bin
npm run build:cppwasm  # rebuild all C++ engines + the Rust bench -> public/*.bin
npm run build:goban    # rebuild the Go engine -> public/goban.wasm
npm run build:java     # recompile Snake.java -> public/Snake.class
npm run build          # production build (webpack, not turbopack)
```

Deploy:

```bash
npx opennextjs-cloudflare build && npx wrangler deploy
```

Needs `GROQ_API_KEY` and `STEAM_API_KEY` in `.env.local` (and as Cloudflare secrets in production).

Designed and built by me, in Pulaski, WI.
