import { RETAILERS } from "../config";
import { fetchListingAndMatch } from "./fetchListing";
import type { ListingSelectors } from "./htmlParsing";
import type { RetailerAdapter, RetailerAdapterInput, RetailerAdapterResult } from "./types";

// Verified against real captured markup (205/55 R16 search, 2026-09-02);
// see __fixtures__/halfords-search-result.html. Keyed on data-testid rather
// than class: Halfords renders emotion class hashes (css-fggpq3) that change
// on every build of theirs, so class-based selectors would break silently.
//
// The price element is the *container* (`product-tile-price`), not the inner
// `halfords-price-value`, because only the container includes the "£" that
// parsePriceGbp requires -- the value span holds a bare "97.99". Its text
// reads "From £97.99", i.e. the cheapest variant of that tyre.
const SELECTORS: ListingSelectors = {
  cardSelector: '[data-testid="tyre-tile"]',
  titleSelector: '[data-testid="tyre-tile-title-link"]',
  priceSelector: '[data-testid="product-tile-price"]',
  linkSelector: '[data-testid="tyre-tile-title-link"]',
  // Product URLs are /tyres/{brand}/{model}-{sku}.html -- segment 1 is the
  // brand. Titles are model-only, so this is the only reliable source.
  brandSource: { urlSegment: 1 },
};

/**
 * Halfords' tyre search is a canonical path, not a query string:
 * 205/55R16 -> /tyres/205-55-r16/ (taken from the captured page's own
 * rel="canonical", not guessed).
 */
function buildSearchPath(input: RetailerAdapterInput): string {
  const [width, rest] = input.size.split("/");
  const [profile, rim] = (rest ?? "").split("R");
  return `/tyres/${width}-${profile}-r${rim}/`.toLowerCase();
}

export const halfordsAdapter: RetailerAdapter = {
  key: "halfords",
  displayName: "Halfords",
  async fetchPrice(input: RetailerAdapterInput): Promise<RetailerAdapterResult> {
    return fetchListingAndMatch(RETAILERS.halfords, SELECTORS, buildSearchPath(input), input);
  },
};
