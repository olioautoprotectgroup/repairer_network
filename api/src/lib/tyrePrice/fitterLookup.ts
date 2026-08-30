import { haversineMiles } from "../distance";
import { geocodePostcode } from "../geocode";
import type { NearbyFitter } from "./types";

/**
 * Free OSM-based nearby-fitter lookup (Overpass API, no key), reusing the
 * app's existing postcode geocoding and distance-sorting logic -- chosen
 * over Google Places to keep this feature on the app's established
 * free-service pattern. Throws on a genuine Overpass failure; callers
 * should catch and degrade to {status: "unavailable", results: []} rather
 * than fail the whole tyre-price response, since this is a secondary
 * enrichment, not the core lookup.
 */
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_RADIUS_MILES = 5;
const MILES_TO_METERS = 1609.34;
const USER_AGENT = "AutoProtect-TyrePriceCheck/1.0 (internal claims tool; contact: oliver.oakes@autoprotectgroup.co.uk)";

interface OverpassElement {
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function elementCoords(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  return null;
}

function buildAddress(tags: Record<string, string> = {}): string | null {
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:postcode"]].filter(
    Boolean,
  );
  return parts.length ? parts.join(" ") : null;
}

function buildMapsUrl(name: string, address: string | null, lat: number, lon: number): string {
  const query = address ? `${name}, ${address}` : `${name} (${lat}, ${lon})`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export async function findNearbyFitters(postcode: string, radiusMiles = DEFAULT_RADIUS_MILES): Promise<NearbyFitter[]> {
  const origin = await geocodePostcode(postcode);
  if (!origin) return [];

  const radiusMeters = Math.round(radiusMiles * MILES_TO_METERS);
  const query =
    `[out:json][timeout:15];` +
    `(node["shop"="tyres"](around:${radiusMeters},${origin.lat},${origin.lon});` +
    `way["shop"="tyres"](around:${radiusMeters},${origin.lat},${origin.lon});` +
    `node["shop"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lon});` +
    `way["shop"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lon}););` +
    `out center tags;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass lookup failed with status ${res.status}`);

  const json = (await res.json()) as { elements: OverpassElement[] };

  const fitters: NearbyFitter[] = [];
  for (const el of json.elements) {
    const coords = elementCoords(el);
    const name = el.tags?.name;
    if (!coords || !name) continue;
    const address = buildAddress(el.tags);
    fitters.push({
      name,
      distanceMiles: haversineMiles(origin, coords),
      lat: coords.lat,
      lon: coords.lon,
      address,
      amenityType: el.tags?.shop === "tyres" ? "Tyre fitter" : "Car repair",
      mapsUrl: buildMapsUrl(name, address, coords.lat, coords.lon),
    });
  }

  return fitters.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 15);
}
