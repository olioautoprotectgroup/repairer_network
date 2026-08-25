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
