import type { TyreSeason } from "../types";

export interface RetailerAdapterInput {
  size: string;
  loadIndex?: string;
  speedRating?: string;
  season: TyreSeason;
  runFlat: boolean;
  brand?: string;
  model?: string;
}

export interface RetailerAdapterResult {
  productName: string | null;
  matchedBrand: string | null;
  priceGbp: number | null;
  url: string | null;
  status: "ok" | "unavailable" | "no-match";
  statusDetail?: string;
}

export interface RetailerAdapter {
  key: string;
  displayName: string;
  /**
   * Must never throw -- any network/timeout/parse failure resolves as
   * {status: "unavailable"} so one retailer's failure can never affect the
   * other's result (Promise.allSettled in the orchestrator is a backstop,
   * not the primary isolation mechanism).
   */
  fetchPrice(input: RetailerAdapterInput): Promise<RetailerAdapterResult>;
}
