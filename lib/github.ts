// GitHub stats for petezhaa via the public API (no key; cached 6h).
export const GITHUB_URL = "https://github.com/petezhaa";

export type GithubStats = {
  repos: number;
};

const HEADERS = { "User-Agent": "peterzhao-site" };

export async function getGithubStats(): Promise<GithubStats | null> {
  try {
    const res = await fetch(
      "https://api.github.com/users/petezhaa/repos?per_page=100&sort=pushed",
      { headers: HEADERS, next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const repos = (await res.json()) as unknown[];
    if (!Array.isArray(repos) || repos.length === 0) return null;
    return { repos: repos.length };
  } catch {
    return null;
  }
}
