export interface Coordinates {
  lat: number;
  lon: number;
}

/** Looks up a single UK postcode via the free postcodes.io API. Returns null if not found. */
export async function geocodePostcode(postcode: string): Promise<Coordinates | null> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`postcodes.io lookup failed with status ${res.status}`);
  }
  const json = (await res.json()) as { result: { latitude: number; longitude: number } };
  return { lat: json.result.latitude, lon: json.result.longitude };
}
