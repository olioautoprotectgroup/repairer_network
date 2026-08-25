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

/**
 * Like requiredEnv, but for values that end up in an HTTP header (which must
 * be plain ASCII/Latin1). Copy-pasting a token through an app with
 * autocorrect/"smart" punctuation (Word, Notes, etc.) can silently swap in a
 * curly quote or an arrow -- the raw fetch() error for that ("character ...
 * has a value ... greater than 255") gives no hint it's an app setting
 * problem, so check explicitly and say so.
 */
function requiredHeaderSafeEnv(name: string): string {
  const value = requiredEnv(name).trim();
  const badChar = [...value].find((c) => (c.codePointAt(0) ?? 0) > 255);
  if (badChar) {
    throw new Error(
      `App setting ${name} contains a non-standard character (U+${(badChar.codePointAt(0) ?? 0)
        .toString(16)
        .toUpperCase()}) -- it was likely copy-pasted through something with autocorrect/` +
        `"smart" punctuation enabled. Re-copy it directly from GitHub and re-save the app setting.`,
    );
  }
  return value;
}

function repoConfig() {
  return {
    owner: requiredEnv("GITHUB_OWNER"),
    repo: requiredEnv("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH || "main",
    path: process.env.GITHUB_DATA_PATH || "api/data/repairers.json",
    token: requiredHeaderSafeEnv("GITHUB_TOKEN"),
  };
}

/**
 * Identifies a token's *type* from its prefix (classic vs fine-grained)
 * without ever exposing the secret part -- these prefixes are a fixed,
 * public part of GitHub's token format, not part of the secret itself.
 */
function describeTokenShape(token: string): string {
  const prefix = token.match(/^[a-z]+_/)?.[0];
  const kind =
    prefix === "ghp_"
      ? "classic PAT"
      : prefix === "github_pat_"
        ? "fine-grained PAT"
        : prefix
          ? `unrecognised prefix "${prefix}"`
          : "no recognised prefix (old-style 40-char token?)";
  return `${kind}, length ${token.length}`;
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
    throw new Error(`GitHub API ${res.status} (using ${describeTokenShape(token)}): ${body}`);
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
