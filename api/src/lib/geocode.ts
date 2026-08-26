export interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Looks up a single UK postcode via the free postcodes.io API. Returns null
 * if not found. Falls back to the terminated-postcodes endpoint when the
 * live lookup 404s: a postcode can be genuinely real-world-valid (and
 * resolvable by Google's broader dataset) while being marked
 * terminated/retired in the ONS Postcode Directory that the live endpoint
 * checks against (e.g. after an address reorganisation), which otherwise
 * makes a legitimate postcode look unrecognised.
 */
export async function geocodePostcode(postcode: string): Promise<Coordinates | null> {
  const encoded = encodeURIComponent(postcode.trim());

  const res = await fetch(`https://api.postcodes.io/postcodes/${encoded}`);
  if (res.ok) {
    const json = (await res.json()) as { result: { latitude: number; longitude: number } };
    return { lat: json.result.latitude, lon: json.result.longitude };
  }
  if (res.status !== 404) {
    throw new Error(`postcodes.io lookup failed with status ${res.status}`);
  }

  const terminatedRes = await fetch(`https://api.postcodes.io/terminated_postcodes/${encoded}`);
  if (terminatedRes.status === 404) return null;
  if (!terminatedRes.ok) {
    throw new Error(`postcodes.io terminated-postcode lookup failed with status ${terminatedRes.status}`);
  }
  const terminatedJson = (await terminatedRes.json()) as {
    result: { longitude: number; latitude: number };
  };
  return { lat: terminatedJson.result.latitude, lon: terminatedJson.result.longitude };
}

/**
 * Free-text place lookup (town, street, city -- anything that isn't a
 * postcode or a repairer name) via Nominatim, the free OpenStreetMap
 * geocoder -- no API key, consistent with the OSM-based MapLibre/
 * OpenFreeMap map already used here. Restricted to GB results since every
 * repairer is UK-based and place names collide internationally (e.g.
 * "Cambridge"). Nominatim's usage policy requires a real identifying
 * User-Agent (not optional) and asks for roughly 1 request/second, which
 * this tool's real traffic is nowhere near.
 */
export async function geocodePlace(query: string): Promise<Coordinates | null> {
  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "1",
    countrycodes: "gb",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "User-Agent": "AutoProtect-RepairerNetwork/1.0 (internal tool; contact: oliver.oakes@autoprotectgroup.co.uk)",
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim lookup failed with status ${res.status}`);
  }
  const results = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (results.length === 0) return null;
  return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
}
