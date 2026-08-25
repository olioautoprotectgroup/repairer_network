import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getCurrentRepairers, commitRepairersJson } from "../lib/github";
import { isAuthorizedWriteback } from "../lib/auth";
import { saveFailureResponse } from "./repairers";
import type { Repairer } from "../lib/types";

const FORBIDDEN: HttpResponseInit = {
  status: 403,
  jsonBody: { error: "Access restricted to the Databricks repair-count sync job" },
};

interface RepairCountInput {
  id: string;
  recentRepairCount: number;
}

interface SyncRepairCountsBody {
  counts: RepairCountInput[];
  /** ISO timestamp the counts were computed as of. Defaults to receipt time
   * if the caller doesn't supply one. */
  asOf?: string;
}

/**
 * Batch write-back for the nightly Databricks repair-count job -- one
 * commit per run, not one per repairer. Machine-auth only (no human path):
 * recentRepairCount/repairCountAsOf are never editable via the Manage
 * Repairers form (see RepairerFormValues' Omit). Ids with no matching
 * repairer are reported back but otherwise ignored rather than erroring
 * the whole batch, so a partial/stale claims-match list doesn't block the
 * rest of the sync.
 */
export async function syncRepairCounts(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isAuthorizedWriteback(request)) return FORBIDDEN;

  const body = (await request.json()) as SyncRepairCountsBody;
  if (!Array.isArray(body.counts)) {
    return { status: 400, jsonBody: { error: "counts must be an array" } };
  }
  const asOf = body.asOf ?? new Date().toISOString();

  const { data: repairers, sha } = await getCurrentRepairers<Repairer[]>();
  const byId = new Map(repairers.map((r) => [r.id, r]));

  const unmatched: string[] = [];
  let matched = 0;
  for (const { id, recentRepairCount } of body.counts) {
    const repairer = byId.get(id);
    if (!repairer) {
      unmatched.push(id);
      continue;
    }
    repairer.recentRepairCount = recentRepairCount;
    repairer.repairCountAsOf = asOf;
    matched++;
  }

  if (unmatched.length > 0) {
    context.warn(`Repair-count sync: ${unmatched.length} id(s) had no matching repairer: ${unmatched.join(", ")}`);
  }

  if (matched === 0) {
    return { status: 200, jsonBody: { matched, unmatched } };
  }

  try {
    await commitRepairersJson(repairers, sha, `Sync repair counts from Databricks (${matched} repairer(s))`);
  } catch (err) {
    context.error("Failed to sync repair counts", err);
    return saveFailureResponse(err);
  }

  return { status: 200, jsonBody: { matched, unmatched } };
}

app.http("repair-counts-sync", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "repair-counts",
  handler: syncRepairCounts,
});
