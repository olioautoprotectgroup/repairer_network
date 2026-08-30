import { tierForBrand } from "./tierMap";
import type { ClaimTierFlag, PriceQuote, PriceSummary, VarianceResult } from "./types";

export const DEFAULT_VARIANCE_THRESHOLD_PERCENT = 20;

function usableQuotes(quotes: PriceQuote[]): PriceQuote[] {
  return quotes.filter((q) => q.status === "ok" && q.priceGbp != null);
}

/**
 * Cheapest/average/median/range across sources that actually returned a
 * price -- unavailable/disabled/no-match sources never contribute a number,
 * per the "never fabricate a price" requirement.
 */
export function computeSummary(quotes: PriceQuote[]): PriceSummary {
  const prices = usableQuotes(quotes)
    .map((q) => q.priceGbp as number)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return { cheapestGbp: null, averageGbp: null, medianGbp: null, rangeGbp: null, quoteCountUsed: 0 };
  }

  const sum = prices.reduce((a, b) => a + b, 0);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return {
    cheapestGbp: prices[0],
    averageGbp: sum / prices.length,
    medianGbp: median,
    rangeGbp: { min: prices[0], max: prices[prices.length - 1] },
    quoteCountUsed: prices.length,
  };
}

/**
 * % variance of the claimed price vs market cheapest/average. No claimed
 * price, or no usable market data to compare against -> "not-applicable",
 * not a misleading 0%/false "ok".
 */
export function computeVariance(
  claimedPriceGbp: number | null | undefined,
  summary: PriceSummary,
  thresholdPercent: number = DEFAULT_VARIANCE_THRESHOLD_PERCENT,
): VarianceResult {
  if (claimedPriceGbp == null || summary.cheapestGbp == null || summary.averageGbp == null) {
    return {
      claimedPriceGbp: claimedPriceGbp ?? null,
      percentVsCheapest: null,
      percentVsAverage: null,
      flag: "not-applicable",
      thresholdPercent,
    };
  }

  const percentVsCheapest = ((claimedPriceGbp - summary.cheapestGbp) / summary.cheapestGbp) * 100;
  const percentVsAverage = ((claimedPriceGbp - summary.averageGbp) / summary.averageGbp) * 100;

  return {
    claimedPriceGbp,
    percentVsCheapest,
    percentVsAverage,
    flag: percentVsCheapest > thresholdPercent ? "review" : "ok",
    thresholdPercent,
  };
}

/**
 * Flags when the claim's own tyre brand sits in a different tier than the
 * cheapest quote shown -- a handler comparing a premium-brand claim against
 * a budget-brand cheapest price is not a like-for-like comparison.
 */
export function computeClaimTierFlag(claimedBrand: string | undefined, quotes: PriceQuote[]): ClaimTierFlag {
  const claimTier = tierForBrand(claimedBrand);
  const usable = usableQuotes(quotes).sort((a, b) => (a.priceGbp as number) - (b.priceGbp as number));
  const cheapestTier = usable[0]?.tier ?? "unknown";

  return {
    claimTier,
    cheapestTier,
    mismatch: claimTier !== "unknown" && cheapestTier !== "unknown" && claimTier !== cheapestTier,
  };
}

export function groupByTier(quotes: PriceQuote[]) {
  const usable = usableQuotes(quotes);
  const tiers: Array<PriceQuote["tier"]> = ["premium", "mid", "budget", "unknown"];
  return tiers
    .map((tier) => {
      const inTier = usable.filter((q) => q.tier === tier);
      const cheapest = inTier.length ? Math.min(...(inTier.map((q) => q.priceGbp as number))) : null;
      return { tier, quoteCount: inTier.length, cheapestGbp: cheapest };
    })
    .filter((g) => g.quoteCount > 0);
}
