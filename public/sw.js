// Service worker: the arcade works on a plane.
// - navigations: network first, cached home as the offline fallback
// - engines + static chunks: cache first (they're immutable per deploy)
// - everything else same-origin: network, backfilling the cache
const VERSION = "v4";
const CACHE = `petezha-${VERSION}`;

// Precache ONLY the tiny engines (~180 KB total): first-visit bandwidth
// belongs to the page, not the plane scenario. The heavy pieces (goban.wasm
// 2.1 MB, the map JSONs) cache on first use via the fetch handler below —
// open a cabinet once and it's yours offline.
const PRECACHE = [
  "/mapgame.bin",
  "/charges.bin",
  "/epicycles.bin",
  "/mandelbrot.bin",
  "/dilemma.bin",
  "/magnet.bin",
  "/circuits.bin",
  "/faraday.bin",
  "/waves.bin",
  "/analysis.bin",
  "/pendulum.bin",
  "/filter.bin",
  "/smith.bin",
  "/logic.bin",
  "/poker.bin?v=2",
  "/nim.bin",
  "/history.bin",
  "/bench.bin",
  "/benchrs.bin",
  "/wasm_exec.js",
  "/Snake.class",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CACHE_FIRST = /\.(bin|wasm|class|woff2?)$|\/maps\/|\/_next\/static\//;

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // never cache the API (the leaderboard is live data)
  if (url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    // fresh page when online; the cached home when the plane door closes
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // only an OK page is a valid offline fallback; caching an error
          // page would serve it forever
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (CACHE_FIRST.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            // cache-first means a cached 404 is permanent: never cache non-OK
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            }
            return res;
          })
      )
    );
    return;
  }

  // everything else (RSC payloads, images, API-adjacent): untouched. The
  // browser's own path is faster than a clone-and-cache detour.
});
