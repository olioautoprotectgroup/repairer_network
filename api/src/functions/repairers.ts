import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadRepairers, saveRepairers } from "../lib/data";
import { geocodePostcode } from "../lib/geocode";
import { uniqueSlug } from "../lib/slug";
import type { Repairer } from "../lib/types";

type RepairerInput = Omit<Repairer, "id" | "lat" | "lon" | "geocoded">;

async function geocodeOrNull(postcode: string | null) {
  if (!postcode) return null;
  try {
    return await geocodePostcode(postcode);
  } catch {
    return null;
  }
}

export async function listRepairers(): Promise<HttpResponseInit> {
  return { jsonBody: loadRepairers() };
}

export async function createRepairer(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const input = (await request.json()) as RepairerInput;
  if (!input.companyName?.trim()) {
    return { status: 400, jsonBody: { error: "companyName is required" } };
  }

  const repairers = loadRepairers();
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
  };

  const updated = [...repairers, newRepairer];
  await saveRepairers(updated, `Add repairer: ${newRepairer.companyName}`);

  return { status: 201, jsonBody: newRepairer };
}

export async function updateRepairer(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const id = request.params.id;
  const input = (await request.json()) as Partial<RepairerInput>;

  const repairers = loadRepairers();
  const index = repairers.findIndex((r) => r.id === id);
  if (index === -1) {
    return { status: 404, jsonBody: { error: `No repairer with id "${id}"` } };
  }

  const existing = repairers[index];
  const postcodeChanged = input.postcode !== undefined && input.postcode !== existing.postcode;
  const coords = postcodeChanged ? await geocodeOrNull(input.postcode ?? null) : null;
  if (postcodeChanged && input.postcode && !coords) {
    context.warn(`Could not geocode postcode "${input.postcode}" for repairer ${id}`);
  }

  const merged: Repairer = {
    ...existing,
    ...input,
    id: existing.id,
    ...(postcodeChanged
      ? { lat: coords?.lat ?? null, lon: coords?.lon ?? null, geocoded: Boolean(coords) }
      : {}),
  };

  const updated = [...repairers];
  updated[index] = merged;
  await saveRepairers(updated, `Update repairer: ${merged.companyName}`);

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
