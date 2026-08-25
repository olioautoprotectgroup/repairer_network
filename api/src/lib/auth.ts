import { HttpRequest } from "@azure/functions";

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
 * TEMPORARY diagnostic helper (2026-08-25) — search works but Manage
 * Repairers save doesn't, despite both running isAuthorizedStaff() against
 * the same browser session. Surfaces exactly what this request saw so we
 * can tell whether x-ms-client-principal is missing, malformed, or present
 * but with unexpected content, without needing Azure log access. Remove
 * once the cause is found.
 */
export function debugPrincipalInfo(request: HttpRequest) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) {
    return { headerPresent: false };
  }
  const principal = getClientPrincipal(request);
  return {
    headerPresent: true,
    headerLength: header.length,
    parsedOk: principal !== null,
    principal,
  };
}
