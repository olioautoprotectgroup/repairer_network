import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TyreSpec } from "./types";

vi.mock("./databricksClient", () => ({
  executeStatement: vi.fn(),
  rowsToObjects: vi.fn((result: { columns: string[]; rows: unknown[][] }) =>
    result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))),
  ),
  DatabricksColdStartTimeoutError: class DatabricksColdStartTimeoutError extends Error {},
}));

import { buildCacheKey, getCachedQuote, writeCachedQuote } from "./cache";
import { DatabricksColdStartTimeoutError, executeStatement } from "./databricksClient";

const executeStatementMock = vi.mocked(executeStatement);

const SPEC: TyreSpec = { width: 205, profile: 55, rim: 16, season: "summer", runFlat: false };

beforeEach(() => {
  executeStatementMock.mockReset();
});

describe("buildCacheKey", () => {
  it("includes size/season/runflat/brand, defaulting brand to 'any'", () => {
    expect(buildCacheKey("halfords", SPEC)).toBe("halfords|205/55R16|-|-|summer|std|any");
  });

  it("normalizes brand casing", () => {
    expect(buildCacheKey("halfords", { ...SPEC, brand: "Michelin" })).toContain("michelin");
  });

  it("distinguishes run-flat", () => {
    expect(buildCacheKey("halfords", { ...SPEC, runFlat: true })).toContain("|rf|");
  });
});

describe("getCachedQuote", () => {
  it("returns null when no rows match", async () => {
    executeStatementMock.mockResolvedValue({ columns: [], rows: [] });
    const result = await getCachedQuote("halfords", SPEC);
    expect(result).toBeNull();
  });

  it("maps a matching row to a PriceQuote", async () => {
    executeStatementMock.mockResolvedValue({
      columns: [
        "retailer", "product_name", "size", "load_index", "speed_rating",
        "matched_brand", "tier", "price_gbp", "url", "status", "status_detail", "fetched_at",
      ],
      rows: [["Halfords", "Some Tyre", "205/55R16", null, null, "Continental", "premium", 89.99, "https://x", "ok", null, "2026-01-01T00:00:00.000Z"]],
    });
    const result = await getCachedQuote("halfords", SPEC);
    expect(result).toEqual({
      retailer: "Halfords",
      productName: "Some Tyre",
      size: "205/55R16",
      load: null,
      speed: null,
      brand: "Continental",
      tier: "premium",
      priceGbp: 89.99,
      url: "https://x",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
      statusDetail: undefined,
    });
  });

  it("treats a cold-start timeout as a soft miss (null), not an error", async () => {
    executeStatementMock.mockRejectedValue(new DatabricksColdStartTimeoutError("stmt-1"));
    const result = await getCachedQuote("halfords", SPEC);
    expect(result).toBeNull();
  });

  it("rethrows any other error", async () => {
    executeStatementMock.mockRejectedValue(new Error("boom"));
    await expect(getCachedQuote("halfords", SPEC)).rejects.toThrow("boom");
  });
});

describe("writeCachedQuote", () => {
  it("issues a MERGE statement keyed on cache_key", async () => {
    executeStatementMock.mockResolvedValue({ columns: [], rows: [] });
    await writeCachedQuote("halfords", SPEC, {
      retailer: "Halfords",
      productName: "Some Tyre",
      size: "205/55R16",
      load: null,
      speed: null,
      brand: "Continental",
      tier: "premium",
      priceGbp: 89.99,
      url: "https://x",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
    });

    expect(executeStatementMock).toHaveBeenCalledTimes(1);
    const [sql, params] = executeStatementMock.mock.calls[0];
    expect(sql).toMatch(/MERGE INTO/);
    expect(params?.find((p) => p.name === "cacheKey")?.value).toBe("halfords|205/55R16|-|-|summer|std|any");
    expect(params?.find((p) => p.name === "priceGbp")?.value).toBe(89.99);
  });
});
