import type { RetailerAdapter, RetailerAdapterInput, RetailerAdapterResult } from "./types";

/**
 * Kwik Fit is NOT currently a usable price source, and this adapter says so
 * rather than pretending otherwise.
 *
 * Verified against real captured markup of their 205/55 R16 listing
 * (https://www.kwik-fit.com/tyres/205-55-16, 2026-09-02): the page lists 107
 * tyres with brand, size, and the EU fuel/grip/noise labels, but contains
 * **no prices at all** -- zero occurrences of "£", "&pound;", or any
 * price-like figure in the product table. The only two money values on the
 * page are an MOT promotion and a fitting-charge footnote.
 *
 * That is by design on their side: Kwik Fit quotes a fitted price for a
 * specific centre, so a price only exists after choosing a tyre and
 * supplying a postcode. Retrieving one would mean driving a multi-step,
 * stateful, postcode-gated quote flow rather than reading a public listing
 * -- materially more invasive than what was reviewed, and a separate
 * decision rather than a selector change.
 *
 * So this adapter makes no request at all: sending traffic to a page that
 * structurally cannot answer the question would waste their capacity and
 * ours. It returns "unavailable" with the reason, which the UI surfaces as
 * "source unavailable" -- never a fabricated or implied price.
 */
export const kwikfitAdapter: RetailerAdapter = {
  key: "kwikfit",
  displayName: "Kwik Fit",
  async fetchPrice(_input: RetailerAdapterInput): Promise<RetailerAdapterResult> {
    return {
      productName: null,
      matchedBrand: null,
      priceGbp: null,
      url: null,
      status: "unavailable",
      statusDetail:
        "Kwik Fit does not publish prices on its tyre listing pages -- a price requires their postcode-gated quote flow, which is out of scope for this integration.",
    };
  },
};
