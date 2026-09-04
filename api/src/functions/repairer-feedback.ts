/**
 * Staff reviews, ratings and discount reports for repairers.
 *
 * Auth: every route is gated on isAuthorizedStaff() -- every staff domain
 * in ALLOWED_DOMAINS, not the narrower repairer-network-owner check that
 * guards `repairers`. The point of this feature is that any
 * handler who used a repairer can say so, so restricting submission to the
 * data owner would defeat it. Two narrower rules sit on top:
 *
 *  - The author of a submission is read from the signed
 *    x-ms-client-principal header and never from the request body. A
 *    body-supplied author would let any handler forge a colleague's review
 *    of a named supplier.
 *  - Editing is the author's own only; deletion is the author's own OR the
 *    repairer network owner's (isAuthorizedRepairerManager), so there is a
 *    route to remove something inaccurate about a named business without
 *    giving everyone that power.
 *
 * authLevel is "anonymous" throughout for the same reason as every other
 * function here: SWA's Free tier has no custom roles, so the header check
 * inside the handler is the real gate (see api/src/lib/auth.ts).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getClientPrincipal, isAuthorizedRepairerManager, isAuthorizedStaff } from "../lib/auth";
import { loadRepairers } from "../lib/data";
import {
  DuplicateSubmissionError,
  ForbiddenError,
  NotFoundError,
  appendDiscountReport,
  appendReview,
  deleteDiscountReport,
  deleteReview,
  loadBundledFeedback,
  readLiveFeedback,
  updateOwnDiscountReport,
  updateOwnReview,
} from "../lib/feedback/store";
import { detailFor, summarizeAll } from "../lib/feedback/summarize";
import { validateDiscountReport, validateReview } from "../lib/feedback/validate";
import { saveFailureResponse } from "./repairers";
import type { Repairer } from "../lib/types";

const FORBIDDEN: HttpResponseInit = {
  status: 403,
  jsonBody: { error: "Access restricted to AutoProtect Group staff" },
};

/** The signed-in staff member's UPN, lowercased so ownership comparisons
 * are stable against whatever casing AAD echoes back from the login
 * prompt (the same normalisation isAuthorizedStaff does). */
function actorEmail(request: HttpRequest): string | null {
  const email = getClientPrincipal(request)?.userDetails;
  return email ? email.toLowerCase() : null;
}

function findRepairer(repairerId: string | undefined): Repairer | null {
  if (!repairerId) return null;
  return loadRepairers().find((r) => r.id === repairerId) ?? null;
}

/**
 * Maps the store's error classes onto responses. Anything else falls
 * through to saveFailureResponse(), which already turns a GitHub 409 into
 * the "someone else saved just now, please retry" message and everything
 * else into a 500 with a detail.
 */
function writeFailureResponse(err: unknown, context: InvocationContext): HttpResponseInit {
  if (err instanceof DuplicateSubmissionError) {
    return { status: 409, jsonBody: { error: err.message } };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, jsonBody: { error: err.message } };
  }
  if (err instanceof ForbiddenError) {
    return { status: 403, jsonBody: { error: err.message } };
  }
  context.error("Feedback write failed", err);
  return saveFailureResponse(err);
}

/**
 * All rollups, keyed by repairer id, from the locally bundled copy. Read
 * off disk rather than through GitHub because this is on the hot path --
 * the Search page calls it once per search alongside ~114 cards, and being
 * up to ~1 minute behind a brand-new review is the same tradeoff
 * lib/data.ts already documents for the repairer list itself.
 */
export async function listFeedbackSummaries(request: HttpRequest): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  return { jsonBody: summarizeAll(loadBundledFeedback()) };
}

/**
 * Everything the panel shows for one repairer, read LIVE from GitHub so a
 * handler reliably sees the review they just left rather than waiting on
 * the redeploy -- exactly why Manage Repairers' list endpoint does the
 * same.
 */
export async function getFeedbackDetail(request: HttpRequest): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;

  const repairer = findRepairer(request.params.repairerId);
  if (!repairer) {
    return { status: 404, jsonBody: { error: `No repairer with id "${request.params.repairerId}"` } };
  }

  const { feedback } = await readLiveFeedback();
  return { jsonBody: detailFor(repairer.id, feedback) };
}

export async function createReview(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  const email = actorEmail(request);
  if (!email) return FORBIDDEN;

  const repairer = findRepairer(request.params.repairerId);
  if (!repairer) {
    return { status: 404, jsonBody: { error: `No repairer with id "${request.params.repairerId}"` } };
  }

  const validated = validateReview((await request.json()) as { rating: unknown; note?: unknown });
  if ("error" in validated) return { status: 400, jsonBody: { error: validated.error } };

  try {
    const review = await appendReview(repairer.id, repairer.companyName, validated, email);
    return { status: 201, jsonBody: review };
  } catch (err) {
    return writeFailureResponse(err, context);
  }
}

export async function createDiscountReport(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  const email = actorEmail(request);
  if (!email) return FORBIDDEN;

  const repairer = findRepairer(request.params.repairerId);
  if (!repairer) {
    return { status: 404, jsonBody: { error: `No repairer with id "${request.params.repairerId}"` } };
  }

  const validated = validateDiscountReport(
    (await request.json()) as {
      openToNegotiation: unknown;
      discountPercent?: unknown;
      note?: unknown;
    },
  );
  if ("error" in validated) return { status: 400, jsonBody: { error: validated.error } };

  try {
    const report = await appendDiscountReport(
      repairer.id,
      repairer.companyName,
      validated,
      email,
    );
    return { status: 201, jsonBody: report };
  } catch (err) {
    return writeFailureResponse(err, context);
  }
}

export async function updateReview(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  const email = actorEmail(request);
  if (!email) return FORBIDDEN;

  const validated = validateReview((await request.json()) as { rating: unknown; note?: unknown });
  if ("error" in validated) return { status: 400, jsonBody: { error: validated.error } };

  try {
    return { jsonBody: await updateOwnReview(request.params.id, validated, email) };
  } catch (err) {
    return writeFailureResponse(err, context);
  }
}

export async function updateDiscountReport(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  const email = actorEmail(request);
  if (!email) return FORBIDDEN;

  const validated = validateDiscountReport(
    (await request.json()) as {
      openToNegotiation: unknown;
      discountPercent?: unknown;
      note?: unknown;
    },
  );
  if ("error" in validated) return { status: 400, jsonBody: { error: validated.error } };

  try {
    return { jsonBody: await updateOwnDiscountReport(request.params.id, validated, email) };
  } catch (err) {
    return writeFailureResponse(err, context);
  }
}

export async function removeReview(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  const email = actorEmail(request);
  if (!email) return FORBIDDEN;

  try {
    await deleteReview(request.params.id, email, isAuthorizedRepairerManager(request));
    return { status: 204 };
  } catch (err) {
    return writeFailureResponse(err, context);
  }
}

export async function removeDiscountReport(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (!isAuthorizedStaff(request)) return FORBIDDEN;
  const email = actorEmail(request);
  if (!email) return FORBIDDEN;

  try {
    await deleteDiscountReport(request.params.id, email, isAuthorizedRepairerManager(request));
    return { status: 204 };
  } catch (err) {
    return writeFailureResponse(err, context);
  }
}

app.http("repairer-feedback-summaries", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "repairer-feedback",
  handler: listFeedbackSummaries,
});

app.http("repairer-feedback-detail", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "repairer-feedback/{repairerId}",
  handler: getFeedbackDetail,
});

app.http("repairer-feedback-review-create", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "repairer-feedback/{repairerId}/reviews",
  handler: createReview,
});

app.http("repairer-feedback-discount-create", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "repairer-feedback/{repairerId}/discounts",
  handler: createDiscountReport,
});

app.http("repairer-feedback-review-update", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "repairer-feedback/reviews/{id}",
  handler: updateReview,
});

app.http("repairer-feedback-discount-update", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "repairer-feedback/discounts/{id}",
  handler: updateDiscountReport,
});

app.http("repairer-feedback-review-delete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "repairer-feedback/reviews/{id}",
  handler: removeReview,
});

app.http("repairer-feedback-discount-delete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "repairer-feedback/discounts/{id}",
  handler: removeDiscountReport,
});
