import type { ClaimTierFlag, PriceSummary, VarianceResult } from "../../lib/tyrePriceTypes";

interface Props {
  summary: PriceSummary;
  variance: VarianceResult;
  claimTierFlag: ClaimTierFlag;
}

function fmt(gbp: number | null): string {
  return gbp != null ? `£${gbp.toFixed(2)}` : "—";
}

export default function VarianceBanner({ summary, variance, claimTierFlag }: Props) {
  const needsReview = variance.flag === "review";

  return (
    <div
      className={`rounded-2xl border p-4 text-sm ${
        needsReview ? "border-highlight bg-highlight/5" : "border-slate-200 bg-white"
      }`}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          Cheapest: <span className="font-semibold text-slate-800">{fmt(summary.cheapestGbp)}</span>
        </div>
        <div>
          Average: <span className="font-semibold text-slate-800">{fmt(summary.averageGbp)}</span>
        </div>
        <div>
          Median: <span className="font-semibold text-slate-800">{fmt(summary.medianGbp)}</span>
        </div>
        <div>
          Range:{" "}
          <span className="font-semibold text-slate-800">
            {summary.rangeGbp ? `${fmt(summary.rangeGbp.min)} – ${fmt(summary.rangeGbp.max)}` : "—"}
          </span>
        </div>
      </div>

      {variance.flag !== "not-applicable" && (
        <p className={`mt-2 font-medium ${needsReview ? "text-highlight" : "text-emerald-600"}`}>
          Claimed price is {variance.percentVsCheapest! >= 0 ? "+" : ""}
          {variance.percentVsCheapest!.toFixed(0)}% vs cheapest, {variance.percentVsAverage! >= 0 ? "+" : ""}
          {variance.percentVsAverage!.toFixed(0)}% vs average
          {needsReview ? ` — more than ${variance.thresholdPercent}% above market, review` : ""}
        </p>
      )}

      {claimTierFlag.mismatch && (
        <p className="mt-2 text-amber-700">
          Claim tier ({claimTierFlag.claimTier}) differs from the cheapest quote's tier ({claimTierFlag.cheapestTier}) --
          not a like-for-like comparison.
        </p>
      )}
    </div>
  );
}
