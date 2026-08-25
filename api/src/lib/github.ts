/**
 * Persists edits made in the "Manage Repairers" screen by committing the
 * updated data/repairers.json straight back to this repo via the GitHub
 * Contents API. This keeps the interim data store at zero additional
 * infrastructure cost (no database) -- the tradeoff is a short redeploy
 * delay (roughly a minute, via the existing CI/CD) before an edit is live,
 * since Azure Functions' local disk isn't guaranteed to persist writes
 * across restarts/scale-out.
 *
 * Required app settings: GITHUB_TOKEN (a fine-grained PAT scoped to this
 * repo's Contents: Read and write permission), GITHUB_OWNER, GITHUB_REPO.
 * Optional: GITHUB_BRANCH (defaults to "main"), GITHUB_DATA_PATH (defaults
 * to "api/data/repairers.json").
 */
const GITHUB_API = "https://api.github.com";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required app setting: ${name}`);
  return value;
}

function repoConfig() {
  return {
    owner: requiredEnv("GITHUB_OWNER"),
    repo: requiredEnv("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH || "main",
    path: process.env.GITHUB_DATA_PATH || "api/data/repairers.json",
    token: requiredEnv("GITHUB_TOKEN"),
  };
}

async function githubRequest(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  return res.json();
}

/** Commits the given JSON content to the data file, replacing it entirely. */
export async function commitRepairersJson(content: unknown, commitMessage: string): Promise<void> {
  const { owner, repo, branch, path, token } = repoConfig();
  const contentsUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const existing = (await githubRequest(contentsUrl, token)) as { sha: string };

  const body = JSON.stringify(content, null, 2) + "\n";
  const encoded = Buffer.from(body, "utf-8").toString("base64");

  await githubRequest(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message: commitMessage,
      content: encoded,
      sha: existing.sha,
      branch,
    }),
  });
}
