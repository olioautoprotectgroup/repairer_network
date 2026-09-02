import type { RetailerConfig } from "../config";
import { fetchWithTimeout } from "../httpFetch";
import { waitForRateLimit } from "../rateLimiter";
import { isPathAllowed } from "../robotsCheck";
import { parseProductListing, pickBestMatch, resolveBrand, type ListingSelectors } from "./htmlParsing";
import type { RetailerAdapterInput, RetailerAdapterResult } from "./types";

const UNAVAILABLE = (statusDetail: string): RetailerAdapterResult => ({
  productName: null,
  matchedBrand: null,
  priceGbp: null,
  url: null,
  status: "unavailable",
  statusDetail,
});

/**
 * Shared fetch/parse pipeline used by both retailer adapters: robots.txt
 * check -> rate limit -> timeout-bounded fetch -> parse -> best match. Never
 * throws -- every failure mode resolves to a status instead, per the
 * RetailerAdapter contract.
 */
export async function fetchListingAndMatch(
  config: RetailerConfig,
  selectors: ListingSelectors,
  searchPath: string,
  input: RetailerAdapterInput,
): Promise<RetailerAdapterResult> {
  try {
    const allowed = await isPathAllowed(config.robotsUrl, searchPath);
    if (!allowed) return UNAVAILABLE("Disallowed by robots.txt");

    await waitForRateLimit(config.key, config.minRequestIntervalMs);

    const url = `${config.baseUrl}${searchPath}`;
    const res = await fetchWithTimeout(url, { "User-Agent": config.userAgent }, config.timeoutMs);

    if (res.status === 403 || res.status === 429) {
      // Never retried -- retrying a block would be the opposite of respecting it.
      return UNAVAILABLE(`Blocked (HTTP ${res.status})`);
    }
    if (!res.ok) return UNAVAILABLE(`HTTP ${res.status}`);

    const html = await res.text();
    const products = parseProductListing(html, selectors, config.baseUrl);
    const best = pickBestMatch(products, input.brand, selectors.brandSource);
    if (!best) return { productName: null, matchedBrand: null, priceGbp: null, url: null, status: "no-match" };

    const matchedBrand = resolveBrand(best, selectors.brandSource);
    return {
      // Retailers like Halfords title their products model-only, so prepend
      // the brand: "EfficientGrip Performance 2" alone doesn't tell a handler
      // whose tyre they're looking at.
      productName: matchedBrand && !best.title.toLowerCase().includes(matchedBrand.toLowerCase())
        ? `${matchedBrand} ${best.title}`
        : best.title,
      matchedBrand,
      priceGbp: best.priceGbp,
      url: best.url,
      status: "ok",
    };
  } catch (err) {
    return UNAVAILABLE(err instanceof Error ? err.message : "Unknown error");
  }
}
