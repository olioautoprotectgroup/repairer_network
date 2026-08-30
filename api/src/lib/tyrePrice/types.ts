export type TyreSeason = "summer" | "winter" | "all-season";
export type TyreTier = "budget" | "mid" | "premium";
export type PriceSourceStatus = "ok" | "unavailable" | "disabled" | "no-match";

export interface TyreSpec {
  width: number;
  profile: number;
  rim: number;
  loadIndex?: string;
  speedRating?: string;
  season: TyreSeason;
  runFlat: boolean;
  brand?: string;
  model?: string;
}

export interface TyrePriceRequest {
  vehicleReg?: string;
  spec: TyreSpec;
  claimedPriceGbp?: number;
  postcode?: string;
}

export interface PriceQuote {
  retailer: string;
  productName: string | null;
  size: string;
  load: string | null;
  speed: string | null;
  brand: string | null;
  tier: TyreTier | "unknown";
  priceGbp: number | null;
  url: string | null;
  fetchedAt: string;
  status: PriceSourceStatus;
  statusDetail?: string;
}

export interface PriceSummary {
  cheapestGbp: number | null;
  averageGbp: number | null;
  medianGbp: number | null;
  rangeGbp: { min: number; max: number } | null;
  quoteCountUsed: number;
}

export interface VarianceResult {
  claimedPriceGbp: number | null;
  percentVsCheapest: number | null;
  percentVsAverage: number | null;
  flag: "ok" | "review" | "not-applicable";
  thresholdPercent: number;
}

export interface ClaimTierFlag {
  claimTier: TyreTier | "unknown";
  cheapestTier: TyreTier | "unknown";
  mismatch: boolean;
}

export interface NearbyFitter {
  name: string;
  distanceMiles: number;
  lat: number;
  lon: number;
  address: string | null;
  amenityType: string;
  mapsUrl: string;
}

export interface RegLookupResult {
  attempted: boolean;
  resolvedSize: string | null;
}

export interface TyrePriceResponse {
  spec: TyreSpec;
  normalizedSize: string;
  quotes: PriceQuote[];
  summary: PriceSummary;
  tierGroups: { tier: TyreTier | "unknown"; quoteCount: number; cheapestGbp: number | null }[];
  claimTierFlag: ClaimTierFlag;
  variance: VarianceResult;
  fitters: { status: "ok" | "unavailable" | "not-requested"; results: NearbyFitter[] };
  regLookup: RegLookupResult;
}
