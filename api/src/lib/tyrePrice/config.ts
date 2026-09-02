import type { TyreSpec } from "./types";

export type RetailerKey = "halfords";

export interface RetailerConfig {
  key: RetailerKey;
  displayName: string;
  baseUrl: string;
  robotsUrl: string;
  minRequestIntervalMs: number;
  timeoutMs: number;
  /**
   * Self-identifying User-Agent, matching this codebase's existing Nominatim
   * precedent (geocode.ts) rather than a browser-mimicking one -- disguising
   * the caller to evade a retailer's own detection is a worse legal posture
   * for an FCA-regulated company than being transparently identifiable and
   * simply getting a blocked/unavailable result if the retailer objects.
   * Confirm this exact string with Legal/Compliance alongside the ToS
   * sign-off before either flag below is ever turned on.
   */
  userAgent: string;
}

export const RETAILERS: Record<RetailerKey, RetailerConfig> = {
  halfords: {
    key: "halfords",
    displayName: "Halfords",
    baseUrl: "https://www.halfords.com",
    robotsUrl: "https://www.halfords.com/robots.txt",
    minRequestIntervalMs: 3000,
    timeoutMs: 10000,
    userAgent: "AutoProtect-TyrePriceCheck/1.0 (internal claims tool; contact: oliver.oakes@autoprotectgroup.co.uk)",
  },
};

/**
 * Kill switch per retailer -- unset (the shipped default) means disabled.
 * Nothing scrapes in production until someone deliberately sets this to
 * "true" as an Azure app setting, after Legal/Compliance sign-off on that
 * retailer's current Terms of Service and robots.txt.
 */
const ENABLED_ENV_VAR: Record<RetailerKey, string> = {
  halfords: "TYRE_PRICE_HALFORDS_ENABLED",
};

export function isRetailerEnabled(key: RetailerKey): boolean {
  return process.env[ENABLED_ENV_VAR[key]] === "true";
}

export function cacheTtlHours(): number {
  const raw = process.env.TYRE_PRICE_CACHE_TTL_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

export function varianceThresholdPercent(): number {
  const raw = process.env.TYRE_PRICE_VARIANCE_THRESHOLD_PERCENT;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

/**
 * Hand-picked seed of common UK tyre sizes for the scheduled pre-cache job.
 * Not derived from real claims data yet -- worth revisiting once there's a
 * real distribution to draw from.
 */
export const COMMON_TYRE_SIZES: TyreSpec[] = [
  { width: 175, profile: 65, rim: 14, season: "summer", runFlat: false },
  { width: 185, profile: 60, rim: 14, season: "summer", runFlat: false },
  { width: 185, profile: 65, rim: 15, season: "summer", runFlat: false },
  { width: 195, profile: 65, rim: 15, season: "summer", runFlat: false },
  { width: 195, profile: 55, rim: 16, season: "summer", runFlat: false },
  { width: 195, profile: 60, rim: 15, season: "summer", runFlat: false },
  { width: 205, profile: 55, rim: 16, season: "summer", runFlat: false },
  { width: 205, profile: 60, rim: 16, season: "summer", runFlat: false },
  { width: 205, profile: 50, rim: 17, season: "summer", runFlat: false },
  { width: 215, profile: 55, rim: 17, season: "summer", runFlat: false },
  { width: 215, profile: 60, rim: 16, season: "summer", runFlat: false },
  { width: 225, profile: 45, rim: 17, season: "summer", runFlat: false },
  { width: 225, profile: 40, rim: 18, season: "summer", runFlat: false },
  { width: 225, profile: 50, rim: 17, season: "summer", runFlat: false },
  { width: 225, profile: 55, rim: 17, season: "summer", runFlat: false },
  { width: 235, profile: 45, rim: 18, season: "summer", runFlat: false },
  { width: 235, profile: 50, rim: 18, season: "summer", runFlat: false },
  { width: 245, profile: 45, rim: 18, season: "summer", runFlat: false },
  { width: 195, profile: 65, rim: 15, season: "winter", runFlat: false },
  { width: 205, profile: 55, rim: 16, season: "winter", runFlat: false },
];
