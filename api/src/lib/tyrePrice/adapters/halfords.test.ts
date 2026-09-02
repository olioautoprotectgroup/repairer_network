import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../robotsCheck", () => ({ isPathAllowed: vi.fn().mockResolvedValue(true) }));
vi.mock("../rateLimiter", () => ({ waitForRateLimit: vi.fn().mockResolvedValue(undefined) }));

import { halfordsAdapter } from "./halfords";
import type { RetailerAdapterInput } from "./types";

/**
 * Runs against REAL captured Halfords markup (205/55 R16, 2026-09-02),
 * trimmed to the 18 product tiles. Expected values below are the actual
 * prices and brands from that page, so a site redesign shows up as a
 * deliberate fixture update rather than silently in production.
 */
const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "halfords-search-result.html"), "utf-8");

const INPUT: RetailerAdapterInput = { size: "205/55R16", season: "summer", runFlat: false };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("halfordsAdapter against real captured markup", () => {
  it("picks the cheapest tyre on the page when no brand is requested", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("ok");
    // Cheapest of the 18 real tiles is Sailun at £70.99.
    expect(result.priceGbp).toBe(70.99);
    expect(result.matchedBrand).toBe("Sailun");
  });

  it("recovers the brand from the product URL, since Halfords titles are model-only", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice({ ...INPUT, brand: "Goodyear" });
    expect(result.status).toBe("ok");
    expect(result.matchedBrand).toBe("Goodyear");
    // Cheapest Goodyear on the page is "EfficientGrip Performance" (£92.99),
    // whose title carries no brand -- so the adapter prepends it.
    expect(result.productName).toBe("Goodyear EfficientGrip Performance");
    expect(result.priceGbp).toBe(92.99);
    expect(result.url).toContain("/tyres/goodyear/");
  });

  it("honours a requested brand over cheaper alternatives", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice({ ...INPUT, brand: "Michelin" });
    expect(result.matchedBrand).toBe("Michelin");
    // Cheapest Michelin (Primacy 4+), not the £70.99 cheapest tyre overall.
    expect(result.priceGbp).toBe(108.99);
  });

  it("does not double-prefix a title that already contains its brand", async () => {
    // Real data is inconsistent: "Atrezzo ZSR" omits the brand while
    // "Hankook Kinergy Eco 2 K435" includes it. Prefixing blindly would
    // produce "Hankook Hankook Kinergy...".
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice({ ...INPUT, brand: "Hankook" });
    expect(result.productName).toBe("Hankook Kinergy Eco 2 K435");
    expect(result.priceGbp).toBe(71.99);
  });

  it("parses the price out of the container's 'From £x' text", async () => {
    // The inner price-value span holds a bare "97.99" with the £ in a sibling,
    // so the adapter must read the container, not the value.
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    const result = await halfordsAdapter.fetchPrice({ ...INPUT, brand: "Pirelli" });
    expect(result.priceGbp).toBeGreaterThan(0);
    expect(Number.isFinite(result.priceGbp as number)).toBe(true);
  });

  it("requests the canonical size path", async () => {
    fetchMock.mockResolvedValue(new Response(FIXTURE, { status: 200 }));
    await halfordsAdapter.fetchPrice(INPUT);
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.halfords.com/tyres/205-55-r16/");
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

  it("respects a robots.txt disallow without fetching", async () => {
    const { isPathAllowed } = await import("../robotsCheck");
    vi.mocked(isPathAllowed).mockResolvedValueOnce(false);
    const result = await halfordsAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("unavailable");
    expect(result.statusDetail).toMatch(/robots/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
