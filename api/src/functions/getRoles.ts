import { app, HttpRequest, HttpResponseInit } from "@azure/functions";

/**
 * Azure Static Web Apps calls this after every login (its `rolesSource`)
 * with the authenticated user's identity, and expects back the list of
 * custom roles to attach to their session. staticwebapp.config.json then
 * requires the "authenticated-staff" role on every route.
 *
 * This is the defense-in-depth domain check: even though the Entra app
 * registration is single-tenant (scoped to the AutoProtect Group tenant),
 * this explicitly re-checks the email domain so a guest account invited
 * into the tenant can't slip through.
 */
const ALLOWED_DOMAIN = "@autoprotectgroup.co.uk";

interface RolesRequestBody {
  identityProvider: string;
  userId: string;
  userDetails: string;
  claims?: Array<{ typ: string; val: string }>;
}

export async function getRoles(request: HttpRequest): Promise<HttpResponseInit> {
  const body = (await request.json()) as RolesRequestBody;
  const email = body.userDetails?.toLowerCase() ?? "";

  const isAllowed = email.endsWith(ALLOWED_DOMAIN);

  return {
    jsonBody: { roles: isAllowed ? ["authenticated-staff"] : [] },
  };
}

app.http("GetRoles", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "GetRoles",
  handler: getRoles,
});
