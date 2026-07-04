# petezha.xyz

My personal site. Next.js and Tailwind on the outside, a Rust game engine on the inside.

**Live at [petezha.xyz](https://petezha.xyz)**

## What's in it

- **The map game.** A geography guessing game with seven modes (U.S. states, countries, historical battles, presidential birthplaces, chip fabs, world capitals, national parks). The engine (scoring, haversine distances, streaks, every coordinate) is Rust compiled to bare WebAssembly, no wasm-bindgen. React and d3-geo draw the map, including a 3D globe that spins with momentum.
- **PeterBot.** A phone-simulation chat that texts like me. Groq behind it, my persona in front of it.
- **Live stats.** Letterboxd and Steam data pulled server-side and run through actual statistics: hypothesis tests, control charts, a Lorenz curve, a survival curve of my backlog. The charts are hand-rolled SVG.
- **A national park tier list** that argues back if you move Zion out of C tier.
- **A vibe radar** that graphs how you behave on the site. The bot can read it.
- There is one secret. The bot will hint at it if you ask.

## Stack

Next.js (App Router, webpack build), Tailwind v4, motion, d3-geo, Rust → wasm32-unknown-unknown, deployed to Cloudflare Workers via OpenNext.

## Develop

```bash
npm run dev        # dev server
npm run build:wasm # rebuild the Rust engine -> public/mapgame.bin
npm run build      # production build (webpack, not turbopack)
```

Deploy:

```bash
npx opennextjs-cloudflare build && npx wrangler deploy
```

Needs `GROQ_API_KEY` and `STEAM_API_KEY` in `.env.local` (and as Cloudflare secrets in production).

Designed and built by me, in Pulaski, WI.
