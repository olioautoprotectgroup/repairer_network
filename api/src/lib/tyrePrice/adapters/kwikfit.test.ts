import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../robotsCheck", () => ({ isPathAllowed: vi.fn().mockResolvedValue(true) }));
vi.mock("../rateLimiter", () => ({ waitForRateLimit: vi.fn().mockResolvedValue(undefined) }));

import { kwikfitAdapter } from "./kwikfit";
import type { RetailerAdapterInput } from "./types";

const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "kwikfit-search-result.html"), "utf-8");

const INPUT: RetailerAdapterInput = { size: "205/55R16", season: "summer", runFlat: false };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("kwikfitAdapter", () => {
  it("picks the cheapest product when no brand is requested", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await kwikfitAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("ok");
    expect(result.priceGbp).toBe(54.99);
    expect(result.matchedBrand).toBe("Landsail");
  });

  it("respects robots.txt disallow", async () => {
    const { isPathAllowed } = await import("../robotsCheck");
    vi.mocked(isPathAllowed).mockResolvedValueOnce(false);
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await kwikfitAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("unavailable");
    expect(result.statusDetail).toMatch(/robots/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 'unavailable' on a rate-limited (429) response", async () => {
    fetchMock.mockResolvedValue(new Response("too many requests", { status: 429 }));
    const result = await kwikfitAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("unavailable");
  });
});
