import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kwikfitAdapter } from "./kwikfit";
import type { RetailerAdapterInput } from "./types";

/**
 * Kwik Fit's listing page publishes no prices (verified against real
 * captured markup, 2026-09-02 -- 107 tyres, zero "£"). These tests lock in
 * that the adapter says so honestly and sends no pointless traffic, rather
 * than degrading to a confusing "no matching product found".
 */
const INPUT: RetailerAdapterInput = { size: "205/55R16", season: "summer", runFlat: false };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("kwikfitAdapter", () => {
  it("reports unavailable with the reason, never a fabricated price", async () => {
    const result = await kwikfitAdapter.fetchPrice(INPUT);
    expect(result.status).toBe("unavailable");
    expect(result.priceGbp).toBeNull();
    expect(result.statusDetail).toMatch(/does not publish prices/i);
  });

  it("makes no HTTP request to a page that cannot answer the question", async () => {
    await kwikfitAdapter.fetchPrice(INPUT);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
