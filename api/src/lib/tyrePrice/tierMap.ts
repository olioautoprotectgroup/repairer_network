import type { TyreTier } from "./types";

/**
 * Brand -> tier classification, used for the like-for-like comparison and
 * the claim-tier-mismatch flag. This specific list is a starting point, not
 * a definitive industry standard -- flagged for sign-off (drives a flag
 * shown directly to claims handlers) before being trusted day-to-day.
 */
const TIER_BY_BRAND: Record<string, TyreTier> = {
  michelin: "premium",
  continental: "premium",
  bridgestone: "premium",
  pirelli: "premium",
  goodyear: "premium",

  dunlop: "mid",
  hankook: "mid",
  vredestein: "mid",
  yokohama: "mid",
  falken: "mid",
  toyo: "mid",
  avon: "mid",

  nexen: "budget",
  nankang: "budget",
  landsail: "budget",
  goodride: "budget",
  kumho: "budget",
  linglong: "budget",
  sailun: "budget",
};

export function tierForBrand(brand?: string | null): TyreTier | "unknown" {
  if (!brand) return "unknown";
  return TIER_BY_BRAND[brand.trim().toLowerCase()] ?? "unknown";
}

/** Proper-cased brand names, used by adapters to spot a brand mentioned in a product title. */
export function knownBrandNames(): string[] {
  return Object.keys(TIER_BY_BRAND).map((b) => b[0].toUpperCase() + b.slice(1));
}
