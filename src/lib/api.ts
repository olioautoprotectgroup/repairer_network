import type { Repairer, SearchFilters, SearchResponse } from "./types";

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
  repairer: Omit<Repairer, "id" | "lat" | "lon" | "geocoded" | "recentRepairCount" | "repairCountAsOf">,
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
