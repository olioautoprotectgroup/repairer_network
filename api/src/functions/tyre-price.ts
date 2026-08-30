import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getClientPrincipal, isAuthorizedStaff } from "../lib/auth";
import { orchestrateLookup } from "../lib/tyrePrice/adapters";
import { varianceThresholdPercent } from "../lib/tyrePrice/config";
import { findNearbyFitters } from "../lib/tyrePrice/fitterLookup";
import { appendLookupLog } from "../lib/tyrePrice/log";
import { lookupSizeFromReg } from "../lib/tyrePrice/regToSize";
import type { TyrePriceRequest, TyrePriceResponse } from "../lib/tyrePrice/types";
import { computeClaimTierFlag, computeSummary, computeVariance, groupByTier } from "../lib/tyrePrice/varianceCalc";

const FORBIDDEN: HttpResponseInit = {
  status: 403,
  jsonBody: { error: "Access restricted to AutoProtect Group staff" },
};

function normalizedSize(spec: TyrePriceRequest["spec"]): string {
  return `${spec.width}/${spec.profile}R${spec.rim}`;
}

export async function checkTyrePrice(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;

  const body = (await request.json()) as TyrePriceRequest;
  if (!body?.spec || !body.spec.width || !body.spec.profile || !body.spec.rim) {
    return { status: 400, jsonBody: { error: "spec.width, spec.profile and spec.rim are required" } };
  }

  const quotes = await orchestrateLookup(body.spec);
  const summary = computeSummary(quotes);
  const variance = computeVariance(body.claimedPriceGbp, summary, varianceThresholdPercent());
  const claimTierFlag = computeClaimTierFlag(body.spec.brand, quotes);
  const tierGroups = groupByTier(quotes);

  let fitters: TyrePriceResponse["fitters"] = { status: "not-requested", results: [] };
  if (body.postcode?.trim()) {
    try {
      fitters = { status: "ok", results: await findNearbyFitters(body.postcode.trim()) };
    } catch (err) {
      context.warn("Fitter lookup failed", err);
      fitters = { status: "unavailable", results: [] };
    }
  }

  const regLookup = body.vehicleReg?.trim()
    ? { attempted: true, resolvedSize: (await lookupSizeFromReg(body.vehicleReg.trim())).size }
    : { attempted: false, resolvedSize: null };

  const response: TyrePriceResponse = {
    spec: body.spec,
    normalizedSize: normalizedSize(body.spec),
    quotes,
    summary,
    tierGroups,
    claimTierFlag,
    variance,
    fitters,
    regLookup,
  };

  try {
    const handlerEmail = getClientPrincipal(request)?.userDetails ?? null;
    await appendLookupLog({
      handlerEmail,
      vehicleReg: body.vehicleReg,
      spec: body.spec,
      claimedPriceGbp: body.claimedPriceGbp,
      postcode: body.postcode,
      quotes,
      summary,
      variance,
      source: "staff-lookup",
    });
  } catch (err) {
    // Best-effort: the benchmark log must never block a handler's result.
    context.error("Failed to append tyre-price lookup log", err);
  }

  return { jsonBody: response };
}

app.http("tyre-price", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tyre-price",
  handler: checkTyrePrice,
});
