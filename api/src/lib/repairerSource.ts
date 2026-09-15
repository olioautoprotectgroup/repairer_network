/**
 * The repairer list as Search should see it: current, without waiting for a
 * redeploy.
 *
 * Why this exists. Every write in this app commits repairers.json to GitHub,
 * and the running Function App serves the copy that was bundled into it at
 * BUILD time (lib/data.ts). So a change is only visible to Search once a
 * deploy has succeeded. For an edit that was an acceptable trade-off -- a
 * labour rate being a minute stale harms nobody. For archiving it is not:
 * the whole point of archiving a repairer is that the team stops being sent
 * to it, and until the deploy lands Search keeps returning it. Manage
 * Repairers reads live from GitHub, so the owner watches the repairer move
 * into the Archived section and then finds it still coming up in Search,
 * which reads exactly like the feature not working.
 *
 * That window is normally ~90 seconds, but it is not bounded by anything:
 * it lasts until a deploy of that commit succeeds. On 2026-09-04 the
 * production deploys were failing outright and ran ~15 minutes when they
 * did work; an archive committed in that window stayed live in Search the
 * whole time.
 *
 * So Search reads through GitHub instead, cached in-process:
 *
 *  - A hit inside CACHE_TTL_MS costs nothing. Search is the hot path (every
 *    query, ~124 cards), so one GitHub call per minute per warm instance is
 *    the most this may cost.
 *  - A failure falls back to the last good read, or to the bundled file --
 *    i.e. to exactly today's behaviour. GitHub must not become a hard
 *    dependency of the app's core feature, so a GitHub outage degrades
 *    Search's freshness rather than breaking Search.
 *  - After a failure it stops retrying for FAILURE_BACKOFF_MS, so a GitHub
 *    outage costs one slow search a minute rather than adding a failing
 *    round-trip to every single one.
 *
 * Writes must keep using getCurrentRepairers() directly. They need the blob
 * sha for the conflict check, and a cached sha would defeat it -- see
 * github.ts.
 */
import { loadRepairers } from "./data";
import { getCurrentRepairers } from "./github";
import type { Repairer } from "./types";

/** Long enough that a burst of searches costs one GitHub call, short enough
 * that "I archived it and it's still showing" stops being true in under the
 * time it takes to re-run the search. */
export const CACHE_TTL_MS = 60_000;

/** After a failed read, serve the fallback for this long before trying
 * GitHub again. */
export const FAILURE_BACKOFF_MS = 30_000;

let cached: { repairers: Repairer[]; fetchedAt: number } | null = null;
let failingUntil = 0;
/** The read currently in flight, so a burst of concurrent searches on a cold
 * instance shares one GitHub call instead of firing one each. */
let inFlight: Promise<Repairer[]> | null = null;

/** Test seam. Module-level state would otherwise leak between test cases,
 * and between a test run and whatever ran before it. */
export function resetRepairerCache(): void {
  cached = null;
  failingUntil = 0;
  inFlight = null;
}

/**
 * The most recent repairer list available, freshest source first: the live
 * GitHub copy, else the last good read, else the bundled file.
 *
 * Never throws -- a caller that cannot get fresh data should still be able
 * to serve a search.
 */
export async function getLiveRepairers(
  onError?: (message: string, err: unknown) => void,
): Promise<Repairer[]> {
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.repairers;
  if (now < failingUntil) return fallback();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data } = await getCurrentRepairers<Repairer[]>();
      cached = { repairers: data, fetchedAt: Date.now() };
      failingUntil = 0;
      return data;
    } catch (err) {
      // Deliberately not rethrown. Serving a slightly stale list is a far
      // better failure than a 500 on the app's main screen, and the caller
      // has no better option to fall back to than the one below.
      failingUntil = Date.now() + FAILURE_BACKOFF_MS;
      onError?.("Live repairer read failed; falling back to the bundled copy", err);
      return fallback();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * The last good live read if there is one, else the deployed copy. Prefers
 * the expired cache over the bundled file on purpose: an hour-old live read
 * is still newer than a file that was bundled at the last deploy.
 */
function fallback(): Repairer[] {
  return cached?.repairers ?? loadRepairers();
}
