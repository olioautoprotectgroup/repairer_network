import { randomUUID } from "node:crypto";
import { executeStatement } from "./databricksClient";
import type { PriceQuote, PriceSummary, TyreSpec, VarianceResult } from "./types";

const TABLE = "sandbox.oliver_oakes.tyre_price_lookup_log";

export interface LookupLogEntry {
  handlerEmail: string | null;
  vehicleReg?: string;
  spec: TyreSpec;
  claimedPriceGbp?: number;
  postcode?: string;
  quotes: PriceQuote[];
  summary: PriceSummary;
  variance: VarianceResult;
  source: "staff-lookup" | "precache-job";
}

/**
 * Append-only capture of every lookup and its returned prices -- this is
 * the future benchmark dataset for volume-pricing negotiations, per the
 * spec. Unbounded by design; callers should treat a failure here as
 * best-effort (log, don't throw) so it never blocks the user-facing
 * response.
 */
export async function appendLookupLog(entry: LookupLogEntry): Promise<void> {
  await executeStatement(
    `INSERT INTO ${TABLE}
       (lookup_id, requested_at, handler_email, vehicle_reg, size, load_index, speed_rating,
        season, run_flat, brand_query, claimed_price_gbp, postcode, quotes_json,
        cheapest_gbp, average_gbp, median_gbp, variance_flag, percent_vs_cheapest, source)
     VALUES
       (:lookupId, :requestedAt, :handlerEmail, :vehicleReg, :size, :loadIndex, :speedRating,
        :season, :runFlat, :brandQuery, :claimedPriceGbp, :postcode, :quotesJson,
        :cheapestGbp, :averageGbp, :medianGbp, :varianceFlag, :percentVsCheapest, :source)`,
    [
      { name: "lookupId", value: randomUUID() },
      { name: "requestedAt", value: new Date().toISOString(), type: "TIMESTAMP" },
      { name: "handlerEmail", value: entry.handlerEmail },
      { name: "vehicleReg", value: entry.vehicleReg ?? null },
      { name: "size", value: `${entry.spec.width}/${entry.spec.profile}R${entry.spec.rim}` },
      { name: "loadIndex", value: entry.spec.loadIndex ?? null },
      { name: "speedRating", value: entry.spec.speedRating ?? null },
      { name: "season", value: entry.spec.season },
      { name: "runFlat", value: entry.spec.runFlat, type: "BOOLEAN" },
      { name: "brandQuery", value: entry.spec.brand ?? null },
      { name: "claimedPriceGbp", value: entry.claimedPriceGbp ?? null, type: "DOUBLE" },
      { name: "postcode", value: entry.postcode ?? null },
      { name: "quotesJson", value: JSON.stringify(entry.quotes) },
      { name: "cheapestGbp", value: entry.summary.cheapestGbp, type: "DOUBLE" },
      { name: "averageGbp", value: entry.summary.averageGbp, type: "DOUBLE" },
      { name: "medianGbp", value: entry.summary.medianGbp, type: "DOUBLE" },
      { name: "varianceFlag", value: entry.variance.flag },
      { name: "percentVsCheapest", value: entry.variance.percentVsCheapest, type: "DOUBLE" },
      { name: "source", value: entry.source },
    ],
  );
}
