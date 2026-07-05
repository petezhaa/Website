import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

// Without an incremental cache, every request re-renders the page and
// re-fetches Letterboxd/Steam/GitHub upstream — the homepage was paying a
// multi-second (worst case: tens of seconds) fan-out on every single visit.
// KV makes ISR actually incremental: cached HTML + fetch cache persist, and
// the hourly revalidate happens in the background instead of in your face.
export default defineCloudflareConfig({
  // regional cache keeps hot entries in the local Cloudflare cache so most
  // reads never cross a region to reach KV
  incrementalCache: withRegionalCache(kvIncrementalCache, { mode: "long-lived" }),
  // ISR revalidation runs in a Durable Object instead of blocking requests
  queue: doQueue,
});
