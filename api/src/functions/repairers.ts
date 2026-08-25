import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadRepairers } from "../lib/data";
import { getCurrentRepairers, commitRepairersJson } from "../lib/github";
import { geocodePostcode } from "../lib/geocode";
import { uniqueSlug } from "../lib/slug";
import { isAuthorizedStaff, isAuthorizedWriteback } from "../lib/auth";
import type { Repairer } from "../lib/types";

const FORBIDDEN: HttpResponseInit = {
  status: 403,
  jsonBody: { error: "Access restricted to AutoProtect Group staff" },
};

type RepairerInput = Omit<
  Repairer,
  "id" | "lat" | "lon" | "geocoded" | "recentRepairCount" | "repairCountAsOf"
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
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  return { jsonBody: loadRepairers() };
}

export async function createRepairer(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Accepts either a signed-in AAD staff member (Manage Repairers form) or
  // the Databricks new-repairer intake-merge job (shared-secret writeback
  // auth) -- both go through the same geocoding/slug/sha-safe commit logic.
  if (!isAuthorizedStaff(request) && !isAuthorizedWriteback(request)) return FORBIDDEN;
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
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
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
