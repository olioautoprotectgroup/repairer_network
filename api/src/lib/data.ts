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
 * Writes the full repairer list to local disk immediately (so this warm
 * instance sees the change right away) and commits it back to the repo via
 * the GitHub API so the change survives the next deploy/restart.
 */
export async function saveRepairers(repairers: Repairer[], commitMessage: string): Promise<void> {
  fs.writeFileSync(DATA_FILE, JSON.stringify(repairers, null, 2) + "\n", "utf-8");
  await commitRepairersJson(repairers, commitMessage);
}
