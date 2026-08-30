import { RETAILERS } from "../config";
import { fetchListingAndMatch } from "./fetchListing";
import type { ListingSelectors } from "./htmlParsing";
import type { RetailerAdapter, RetailerAdapterInput, RetailerAdapterResult } from "./types";

// Placeholder selectors matched against the synthetic fixture -- see the
// notice in htmlParsing.ts. Must be verified/updated against real markup
// before this adapter's feature flag is ever turned on.
const SELECTORS: ListingSelectors = {
  cardSelector: ".product-card",
  titleSelector: ".product-card__title",
  priceSelector: ".product-card__price",
  linkSelector: ".product-card__link",
};

function buildSearchPath(input: RetailerAdapterInput): string {
  const params = new URLSearchParams({ q: `${input.size} tyre` });
  return `/search?${params.toString()}`;
}

export const halfordsAdapter: RetailerAdapter = {
  key: "halfords",
  displayName: "Halfords",
  async fetchPrice(input: RetailerAdapterInput): Promise<RetailerAdapterResult> {
    return fetchListingAndMatch(RETAILERS.halfords, SELECTORS, buildSearchPath(input), input);
  },
};
