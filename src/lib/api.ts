import type {
  DiscountReport,
  Repairer,
  RepairerFeedbackDetail,
  RepairerFeedbackSummary,
  RepairerReview,
  SearchFilters,
  SearchResponse,
} from "./types";
import type { TyrePriceRequest, TyrePriceResponse } from "./tyrePriceTypes";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string; detail?: string };
      if (parsed.error) message = [parsed.error, parsed.detail].filter(Boolean).join(" — ");
    } catch {
      // not JSON -- use the raw text as-is
    }
    throw new Error(`Request failed (${res.status}): ${message}`);
  }
  return res.json() as Promise<T>;
}

export async function searchRepairers(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (filters.vehicleManufacturer) params.set("make", filters.vehicleManufacturer);
  if (filters.capability) params.set("capability", filters.capability);
  if (filters.recoveryOnly) params.set("recoveryOnly", "true");
  if (filters.maxLabourRate != null) params.set("maxLabourRate", String(filters.maxLabourRate));

  const res = await fetch(`/api/search?${params.toString()}`);
  return handle<SearchResponse>(res);
}

export async function listRepairers(): Promise<Repairer[]> {
  const res = await fetch("/api/repairers");
  return handle<Repairer[]>(res);
}

export async function createRepairer(
  repairer: Omit<
    Repairer,
    "id" | "lat" | "lon" | "geocoded" | "recentRepairCount" | "repairCountAsOf" | "archivedAt" | "archivedBy"
  >,
) {
  const res = await fetch("/api/repairers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(repairer),
  });
  return handle<Repairer>(res);
}

export async function updateRepairer(id: string, repairer: Partial<Repairer>) {
  const res = await fetch(`/api/repairers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(repairer),
  });
  return handle<Repairer>(res);
}

/**
 * Per-repairer rollups keyed by repairer id, for the cards. Fetched
 * separately from the search rather than joined into it server-side, so a
 * feedback failure degrades to cards without ratings instead of breaking
 * the search itself. Repairers with no feedback are simply absent from the
 * map.
 */
/**
 * Archives a repairer, or restores one. This is how a repairer is removed
 * from the network -- see docs/REPAIRER_FEEDBACK.md and
 * api/src/lib/archive.ts for why it is an archive and not a delete.
 */
export async function archiveRepairer(id: string, archived: boolean): Promise<Repairer> {
  const res = await fetch(`/api/repairers/${encodeURIComponent(id)}/archive`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  return handle<Repairer>(res);
}

export async function getFeedbackSummaries(): Promise<Record<string, RepairerFeedbackSummary>> {
  const res = await fetch("/api/repairer-feedback");
  return handle<Record<string, RepairerFeedbackSummary>>(res);
}

/** Full reviews and discount reports for one repairer, newest first. */
export async function getRepairerFeedback(repairerId: string): Promise<RepairerFeedbackDetail> {
  const res = await fetch(`/api/repairer-feedback/${encodeURIComponent(repairerId)}`);
  return handle<RepairerFeedbackDetail>(res);
}

export async function submitReview(
  repairerId: string,
  input: { rating: number; note: string | null },
): Promise<RepairerReview> {
  const res = await fetch(`/api/repairer-feedback/${encodeURIComponent(repairerId)}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<RepairerReview>(res);
}

export async function submitDiscountReport(
  repairerId: string,
  input: { openToNegotiation: boolean; discountPercent: number | null; note: string | null },
): Promise<DiscountReport> {
  const res = await fetch(`/api/repairer-feedback/${encodeURIComponent(repairerId)}/discounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<DiscountReport>(res);
}

/**
 * 204 responses carry no body, so these two can't go through handle<T>()
 * -- it would try to parse an empty body as JSON. The error path is kept
 * identical by reusing the same message shape.
 */
async function handleNoContent(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  let message = text || res.statusText;
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    if (parsed.error) message = [parsed.error, parsed.detail].filter(Boolean).join(" — ");
  } catch {
    // not JSON -- use the raw text as-is
  }
  throw new Error(`Request failed (${res.status}): ${message}`);
}

export async function deleteReview(reviewId: string): Promise<void> {
  const res = await fetch(`/api/repairer-feedback/reviews/${encodeURIComponent(reviewId)}`, {
    method: "DELETE",
  });
  return handleNoContent(res);
}

export async function deleteDiscountReport(reportId: string): Promise<void> {
  const res = await fetch(`/api/repairer-feedback/discounts/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });
  return handleNoContent(res);
}

export async function checkTyrePrice(input: TyrePriceRequest): Promise<TyrePriceResponse> {
  const res = await fetch("/api/tyre-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<TyrePriceResponse>(res);
}

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export async function getClientPrincipal(): Promise<ClientPrincipal | null> {
  try {
    const res = await fetch("/.auth/me");
    if (!res.ok) return null;
    const data = (await res.json()) as { clientPrincipal: ClientPrincipal | null };
    return data.clientPrincipal;
  } catch {
    return null;
  }
}
