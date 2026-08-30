import * as cheerio from "cheerio";
import { knownBrandNames } from "../tierMap";

/**
 * CSS selectors for a retailer's search-results listing page.
 *
 * IMPORTANT: these are placeholder values matched against the synthetic
 * fixture in `__fixtures__/`, not verified against either retailer's real,
 * live markup -- this environment has no way to responsibly capture real
 * HTML from Halfords/Kwik Fit. Both adapters ship disabled (see config.ts)
 * for this reason among others: whoever does the compliance sign-off review
 * must also capture real search-result HTML and update these selectors
 * (and the fixtures/tests) to match before either flag is turned on.
 */
export interface ListingSelectors {
  cardSelector: string;
  titleSelector: string;
  priceSelector: string;
  linkSelector: string;
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

export function guessBrand(title: string): string | null {
  const lower = title.toLowerCase();
  return knownBrandNames().find((b) => lower.includes(b.toLowerCase())) ?? null;
}

/**
 * Picks the best matching product from a parsed listing: if a brand was
 * requested, prefer products mentioning it (cheapest among those); if none
 * mention it, or no brand was requested, fall back to the cheapest overall.
 * Products with no parseable price are excluded from consideration.
 */
export function pickBestMatch(products: ParsedProduct[], requestedBrand?: string): ParsedProduct | null {
  const priced = products.filter((p) => p.priceGbp != null);
  if (priced.length === 0) return null;

  if (requestedBrand) {
    const brandMatches = priced.filter((p) => p.title.toLowerCase().includes(requestedBrand.trim().toLowerCase()));
    if (brandMatches.length > 0) {
      return brandMatches.sort((a, b) => (a.priceGbp as number) - (b.priceGbp as number))[0];
    }
  }

  return priced.sort((a, b) => (a.priceGbp as number) - (b.priceGbp as number))[0];
}
