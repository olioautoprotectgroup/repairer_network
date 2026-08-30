import type { RetailerKey } from "./config";
import { cacheTtlHours } from "./config";
import { DatabricksColdStartTimeoutError, executeStatement, rowsToObjects } from "./databricksClient";
import type { PriceQuote, TyreSpec } from "./types";

const TABLE = "sandbox.oliver_oakes.tyre_price_cache";

export function normalizedSize(spec: TyreSpec): string {
  return `${spec.width}/${spec.profile}R${spec.rim}`;
}

export function buildCacheKey(retailer: RetailerKey, spec: TyreSpec): string {
  const brandPart = spec.brand ? spec.brand.trim().toLowerCase() : "any";
  return [
    retailer,
    normalizedSize(spec),
    spec.loadIndex ?? "-",
    spec.speedRating ?? "-",
    spec.season,
    spec.runFlat ? "rf" : "std",
    brandPart,
  ].join("|");
}

/**
 * Cache read. A cold-start timeout on the Databricks warehouse is treated
 * as a soft cache-miss (proceed to live scrape), not a hard failure --
 * graceful degradation extends to the cache layer itself, matching the
 * spec's "never fail the whole lookup" requirement.
 */
export async function getCachedQuote(retailer: RetailerKey, spec: TyreSpec): Promise<PriceQuote | null> {
  const cacheKey = buildCacheKey(retailer, spec);
  const staleBefore = new Date(Date.now() - cacheTtlHours() * 3600 * 1000).toISOString();

  try {
    const result = await executeStatement(
      `SELECT retailer, product_name, size, load_index, speed_rating, matched_brand, tier,
              price_gbp, url, status, status_detail, fetched_at
       FROM ${TABLE}
       WHERE cache_key = :cacheKey AND fetched_at >= :staleBefore
       ORDER BY fetched_at DESC
       LIMIT 1`,
      [
        { name: "cacheKey", value: cacheKey },
        { name: "staleBefore", value: staleBefore, type: "TIMESTAMP" },
      ],
    );
    const rows = rowsToObjects(result);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      retailer: row.retailer as string,
      productName: (row.product_name as string | null) ?? null,
      size: row.size as string,
      load: (row.load_index as string | null) ?? null,
      speed: (row.speed_rating as string | null) ?? null,
      brand: (row.matched_brand as string | null) ?? null,
      tier: (row.tier as PriceQuote["tier"] | null) ?? "unknown",
      priceGbp: row.price_gbp != null ? Number(row.price_gbp) : null,
      url: (row.url as string | null) ?? null,
      fetchedAt: row.fetched_at as string,
      status: row.status as PriceQuote["status"],
      statusDetail: (row.status_detail as string | undefined) ?? undefined,
    };
  } catch (err) {
    if (err instanceof DatabricksColdStartTimeoutError) return null;
    throw err;
  }
}

/**
 * Cache write, best-effort -- callers should catch/log rather than let a
 * write failure fail the user-facing response. Idempotent MERGE on
 * cache_key, so row count stays bounded to distinct spec combinations
 * rather than growing per-lookup.
 */
export async function writeCachedQuote(retailer: RetailerKey, spec: TyreSpec, quote: PriceQuote): Promise<void> {
  const cacheKey = buildCacheKey(retailer, spec);
  const now = new Date().toISOString();

  await executeStatement(
    `MERGE INTO ${TABLE} AS t
     USING (SELECT :cacheKey AS cache_key) AS s
     ON t.cache_key = s.cache_key
     WHEN MATCHED THEN UPDATE SET
       product_name = :productName, matched_brand = :brand, tier = :tier,
       price_gbp = :priceGbp, url = :url, status = :status, status_detail = :statusDetail,
       fetched_at = :fetchedAt, updated_at = :now
     WHEN NOT MATCHED THEN INSERT
       (cache_key, retailer, size, load_index, speed_rating, season, run_flat, brand_query,
        product_name, matched_brand, tier, price_gbp, url, status, status_detail, fetched_at, updated_at)
     VALUES
       (:cacheKey, :retailer, :size, :loadIndex, :speedRating, :season, :runFlat, :brandQuery,
        :productName, :brand, :tier, :priceGbp, :url, :status, :statusDetail, :fetchedAt, :now)`,
    [
      { name: "cacheKey", value: cacheKey },
      { name: "retailer", value: retailer },
      { name: "size", value: normalizedSize(spec) },
      { name: "loadIndex", value: spec.loadIndex ?? null },
      { name: "speedRating", value: spec.speedRating ?? null },
      { name: "season", value: spec.season },
      { name: "runFlat", value: spec.runFlat, type: "BOOLEAN" },
      { name: "brandQuery", value: spec.brand ?? null },
      { name: "productName", value: quote.productName },
      { name: "brand", value: quote.brand },
      { name: "tier", value: quote.tier },
      { name: "priceGbp", value: quote.priceGbp, type: "DOUBLE" },
      { name: "url", value: quote.url },
      { name: "status", value: quote.status },
      { name: "statusDetail", value: quote.statusDetail ?? null },
      { name: "fetchedAt", value: quote.fetchedAt, type: "TIMESTAMP" },
      { name: "now", value: now, type: "TIMESTAMP" },
    ],
  );
}
