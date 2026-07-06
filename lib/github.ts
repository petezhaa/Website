// GitHub stats for petezhaa via the public API (no key; cached 6h).
export const GITHUB_URL = "https://github.com/petezhaa";

export type GithubStats = {
  repos: number;
  // primary language -> how many (non-fork) repos lead with it. From the
  // same single list call, no per-repo requests, the keyless rate limit
  // is 60/hr and this site shares an egress IP with the whole planet.
  languages: Record<string, number>;
};

// keyless works from a friendly IP, but the worker shares Cloudflare egress
// with the internet, set GITHUB_TOKEN (fine-grained, public-repo read) as a
// secret to dodge the anonymous 60/hr limit in production.
const HEADERS: Record<string, string> = {
  "User-Agent": "peterzhao-site",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

export async function getGithubStats(): Promise<GithubStats | null> {
  try {
    const res = await fetch(
      "https://api.github.com/users/petezhaa/repos?per_page=100&sort=pushed",
      { headers: HEADERS, next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const repos = (await res.json()) as Array<{
      language?: string | null;
      fork?: boolean;
    }>;
    if (!Array.isArray(repos) || repos.length === 0) return null;
    const languages: Record<string, number> = {};
    for (const r of repos) {
      if (r.fork || !r.language) continue;
      languages[r.language] = (languages[r.language] ?? 0) + 1;
    }
    return { repos: repos.length, languages };
  } catch {
    return null;
  }
}
