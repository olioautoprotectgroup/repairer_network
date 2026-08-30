import { getCachedQuote, writeCachedQuote } from "../cache";
import { isRetailerEnabled, type RetailerKey } from "../config";
import { tierForBrand } from "../tierMap";
import type { PriceQuote, TyreSpec } from "../types";
import { halfordsAdapter } from "./halfords";
import { kwikfitAdapter } from "./kwikfit";
import type { RetailerAdapter, RetailerAdapterInput } from "./types";

const REGISTRY: RetailerAdapter[] = [halfordsAdapter, kwikfitAdapter];

function normalizedSize(spec: TyreSpec): string {
  return `${spec.width}/${spec.profile}R${spec.rim}`;
}

function toAdapterInput(spec: TyreSpec): RetailerAdapterInput {
  return {
    size: normalizedSize(spec),
    loadIndex: spec.loadIndex,
    speedRating: spec.speedRating,
    season: spec.season,
    runFlat: spec.runFlat,
    brand: spec.brand,
    model: spec.model,
  };
}

function synthesizeQuote(
  displayName: string,
  spec: TyreSpec,
  overrides: Partial<PriceQuote> & Pick<PriceQuote, "status">,
): PriceQuote {
  return {
    retailer: displayName,
    productName: null,
    size: normalizedSize(spec),
    load: spec.loadIndex ?? null,
    speed: spec.speedRating ?? null,
    brand: null,
    tier: "unknown",
    priceGbp: null,
    url: null,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function resolveOne(adapter: RetailerAdapter, spec: TyreSpec, forceRefresh: boolean): Promise<PriceQuote> {
  const key = adapter.key as RetailerKey;

  if (!forceRefresh) {
    const cached = await getCachedQuote(key, spec);
    if (cached) return cached;
  }

  const result = await adapter.fetchPrice(toAdapterInput(spec));
  const quote: PriceQuote = {
    retailer: adapter.displayName,
    productName: result.productName,
    size: normalizedSize(spec),
    load: spec.loadIndex ?? null,
    speed: spec.speedRating ?? null,
    brand: result.matchedBrand,
    tier: tierForBrand(result.matchedBrand),
    priceGbp: result.priceGbp,
    url: result.url,
    fetchedAt: new Date().toISOString(),
    status: result.status,
    statusDetail: result.statusDetail,
  };

  try {
    await writeCachedQuote(key, spec, quote);
  } catch {
    // Best-effort cache write -- a failure here must never affect the user-facing quote.
  }

  return quote;
}

/**
 * Cache-first, per-retailer lookup across every registered adapter.
 * Disabled retailers synthesize a "disabled" quote rather than being
 * silently omitted, so the UI can show why a source is missing. A live
 * fetch failure (network, cold-start, anything unexpected escaping the
 * adapter's own never-throw contract) also degrades to an "unavailable"
 * quote via Promise.allSettled -- one retailer's failure can never affect
 * the other's result.
 */
export async function orchestrateLookup(spec: TyreSpec, options: { forceRefresh?: boolean } = {}): Promise<PriceQuote[]> {
  const enabled = REGISTRY.filter((a) => isRetailerEnabled(a.key as RetailerKey));
  const disabled = REGISTRY.filter((a) => !isRetailerEnabled(a.key as RetailerKey)).map((a) =>
    synthesizeQuote(a.displayName, spec, {
      status: "disabled",
      statusDetail: "Retailer not yet enabled pending Legal/Compliance sign-off",
    }),
  );

  const settled = await Promise.allSettled(enabled.map((a) => resolveOne(a, spec, options.forceRefresh ?? false)));
  const resolved = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : synthesizeQuote(enabled[i].displayName, spec, {
          status: "unavailable",
          statusDetail: s.reason instanceof Error ? s.reason.message : "Unknown error",
        }),
  );

  return [...resolved, ...disabled];
}
