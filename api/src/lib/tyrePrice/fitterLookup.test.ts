import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../geocode", () => ({ geocodePostcode: vi.fn() }));

import { findNearbyFitters } from "./fitterLookup";
import { geocodePostcode } from "../geocode";

const geocodePostcodeMock = vi.mocked(geocodePostcode);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  geocodePostcodeMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("findNearbyFitters", () => {
  it("returns [] when the postcode can't be geocoded", async () => {
    geocodePostcodeMock.mockResolvedValue(null);
    const result = await findNearbyFitters("XX1 1XX");
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Overpass elements to sorted NearbyFitter results", async () => {
    geocodePostcodeMock.mockResolvedValue({ lat: 51.5, lon: -0.1 });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [
            {
              type: "node",
              lat: 51.51,
              lon: -0.11,
              tags: { name: "Far Tyres", shop: "tyres" },
            },
            {
              type: "way",
              center: { lat: 51.501, lon: -0.101 },
              tags: { name: "Near Garage", shop: "car_repair", "addr:housenumber": "1", "addr:street": "High St" },
            },
            { type: "node", lat: 51.5, lon: -0.1, tags: {} }, // no name -- excluded
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await findNearbyFitters("SW1A 1AA");
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Near Garage");
    expect(results[0].amenityType).toBe("Car repair");
    expect(results[0].address).toBe("1 High St");
    expect(results[1].name).toBe("Far Tyres");
    expect(results[1].amenityType).toBe("Tyre fitter");
    expect(results[0].distanceMiles).toBeLessThan(results[1].distanceMiles);
  });

  it("throws on an Overpass failure (caller degrades gracefully)", async () => {
    geocodePostcodeMock.mockResolvedValue({ lat: 51.5, lon: -0.1 });
    fetchMock.mockResolvedValue(new Response("error", { status: 500 }));
    await expect(findNearbyFitters("SW1A 1AA")).rejects.toThrow("Overpass lookup failed");
  });
});
