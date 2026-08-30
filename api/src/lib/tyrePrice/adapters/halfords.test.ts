import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../robotsCheck", () => ({ isPathAllowed: vi.fn().mockResolvedValue(true) }));
vi.mock("../rateLimiter", () => ({ waitForRateLimit: vi.fn().mockResolvedValue(undefined) }));

import { halfordsAdapter } from "./halfords";
import type { RetailerAdapterInput } from "./types";

const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "halfords-search-result.html"), "utf-8");

const INPUT: RetailerAdapterInput = { size: "205/55R16", season: "summer", runFlat: false };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("halfordsAdapter", () => {
  it("picks the cheapest product when no brand is requested", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("ok");
    expect(result.priceGbp).toBe(58.0);
    expect(result.matchedBrand).toBe("Nexen");
  });

  it("prefers a requested brand over the overall cheapest", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice({ ...INPUT, brand: "Continental" });
    expect(result.status).toBe("ok");
    expect(result.priceGbp).toBe(104.99);
    expect(result.matchedBrand).toBe("Continental");
  });

  it("returns 'unavailable' on a blocked (403) response, without retrying", async () => {
    fetchMock.mockResolvedValue(new Response("blocked", { status: 403 }));
    const result = await halfordsAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 'unavailable' on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const result = await halfordsAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("unavailable");
    expect(result.statusDetail).toContain("network down");
  });

  it("returns 'no-match' when the listing has no priced products", async () => {
    fetchMock.mockResolvedValue(new Response("<html><body></body></html>", { status: 200 }));
    const result = await halfordsAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("no-match");
  });
});
