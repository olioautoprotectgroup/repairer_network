import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getCurrentRepairers, commitRepairersJson } from "../lib/github";
import { geocodePostcode } from "../lib/geocode";
import { uniqueSlug } from "../lib/slug";
import { getClientPrincipal, isAuthorizedRepairerManager, isAuthorizedWriteback } from "../lib/auth";
import { RepairerNotFoundError, applyArchive } from "../lib/archive";
import type { Repairer } from "../lib/types";

// Every endpoint here backs the Manage Repairers screen, which is
// restricted to the repairer network owner rather than to staff at large --
// so these gate on isAuthorizedRepairerManager(), not isAuthorizedStaff().
// Search (api/src/functions/search.ts) is unchanged and stays open to the
// whole domain.
const FORBIDDEN: HttpResponseInit = {
  status: 403,
  jsonBody: { error: "Editing repairers is restricted to the repairer network owner" },
};

type RepairerInput = Omit<
  Repairer,
  "id" | "lat" | "lon" | "geocoded" | "recentRepairCount" | "repairCountAsOf"
  | "archivedAt" | "archivedBy"
>;

async function geocodeOrNull(postcode: string | null) {
  if (!postcode) return null;
  try {
    return await geocodePostcode(postcode);
  } catch {
    return null;
  }
}

export function saveFailureResponse(err: unknown): HttpResponseInit {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("GitHub API 409")) {
    return {
      status: 409,
      jsonBody: {
        error: "Someone else saved a change to the repairer list just now. Please retry your edit.",
      },
    };
  }
  return {
    status: 500,
    jsonBody: { error: "Failed to save repairer", detail: message },
  };
}

export async function listRepairers(request: HttpRequest): Promise<HttpResponseInit> {
  if (!isAuthorizedRepairerManager(request)) return FORBIDDEN;
  // Manage Repairers reads live from GitHub rather than the locally bundled
  // (up to ~1 minute stale) copy -- staff expect a just-added repairer to
  // show up on reload, not only within the tab that added it.
  const { data } = await getCurrentRepairers<Repairer[]>();
  return { jsonBody: data };
}

export async function createRepairer(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Accepts either the signed-in repairer network owner (Manage Repairers
  // form) or the Databricks new-repairer intake-merge job (shared-secret writeback
  // auth) -- both go through the same geocoding/slug/sha-safe commit logic.
  if (!isAuthorizedRepairerManager(request) && !isAuthorizedWriteback(request)) return FORBIDDEN;
  const input = (await request.json()) as RepairerInput;
  if (!input.companyName?.trim()) {
    return { status: 400, jsonBody: { error: "companyName is required" } };
  }

  // Read straight from GitHub, not the local (up to ~1 minute stale) file
  // copy -- otherwise a save built on an outdated snapshot would silently
  // overwrite anyone else's change made in the meantime.
  const { data: repairers, sha } = await getCurrentRepairers<Repairer[]>();

  const coords = await geocodeOrNull(input.postcode);
  if (input.postcode && !coords) {
    context.warn(`Could not geocode postcode "${input.postcode}" for new repairer`);
  }

  const newRepairer: Repairer = {
    ...input,
    id: uniqueSlug(input.companyName, repairers.map((r) => r.id)),
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    geocoded: Boolean(coords),
    recentRepairCount: null,
    repairCountAsOf: null,
    archivedAt: null,
    archivedBy: null,
  };

  const updated = [...repairers, newRepairer];
  try {
    await commitRepairersJson(updated, sha, `Add repairer: ${newRepairer.companyName}`);
  } catch (err) {
    context.error("Failed to save new repairer", err);
    return saveFailureResponse(err);
  }

  return { status: 201, jsonBody: newRepairer };
}

export async function updateRepairer(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isAuthorizedRepairerManager(request)) return FORBIDDEN;
  const id = request.params.id;
  const input = (await request.json()) as Partial<RepairerInput>;

  const { data: repairers, sha } = await getCurrentRepairers<Repairer[]>();
  const index = repairers.findIndex((r) => r.id === id);
  if (index === -1) {
    return { status: 404, jsonBody: { error: `No repairer with id "${id}"` } };
  }

  const existing = repairers[index];
  const postcodeProvided = Boolean(input.postcode?.trim());
  const coords = postcodeProvided ? await geocodeOrNull(input.postcode ?? null) : null;
  if (postcodeProvided && !coords) {
    context.warn(`Could not geocode postcode "${input.postcode}" for repairer ${id}`);
  }

  const merged: Repairer = {
    ...existing,
    ...input,
    id: existing.id,
    ...(postcodeProvided
      ? { lat: coords?.lat ?? null, lon: coords?.lon ?? null, geocoded: Boolean(coords) }
      : {}),
  };

  const updated = [...repairers];
  updated[index] = merged;
  try {
    await commitRepairersJson(updated, sha, `Update repairer: ${merged.companyName}`);
  } catch (err) {
    context.error("Failed to save updated repairer", err);
    return saveFailureResponse(err);
  }

  return { jsonBody: merged };
}

/**
 * Archives a repairer (or restores one), which is how a repairer is
 * "removed" from the network here -- see api/src/lib/archive.ts for why
 * this is not a delete. Archived repairers disappear from Search but stay
 * in the data file, and stay visible to the network owner in Manage
 * Repairers so a mistaken click is one click to undo.
 *
 * Same guard as the rest of this file: the repairer network owner only.
 * Unlike create, there is deliberately no writeback branch -- no Databricks
 * job should ever be able to remove a repairer from the network.
 */
export async function setRepairerArchived(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedRepairerManager(request)) return FORBIDDEN;

  const actorEmail = getClientPrincipal(request)?.userDetails?.toLowerCase();
  if (!actorEmail) return FORBIDDEN;

  const body = (await request.json()) as { archived?: unknown };
  if (typeof body.archived !== "boolean") {
    return { status: 400, jsonBody: { error: "archived must be true or false" } };
  }

  // Read live from GitHub, not the bundled copy, for the same reason every
  // other write here does: a full-array write built on a stale snapshot
  // would silently discard anyone else's change.
  const { data: repairers, sha } = await getCurrentRepairers<Repairer[]>();

  let result;
  try {
    result = applyArchive(repairers, request.params.id, body.archived, actorEmail);
  } catch (err) {
    if (err instanceof RepairerNotFoundError) {
      return { status: 404, jsonBody: { error: err.message } };
    }
    throw err;
  }

  const action = body.archived ? "Archive" : "Restore";
  try {
    await commitRepairersJson(
      result.next,
      sha,
      `${action} repairer: ${result.updated.companyName}`,
    );
  } catch (err) {
    context.error(`Failed to ${action.toLowerCase()} repairer`, err);
    return saveFailureResponse(err);
  }

  return { jsonBody: result.updated };
}

app.http("repairers-list", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "repairers",
  handler: listRepairers,
});

app.http("repairers-create", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "repairers",
  handler: createRepairer,
});

app.http("repairers-update", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "repairers/{id}",
  handler: updateRepairer,
});

app.http("repairers-archive", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "repairers/{id}/archive",
  handler: setRepairerArchived,
});
