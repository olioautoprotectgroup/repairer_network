/**
 * Archiving a repairer: the app's way of removing one from the network.
 *
 * It is deliberately an archive rather than a delete. The row stays in
 * repairers.json for two reasons, both of which a hard delete would break:
 *
 *  1. The nightly Databricks mirror is a copy of this file, and the
 *     intake-merge job anti-joins new Microsoft Forms sign-ups against that
 *     mirror BY COMPANY NAME. Remove the row and the repairer's original
 *     sign-up reads as brand new, so the next intake run POSTs it straight
 *     back in. That notebook lives outside this repo, so nothing here could
 *     prevent it.
 *  2. Ids are only unique against what is currently in the file
 *     (uniqueSlug in functions/repairers.ts). A deleted repairer frees its
 *     slug, so a later create for a similarly named business can take it and
 *     silently inherit the old repairer's reviews and discount reports,
 *     which are keyed on that id.
 *
 * Keeping the row solves both for free, and makes a mistaken click one
 * click to undo.
 *
 * The decision logic lives here rather than in the route handler so the
 * tests can reach it -- importing anything under api/src/functions/
 * registers HTTP routes as a module side effect, which is why this repo's
 * test boundary sits at lib/.
 */
import type { Repairer } from "./types";

export class RepairerNotFoundError extends Error {
  constructor(id: string) {
    super(`No repairer with id "${id}"`);
    this.name = "RepairerNotFoundError";
  }
}

/**
 * The single definition of "archived", used by both the search filter and
 * the Manage Repairers UI.
 *
 * Tests `!= null` rather than checking a boolean, because the key is absent
 * entirely on records written before this field existed -- exactly as
 * recentRepairCount is missing from 10 of the 114 records today. A
 * `=== null` check would wrongly treat those as archived.
 */
export function isArchived(repairer: Repairer): boolean {
  return repairer.archivedAt != null;
}

export function isActive(repairer: Repairer): boolean {
  return !isArchived(repairer);
}

/**
 * Returns the full list with one repairer's archive stamp set or cleared,
 * plus the updated record for the caller to hand back to the client.
 *
 * Pure: takes the list, returns a new one. The caller owns reading the
 * current file from GitHub and committing the result, so the sha-safety
 * rules in lib/github.ts still apply unchanged.
 */
export function applyArchive(
  repairers: Repairer[],
  id: string,
  archived: boolean,
  actorEmail: string,
  now: Date = new Date(),
): { next: Repairer[]; updated: Repairer } {
  const index = repairers.findIndex((r) => r.id === id);
  if (index === -1) throw new RepairerNotFoundError(id);

  const updated: Repairer = {
    ...repairers[index],
    // ISO-8601 with an explicit Z, like every other timestamp this app
    // writes.
    archivedAt: archived ? now.toISOString() : null,
    archivedBy: archived ? actorEmail : null,
  };

  const next = [...repairers];
  next[index] = updated;
  return { next, updated };
}
