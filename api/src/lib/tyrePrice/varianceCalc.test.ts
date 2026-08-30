import { describe, expect, it } from "vitest";
import type { PriceQuote } from "./types";
import { computeClaimTierFlag, computeSummary, computeVariance, groupByTier } from "./varianceCalc";

function quote(overrides: Partial<PriceQuote>): PriceQuote {
  return {
    retailer: "Test",
    productName: "Test Tyre",
    size: "205/55R16",
    load: null,
    speed: null,
    brand: null,
    tier: "unknown",
    priceGbp: 100,
    url: null,
    fetchedAt: new Date().toISOString(),
    status: "ok",
    ...overrides,
  };
}

describe("computeSummary", () => {
  it("computes cheapest/average/median/range from ok quotes only", () => {
    const quotes = [
      quote({ retailer: "A", priceGbp: 100 }),
      quote({ retailer: "B", priceGbp: 80 }),
      quote({ retailer: "C", priceGbp: 60 }),
      quote({ retailer: "D", status: "unavailable", priceGbp: null }),
    ];
    const summary = computeSummary(quotes);
    expect(summary.cheapestGbp).toBe(60);
    expect(summary.averageGbp).toBeCloseTo(80);
    expect(summary.medianGbp).toBe(80);
    expect(summary.rangeGbp).toEqual({ min: 60, max: 100 });
    expect(summary.quoteCountUsed).toBe(3);
  });

  it("returns nulls when nothing is usable", () => {
    const summary = computeSummary([quote({ status: "unavailable", priceGbp: null })]);
    expect(summary.cheapestGbp).toBeNull();
    expect(summary.quoteCountUsed).toBe(0);
  });

  it("computes median correctly for an even count", () => {
    const summary = computeSummary([
      quote({ priceGbp: 100 }),
      quote({ priceGbp: 80 }),
      quote({ priceGbp: 60 }),
      quote({ priceGbp: 40 }),
    ]);
    expect(summary.medianGbp).toBe(70);
  });
});

describe("computeVariance", () => {
  it("flags 'not-applicable' when no claimed price is given", () => {
    const summary = computeSummary([quote({ priceGbp: 100 })]);
    const variance = computeVariance(undefined, summary);
    expect(variance.flag).toBe("not-applicable");
  });

  it("flags 'not-applicable' when there's no usable market data", () => {
    const summary = computeSummary([]);
    const variance = computeVariance(150, summary);
    expect(variance.flag).toBe("not-applicable");
  });

  it("flags 'review' when more than the threshold above cheapest", () => {
    const summary = computeSummary([quote({ priceGbp: 100 })]);
    const variance = computeVariance(130, summary, 20);
    expect(variance.percentVsCheapest).toBeCloseTo(30);
    expect(variance.flag).toBe("review");
  });

  it("is exactly at the threshold boundary -> ok, not review", () => {
    const summary = computeSummary([quote({ priceGbp: 100 })]);
    const variance = computeVariance(120, summary, 20);
    expect(variance.percentVsCheapest).toBeCloseTo(20);
    expect(variance.flag).toBe("ok");
  });

  it("flags 'ok' when at or below market", () => {
    const summary = computeSummary([quote({ priceGbp: 100 })]);
    const variance = computeVariance(90, summary, 20);
    expect(variance.flag).toBe("ok");
  });
});

describe("computeClaimTierFlag", () => {
  it("flags a mismatch between claim brand tier and cheapest quote's tier", () => {
    const quotes = [
      quote({ retailer: "A", priceGbp: 60, tier: "budget" }),
      quote({ retailer: "B", priceGbp: 100, tier: "premium" }),
    ];
    const flag = computeClaimTierFlag("Michelin", quotes);
    expect(flag.claimTier).toBe("premium");
    expect(flag.cheapestTier).toBe("budget");
    expect(flag.mismatch).toBe(true);
  });

  it("does not flag a mismatch when brands are unknown", () => {
    const flag = computeClaimTierFlag(undefined, [quote({ priceGbp: 60, tier: "unknown" })]);
    expect(flag.mismatch).toBe(false);
  });
});

describe("groupByTier", () => {
  it("groups usable quotes by tier and omits empty tiers", () => {
    const groups = groupByTier([
      quote({ retailer: "A", priceGbp: 60, tier: "budget" }),
      quote({ retailer: "B", priceGbp: 100, tier: "premium" }),
      quote({ retailer: "C", status: "disabled", priceGbp: null, tier: "unknown" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.tier === "budget")?.cheapestGbp).toBe(60);
  });
});
