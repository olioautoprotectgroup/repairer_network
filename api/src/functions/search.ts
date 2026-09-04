import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadRepairers } from "../lib/data";
import { geocodePostcode, geocodePlace, Coordinates } from "../lib/geocode";
import { haversineMiles } from "../lib/distance";
import { isAuthorizedStaff } from "../lib/auth";
import { isActive } from "../lib/archive";
import type { Repairer, SearchResult } from "../lib/types";

/**
 * Resolves the unified search box to a point to search from, trying the
 * cheapest/most-certain interpretation first:
 *  1. Postcode (postcodes.io already 404s cleanly for anything else, so no
 *     separate "does this look like a postcode" check is needed).
 *  2. A repairer's own company name -- lets a handler search "from" a
 *     known repairer. Only ACTIVE repairers are offered: an archived one
 *     working as a search origin while being absent from the results would
 *     be baffling, and with duplicated company names in the live data the
 *     id tie-break below would silently hand the origin to a different
 *     business at a different postcode. More than one substring match (a few company names
 *     really are duplicated in the live data) picks the first
 *     deterministically rather than introducing a distinct response shape
 *     for "no single origin" -- a rare-edge-case simplification.
 *  3. A free-text place name (town/street/city) via Nominatim.
 */
async function resolveSearchPoint(
  query: string,
  repairers: Repairer[],
): Promise<{ point: Coordinates; label: string } | null> {
  const postcodePoint = await geocodePostcode(query);
  if (postcodePoint) return { point: postcodePoint, label: query };

  const q = query.trim().toLowerCase();
  const businessMatch = repairers
    .filter((r) => r.companyName.toLowerCase().includes(q) && r.lat != null && r.lon != null)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (businessMatch) {
    return { point: { lat: businessMatch.lat!, lon: businessMatch.lon! }, label: businessMatch.companyName };
  }

  const placePoint = await geocodePlace(query);
  if (placePoint) return { point: placePoint, label: query };

  return null;
}

export async function search(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) {
    return { status: 403, jsonBody: { error: "Access restricted to AutoProtect Group staff" } };
  }

  const q = request.query.get("q");
  if (!q?.trim()) {
    return { status: 400, jsonBody: { error: "q query parameter is required" } };
  }

  // Archived repairers are out of the network: they must not appear in
  // results, and must not be usable as a search origin either.
  const allRepairers = loadRepairers().filter(isActive);

  let resolved;
  try {
    resolved = await resolveSearchPoint(q, allRepairers);
  } catch (err) {
    context.error("Search resolution failed", err);
    return { status: 502, jsonBody: { error: "Could not resolve that search right now" } };
  }
  if (!resolved) {
    return { status: 404, jsonBody: { error: `Couldn't find a location or repairer matching "${q}"` } };
  }
  const { point: searchPoint, label: resolvedLabel } = resolved;

  const make = request.query.get("make");
  const capability = request.query.get("capability");
  const recoveryOnly = request.query.get("recoveryOnly") === "true";
  const maxLabourRateRaw = request.query.get("maxLabourRate");
  const maxLabourRate = maxLabourRateRaw ? Number(maxLabourRateRaw) : null;

  const results: SearchResult[] = allRepairers
    .filter((r) => r.geocoded && r.lat != null && r.lon != null)
    .filter((r) => !make || r.vehicleManufacturers.some((m) => m.toLowerCase() === make.toLowerCase()))
    .filter(
      (r) => !capability || r.capabilities.some((c) => c.toLowerCase() === capability.toLowerCase()),
    )
    .filter((r) => !recoveryOnly || r.providesRecovery)
    .filter((r) => !maxLabourRate || (r.labourRate != null && r.labourRate <= maxLabourRate))
    .map((r) => ({
      ...r,
      distanceMiles: haversineMiles(searchPoint, { lat: r.lat!, lon: r.lon! }),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return { jsonBody: { searchPoint, resolvedLabel, results } };
}

app.http("search", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "search",
  handler: search,
});
