import * as fs from "node:fs";
import * as path from "node:path";
import type { Repairer } from "./types";
import { commitRepairersJson } from "./github";

// Compiled to dist/src/lib/data.js -- data/ lives alongside src/, three levels up from there.
const DATA_FILE = path.join(__dirname, "..", "..", "..", "data", "repairers.json");

export function loadRepairers(): Repairer[] {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as Repairer[];
}

/**
 * Commits the full repairer list back to the repo via the GitHub API,
 * which triggers a redeploy (~1 minute) picking up the change for
 * everyone. Azure Static Web Apps' managed Functions are deployed
 * read-only ("Run From Package"), so this can't also write to local disk
 * for immediate same-instance visibility -- callers already return the
 * new/updated record directly in their response, so the caller who made
 * the change sees it immediately regardless.
 */
export async function saveRepairers(repairers: Repairer[], commitMessage: string): Promise<void> {
  await commitRepairersJson(repairers, commitMessage);
}
