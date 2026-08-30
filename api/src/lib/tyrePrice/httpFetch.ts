/**
 * Single-shot timeout wrapper around native fetch -- no retry. Retrying
 * against a retailer that just rate-limited or blocked the request would be
 * the opposite of respecting that limit, so a failure here is always
 * surfaced to the caller as a plain result, never retried internally.
 */
export async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
