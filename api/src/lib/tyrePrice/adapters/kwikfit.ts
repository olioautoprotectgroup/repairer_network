import { RETAILERS } from "../config";
import { fetchListingAndMatch } from "./fetchListing";
import type { ListingSelectors } from "./htmlParsing";
import type { RetailerAdapter, RetailerAdapterInput, RetailerAdapterResult } from "./types";

// Placeholder selectors matched against the synthetic fixture -- see the
// notice in htmlParsing.ts. Must be verified/updated against real markup
// before this adapter's feature flag is ever turned on.
const SELECTORS: ListingSelectors = {
  cardSelector: ".tyre-results__item",
  titleSelector: ".tyre-results__name",
  priceSelector: ".tyre-results__price",
  linkSelector: ".tyre-results__link",
};

function buildSearchPath(input: RetailerAdapterInput): string {
  const sizeSlug = input.size.toLowerCase().replace(/\//g, "-").replace(/\s+/g, "-");
  return `/tyres/search/${sizeSlug}`;
}

export const kwikfitAdapter: RetailerAdapter = {
  key: "kwikfit",
  displayName: "Kwik Fit",
  async fetchPrice(input: RetailerAdapterInput): Promise<RetailerAdapterResult> {
    return fetchListingAndMatch(RETAILERS.kwikfit, SELECTORS, buildSearchPath(input), input);
  },
};
