import * as cheerio from "cheerio";
import { knownBrandNames } from "../tierMap";

/**
 * CSS selectors for a retailer's search-results listing page.
 *
 * Prefer stable, semantic hooks (`data-testid`) over CSS classes. Halfords
 * in particular renders emotion class hashes (`css-fggpq3`) that change on
 * every one of their builds -- keying off those would break silently and
 * often, whereas the `data-testid` attributes survived unchanged and are
 * clearly deliberate test hooks.
 */
export interface ListingSelectors {
  cardSelector: string;
  titleSelector: string;
  priceSelector: string;
  linkSelector: string;
  /**
   * How to recover the tyre brand, which is not always in the product title.
   * Halfords titles are model-only ("EfficientGrip Performance 2") with the
   * brand only in the URL path (`/tyres/goodyear/...`), so matching a brand
   * against the title alone would return "unknown" for every product and
   * silently break both the tier badge and the like-for-like comparison.
   *
   *  - "title": look for a known brand inside the product title.
   *  - {urlSegment: n}: take path segment n of the product URL.
   */
  brandSource: "title" | { urlSegment: number };
}

export interface ParsedProduct {
  title: string;
  priceGbp: number | null;
  url: string | null;
}

export function parseProductListing(html: string, selectors: ListingSelectors, baseUrl: string): ParsedProduct[] {
  const $ = cheerio.load(html);
  const products: ParsedProduct[] = [];

  $(selectors.cardSelector).each((_, el) => {
    const card = $(el);
    const title = card.find(selectors.titleSelector).first().text().trim();
    const priceText = card.find(selectors.priceSelector).first().text().trim();
    const href = card.find(selectors.linkSelector).first().attr("href");
    if (!title) return;
    products.push({
      title,
      priceGbp: parsePriceGbp(priceText),
      url: href ? new URL(href, baseUrl).toString() : null,
    });
  });

  return products;
}

export function parsePriceGbp(text: string): number | null {
  const match = text.replace(/,/g, "").match(/£\s*(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

/**
 * Resolves the brand for a parsed product. Falls back to the title when a
 * URL-based lookup yields nothing, so a retailer that changes its URL shape
 * degrades to "unknown brand" rather than to a wrong one.
 */
export function resolveBrand(product: ParsedProduct, brandSource: ListingSelectors["brandSource"]): string | null {
  if (brandSource !== "title" && product.url) {
    const segment = brandSegmentFromUrl(product.url, brandSource.urlSegment);
    if (segment) {
      const known = matchKnownBrand(segment);
      // Return the raw segment even when it isn't a brand we know: the tier
      // lookup will say "unknown", but the handler still sees who makes the
      // tyre, which is more useful than a blank.
      return known ?? titleCase(segment);
    }
  }
  return matchKnownBrand(product.title);
}

function brandSegmentFromUrl(url: string, index: number): string | null {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[index] ?? null;
  } catch {
    return null;
  }
}

function matchKnownBrand(haystack: string): string | null {
  const lower = haystack.toLowerCase();
  return knownBrandNames().find((b) => lower.includes(b.toLowerCase())) ?? null;
}

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * Picks the best matching product from a parsed listing: if a brand was
 * requested, prefer products mentioning it (cheapest among those); if none
 * mention it, or no brand was requested, fall back to the cheapest overall.
 * Products with no parseable price are excluded from consideration.
 */
export function pickBestMatch(
  products: ParsedProduct[],
  requestedBrand: string | undefined,
  brandSource: ListingSelectors["brandSource"],
): ParsedProduct | null {
  const priced = products.filter((p) => p.priceGbp != null);
  if (priced.length === 0) return null;

  if (requestedBrand) {
    // Match against the *resolved* brand, not the title: a Halfords title is
    // model-only, so a title-only match would silently ignore the handler's
    // requested brand and quietly return the cheapest of anything.
    const wanted = requestedBrand.trim().toLowerCase();
    const brandMatches = priced.filter((p) => {
      const resolved = resolveBrand(p, brandSource);
      return (resolved ?? "").toLowerCase().includes(wanted) || p.title.toLowerCase().includes(wanted);
    });
    if (brandMatches.length > 0) {
      return brandMatches.sort((a, b) => (a.priceGbp as number) - (b.priceGbp as number))[0];
    }
  }

  return priced.sort((a, b) => (a.priceGbp as number) - (b.priceGbp as number))[0];
}
