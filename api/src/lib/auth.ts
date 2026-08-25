import { HttpRequest } from "@azure/functions";
import { timingSafeEqual } from "node:crypto";

/**
 * Azure Static Web Apps' Free tier has no custom-role support (that's a
 * Standard SKU feature), so `authenticated-staff`-style role gating in
 * staticwebapp.config.json isn't available. Instead, every route is gated
 * only on the built-in `authenticated` role (any successfully logged-in
 * user, any provider), and this module does the real
 * `@autoprotectgroup.co.uk` domain check here, server-side, using the
 * `x-ms-client-principal` header SWA attaches to every proxied request.
 */
const ALLOWED_DOMAIN = "@autoprotectgroup.co.uk";

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export function getClientPrincipal(request: HttpRequest): ClientPrincipal | null {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

export function isAuthorizedStaff(request: HttpRequest): boolean {
  const principal = getClientPrincipal(request);
  return Boolean(principal?.userDetails?.toLowerCase().endsWith(ALLOWED_DOMAIN));
}

/**
 * Authorizes a machine caller (a scheduled Databricks job, not a signed-in
 * AAD user) via a shared secret in the `x-writeback-key` header, checked
 * against the DATABRICKS_WRITEBACK_KEY app setting. Used by automated
 * writes -- the repairer intake-merge job and the repair-count sync job --
 * that can't produce an x-ms-client-principal header. Constant-time
 * comparison so response timing can't be used to guess the key.
 */
export function isAuthorizedWriteback(request: HttpRequest): boolean {
  const expected = process.env.DATABRICKS_WRITEBACK_KEY;
  if (!expected) return false;
  const provided = request.headers.get("x-writeback-key");
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected, "utf-8");
  const providedBuf = Buffer.from(provided, "utf-8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
