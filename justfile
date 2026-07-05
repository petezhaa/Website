# petezha.xyz task runner — `just` (https://github.com/casey/just)
# install: winget install Casey.Just   ·   list recipes: just
# npm scripts remain the source of truth; this is the menu.

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# list everything
default:
    just --list

# dev server
dev:
    npm run dev

# production build (webpack, not turbopack)
build:
    npm run build

# typecheck only
check:
    npx tsc --noEmit

# ---- engines (compiled artifacts are committed; rebuild only what changed) ----

# the Rust map-game engine -> public/mapgame.bin
wasm:
    npm run build:wasm

# every C++ engine + the Rust bench + Nim -> public/*.bin
engines:
    npm run build:cppwasm

# the Go board-game engine -> public/goban.wasm
goban:
    npm run build:goban

# Snake.java -> bytecode -> public/Snake.class
java:
    npm run build:java

# rebuild every engine in every language
all-engines: wasm engines goban java

# ---- shipping ----

# bundle the worker and deploy to Cloudflare (petezha.xyz)
deploy:
    npx opennextjs-cloudflare build
    npx wrangler deploy

# the whole ceremony: engines, site build, deploy
ship: all-engines build deploy
