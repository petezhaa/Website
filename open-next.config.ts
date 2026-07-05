import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

// Without an incremental cache, every request re-renders the page and
// re-fetches Letterboxd/Steam/GitHub upstream — the homepage was paying a
// multi-second (worst case: tens of seconds) fan-out on every single visit.
// KV makes ISR actually incremental: cached HTML + fetch cache persist, and
// the hourly revalidate happens in the background instead of in your face.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
