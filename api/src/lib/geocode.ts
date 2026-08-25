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
