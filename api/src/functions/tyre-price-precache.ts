import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { isAuthorizedPrecache } from "../lib/auth";
import { orchestrateLookup } from "../lib/tyrePrice/adapters";
import { COMMON_TYRE_SIZES } from "../lib/tyrePrice/config";
import { appendLookupLog } from "../lib/tyrePrice/log";
import { checkTokenExpiry } from "../lib/tyrePrice/tokenExpiry";
import { computeSummary, computeVariance } from "../lib/tyrePrice/varianceCalc";

const FORBIDDEN: HttpResponseInit = {
  status: 403,
  jsonBody: { error: "Access restricted to the scheduled tyre-price pre-cache job" },
};

/**
 * Refreshes the Databricks price cache for the ~20 common tyre sizes in
 * config.ts, force-bypassing the TTL so every run gets a genuinely fresh
 * price rather than a same-day cache hit. Triggered by a GitHub Actions
 * cron workflow (not a Timer-triggered Function -- Static Web Apps'
 * managed Functions don't support Timer triggers), machine-auth only via
 * isAuthorizedPrecache. Each size is logged same as a human lookup, with
 * source: "precache-job" and no handler identity.
 */
export async function runPrecache(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isAuthorizedPrecache(request)) return FORBIDDEN;

  // Checked first so it's reported even if every size below fails, and
  // surfaced in the response so the GitHub Actions caller can go red on it --
  // that workflow failing is the only thing that actually reaches a human
  // when this token is about to lapse.
  const tokenExpiry = await checkTokenExpiry();
  if (tokenExpiry.status === "expired") {
    context.error(`Tyre-price token expiry: ${tokenExpiry.detail}`);
  } else if (tokenExpiry.status === "expiring") {
    context.warn(`Tyre-price token expiry: ${tokenExpiry.detail}`);
  } else {
    context.log(`Tyre-price token expiry: ${tokenExpiry.detail}`);
  }

  const results: { size: string; season: string; quoteCount: number }[] = [];

  for (const spec of COMMON_TYRE_SIZES) {
    try {
      const quotes = await orchestrateLookup(spec, { forceRefresh: true });
      const summary = computeSummary(quotes);
      const variance = computeVariance(undefined, summary);

      await appendLookupLog({
        handlerEmail: null,
        spec,
        quotes,
        summary,
        variance,
        source: "precache-job",
      });

      results.push({ size: `${spec.width}/${spec.profile}R${spec.rim}`, season: spec.season, quoteCount: quotes.length });
    } catch (err) {
      context.error(`Pre-cache failed for size ${spec.width}/${spec.profile}R${spec.rim}`, err);
    }
  }

  return { jsonBody: { processed: results.length, results, tokenExpiry } };
}

app.http("tyre-price-precache", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tyre-price/precache",
  handler: runPrecache,
});
