const lastRequestAt = new Map<string, number>();

/**
 * In-memory, per-process minimum interval between requests to a given
 * retailer. Note: Azure Functions Consumption plan can run multiple
 * instances, so this doesn't guarantee a global rate limit across all of
 * them -- a shared store (e.g. a `last_scraped_at` row in the Databricks
 * cache table) would be the real fix if scrape volume ever grows enough for
 * this to matter. Not needed at this feature's expected volume (an
 * occasional internal claims-handler lookup, not high QPS).
 */
export async function waitForRateLimit(key: string, minIntervalMs: number): Promise<void> {
  const last = lastRequestAt.get(key);
  const now = Date.now();
  if (last != null) {
    const elapsed = now - last;
    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
    }
  }
  lastRequestAt.set(key, Date.now());
}
