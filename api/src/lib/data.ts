import * as fs from "node:fs";
import * as path from "node:path";
import type { Repairer } from "./types";

// Compiled to dist/src/lib/data.js -- data/ lives alongside src/, three levels up from there.
const DATA_FILE = path.join(__dirname, "..", "..", "..", "data", "repairers.json");

/**
 * Fast read of the locally bundled copy -- used by search/list, where
 * being up to ~1 minute behind the latest edit is an acceptable tradeoff
 * for not hitting the GitHub API on every request. Writes must NOT use
 * this as their base (see github.ts's getCurrentRepairers).
 */
export function loadRepairers(): Repairer[] {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as Repairer[];
}
