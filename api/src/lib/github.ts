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
 * to "api/data/repairers.json"), GITHUB_FEEDBACK_PATH (defaults to
 * "api/data/repairer-feedback.json").
 *
 * Two data files now live behind this module, and they are deliberately
 * separate blobs: repairer records (curated by one owner, plus the nightly
 * Databricks repair-count sync) and staff feedback (reviews/discount
 * reports, written by any handler). Same-file writes would contend on one
 * sha, so a handler leaving a review would 409 against the nightly sync;
 * different paths mean different shas and no contention at all.
 */
import { requiredEnv, requiredHeaderSafeEnv } from "./env";

const GITHUB_API = "https://api.github.com";

/**
 * Read inside a function, not at module scope, so a setting injected after
 * this module loads still takes effect -- same reason repoConfig() and
 * tyrePrice/config.ts read their env lazily.
 */
export function repairersPath(): string {
  return process.env.GITHUB_DATA_PATH || "api/data/repairers.json";
}

export function feedbackPath(): string {
  return process.env.GITHUB_FEEDBACK_PATH || "api/data/repairer-feedback.json";
}

function repoConfig() {
  return {
    owner: requiredEnv("GITHUB_OWNER"),
    repo: requiredEnv("GITHUB_REPO"),
    branch: process.env.GITHUB_BRANCH || "main",
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

/**
 * Fetches a JSON data file straight from GitHub, along with the blob's
 * current sha. Every write must build on this rather than the local file
 * (which only reflects whatever was deployed last, up to ~1 minute stale)
 * -- otherwise two saves close together each silently overwrite the
 * other's change when they both write back a "full array" built from the
 * same outdated snapshot, even though each individual git commit succeeds.
 *
 * A file that doesn't exist yet comes back as `{ data: null, sha: null }`
 * rather than throwing, so a newly introduced data file behaves like an
 * empty one until its first write.
 */
export async function getCurrentFile<T>(
  path: string,
): Promise<{ data: T | null; sha: string | null }> {
  const { owner, repo, branch, token } = repoConfig();
  const contentsUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  let file: { sha: string; content: string };
  try {
    file = (await githubRequest(contentsUrl, token)) as { sha: string; content: string };
  } catch (err) {
    if (err instanceof Error && err.message.includes("GitHub API 404")) {
      return { data: null, sha: null };
    }
    throw err;
  }
  const decoded = Buffer.from(file.content, "base64").toString("utf-8");
  return { data: JSON.parse(decoded) as T, sha: file.sha };
}

/**
 * Commits the given JSON content to `path`, replacing the file entirely.
 * `expectedSha` must be the sha from the getCurrentFile() call this write
 * was based on -- GitHub rejects the commit with a 409 if the file has
 * moved on since (someone else saved in between), which surfaces as a
 * clear "please retry" error instead of silently discarding either edit.
 * Pass null only when creating the file for the first time.
 */
export async function commitFile(
  path: string,
  content: unknown,
  expectedSha: string | null,
  commitMessage: string,
): Promise<void> {
  const { owner, repo, branch, token } = repoConfig();
  const body = JSON.stringify(content, null, 2) + "\n";
  const encoded = Buffer.from(body, "utf-8").toString("base64");

  await githubRequest(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify({
      message: commitMessage,
      content: encoded,
      ...(expectedSha ? { sha: expectedSha } : {}),
      branch,
    }),
  });
}

/**
 * The repairer-list pair, unchanged in behaviour for every existing caller
 * -- the data file always exists, so the null case getCurrentFile() allows
 * for cannot arise here and the non-null return type is preserved.
 */
export async function getCurrentRepairers<T>(): Promise<{ data: T; sha: string }> {
  const { data, sha } = await getCurrentFile<T>(repairersPath());
  if (data === null || sha === null) {
    throw new Error(`Repairer data file not found at ${repairersPath()}`);
  }
  return { data, sha };
}

export async function commitRepairersJson(
  content: unknown,
  expectedSha: string,
  commitMessage: string,
): Promise<void> {
  await commitFile(repairersPath(), content, expectedSha, commitMessage);
}
