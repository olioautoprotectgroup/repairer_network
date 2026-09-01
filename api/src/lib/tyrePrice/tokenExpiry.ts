import { requiredEnv, requiredHeaderSafeEnv } from "../env";

/**
 * Checks how long the Databricks service-principal token has left.
 *
 * Why: the token is the single point of failure for this whole feature. When
 * it lapses, the live cache reads and the nightly precache both start failing
 * and nothing else would tell anyone -- the precache job would just quietly
 * go red (or worse, keep "succeeding" with every source unavailable). This
 * turns a silent expiry into a countdown the nightly job surfaces.
 *
 * This never throws and never fails the caller: an unavailable or
 * unauthorized token-list endpoint yields "unknown", not an error. An expiry
 * check that could break the job it's attached to would be worse than no
 * check at all.
 */

export type TokenExpiryStatus = "ok" | "expiring" | "expired" | "no-expiry" | "unknown";

export interface TokenExpiryResult {
  status: TokenExpiryStatus;
  expiresAt: string | null;
  daysRemaining: number | null;
  /** Human-readable context -- always populated for non-"ok" statuses. */
  detail: string;
}

interface TokenInfo {
  token_id?: string;
  comment?: string;
  creation_time?: number;
  /** Epoch millis. -1 means the token never expires. */
  expiry_time?: number;
}

export function expiryWarningDays(): number {
  const raw = process.env.TYRE_PRICE_TOKEN_EXPIRY_WARNING_DAYS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

export async function checkTokenExpiry(): Promise<TokenExpiryResult> {
  const unknown = (detail: string): TokenExpiryResult => ({
    status: "unknown",
    expiresAt: null,
    daysRemaining: null,
    detail,
  });

  let host: string;
  let token: string;
  try {
    host = requiredEnv("DATABRICKS_SQL_HOST");
    token = requiredHeaderSafeEnv("DATABRICKS_SQL_TOKEN");
  } catch (err) {
    return unknown(err instanceof Error ? err.message : "Databricks settings missing");
  }

  let infos: TokenInfo[];
  try {
    const res = await fetch(`https://${host}/api/2.0/token/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // A 403 here is entirely plausible and is NOT a problem with the token
      // itself -- listing tokens is a separate permission from using the
      // warehouse. Report it as unknown rather than alarming anyone.
      return unknown(`Could not list tokens (HTTP ${res.status}) -- expiry not checked, this does not affect the sync itself`);
    }
    const body = (await res.json()) as { token_infos?: TokenInfo[] };
    infos = body.token_infos ?? [];
  } catch (err) {
    return unknown(`Token expiry check failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  if (infos.length === 0) {
    return unknown("No tokens visible to this identity -- expiry not checked");
  }

  // We can't identify *our own* token from the list (we never see its id), so
  // for a single-purpose service principal there should be exactly one. If
  // there are several, take the soonest-expiring: warning early about the
  // wrong token is recoverable, missing a real expiry is not.
  const withExpiry = infos.filter((t) => typeof t.expiry_time === "number");
  const neverExpires = withExpiry.some((t) => t.expiry_time === -1);
  const expiring = withExpiry
    .filter((t) => (t.expiry_time as number) > 0)
    .sort((a, b) => (a.expiry_time as number) - (b.expiry_time as number))[0];

  const ambiguity =
    infos.length > 1
      ? ` (${infos.length} tokens visible to this identity; reporting the soonest-expiring one)`
      : "";

  if (!expiring) {
    if (neverExpires) {
      return {
        status: "no-expiry",
        expiresAt: null,
        daysRemaining: null,
        detail: `Token does not expire${ambiguity}. Nothing to action, but a non-expiring credential is a deliberate tradeoff worth revisiting.`,
      };
    }
    return unknown(`No expiry information on the visible token(s)${ambiguity}`);
  }

  const expiresAtMs = expiring.expiry_time as number;
  const daysRemaining = Math.floor((expiresAtMs - Date.now()) / (1000 * 60 * 60 * 24));
  const expiresAt = new Date(expiresAtMs).toISOString();
  const threshold = expiryWarningDays();

  if (daysRemaining < 0) {
    return {
      status: "expired",
      expiresAt,
      daysRemaining,
      detail: `DATABRICKS_SQL_TOKEN expired on ${expiresAt}${ambiguity}. The tyre-price cache and log are failing until it is replaced.`,
    };
  }

  if (daysRemaining <= threshold) {
    return {
      status: "expiring",
      expiresAt,
      daysRemaining,
      detail:
        `DATABRICKS_SQL_TOKEN expires in ${daysRemaining} day(s), on ${expiresAt}${ambiguity}. ` +
        `Mint a replacement and update the app setting before then, or the cache and log will start failing silently.`,
    };
  }

  return {
    status: "ok",
    expiresAt,
    daysRemaining,
    detail: `Token valid for a further ${daysRemaining} day(s)${ambiguity}.`,
  };
}
