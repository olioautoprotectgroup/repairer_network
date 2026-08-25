import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadRepairers } from "../lib/data";
import { geocodePostcode } from "../lib/geocode";
import { haversineMiles } from "../lib/distance";
import type { SearchResult } from "../lib/types";

export async function search(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const postcode = request.query.get("postcode");
  if (!postcode) {
    return { status: 400, jsonBody: { error: "postcode query parameter is required" } };
  }

  let searchPoint;
  try {
    searchPoint = await geocodePostcode(postcode);
  } catch (err) {
    context.error("Geocoding failed", err);
    return { status: 502, jsonBody: { error: "Could not look up that postcode right now" } };
  }
  if (!searchPoint) {
    return { status: 404, jsonBody: { error: `Postcode "${postcode}" was not recognised` } };
  }

  const make = request.query.get("make");
  const capability = request.query.get("capability");
  const recoveryOnly = request.query.get("recoveryOnly") === "true";

  const repairers = loadRepairers().filter((r) => r.geocoded && r.lat != null && r.lon != null);

  const results: SearchResult[] = repairers
    .filter((r) => !make || r.vehicleManufacturers.some((m) => m.toLowerCase() === make.toLowerCase()))
    .filter(
      (r) => !capability || r.capabilities.some((c) => c.toLowerCase() === capability.toLowerCase()),
    )
    .filter((r) => !recoveryOnly || r.providesRecovery)
    .map((r) => ({
      ...r,
      distanceMiles: haversineMiles(searchPoint!, { lat: r.lat!, lon: r.lon! }),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return { jsonBody: { searchPoint, results } };
}

app.http("search", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "search",
  handler: search,
});
