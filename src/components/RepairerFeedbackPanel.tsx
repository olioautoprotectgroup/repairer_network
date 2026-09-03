import { useEffect, useState, type FormEvent } from "react";
import {
  deleteDiscountReport,
  deleteReview,
  getRepairerFeedback,
  submitDiscountReport,
  submitReview,
} from "../lib/api";
import type { RepairerFeedbackDetail, RepairerFeedbackSummary } from "../lib/types";
import { StarRatingDisplay, StarRatingInput } from "./StarRating";

interface Props {
  repairerId: string;
  currentUserEmail: string;
  /** Whether to offer deletion of other handlers' submissions. The server
   * enforces this independently -- this only decides what to render. */
  canModerate: boolean;
  /** Lets the card refresh its own aggregate straight from a write's
   * response, rather than waiting on the ~1 minute redeploy for the
   * bundled summaries to catch up. */
  onSummaryChange: (summary: RepairerFeedbackSummary) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const labelClass = "mb-1 block text-xs font-medium text-slate-500";
const primaryButtonClass =
  "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RepairerFeedbackPanel({
  repairerId,
  currentUserEmail,
  canModerate,
  onSummaryChange,
}: Props) {
  const [detail, setDetail] = useState<RepairerFeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  const [openToNegotiation, setOpenToNegotiation] = useState(true);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const next = await getRepairerFeedback(repairerId);
      setDetail(next);
      onSummaryChange(next.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  // Keyed on the repairer alone: the panel shows one repairer for its
  // whole lifetime (it unmounts when collapsed), and depending on refresh
  // or onSummaryChange would re-fetch on every render.
  useEffect(() => {
    void refresh();
  }, [repairerId]);

  async function handleReviewSubmit(e: FormEvent) {
    e.preventDefault();
    if (rating == null) return;
    setSavingReview(true);
    setError(null);
    try {
      await submitReview(repairerId, { rating, note: reviewNote.trim() || null });
      setRating(null);
      setReviewNote("");
      // Re-read rather than splice locally: the detail endpoint reads live
      // from GitHub, so it already reflects this write, and it keeps the
      // list ordering and the summary consistent in one step.
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setSavingReview(false);
    }
  }

  async function handleDiscountSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingDiscount(true);
    setError(null);
    try {
      await submitDiscountReport(repairerId, {
        openToNegotiation,
        discountPercent: openToNegotiation && discountPercent ? Number(discountPercent) : null,
        note: discountNote.trim() || null,
      });
      setDiscountPercent("");
      setDiscountNote("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save discount report");
    } finally {
      setSavingDiscount(false);
    }
  }

  async function handleDelete(kind: "review" | "discount", id: string) {
    setError(null);
    try {
      if (kind === "review") await deleteReview(id);
      else await deleteDiscountReport(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    // The card that contains this panel is itself a role="button" with both
    // onClick and onKeyDown handlers, so every event that starts in here
    // has to be stopped from reaching it -- otherwise clicking a field
    // re-selects the card and typing a space in a note scrolls/selects.
    <div
      className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {loading && <p className="text-sm text-slate-400">Loading feedback&hellip;</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {detail && (
        <>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reviews
            </h4>
            {detail.reviews.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400">No reviews yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {detail.reviews.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">
                        <StarRatingDisplay rating={r.rating} />{" "}
                        <span className="font-medium text-slate-800">{r.authorName}</span>
                        <span className="text-slate-400">
                          {" "}
                          &middot; {formatDate(r.submittedAt)}
                          {r.updatedAt && " (edited)"}
                        </span>
                      </div>
                      {(r.authorEmail === currentUserEmail || canModerate) && (
                        <button
                          type="button"
                          onClick={() => void handleDelete("review", r.id)}
                          className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {r.note && <p className="mt-1 text-sm text-slate-600">{r.note}</p>}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleReviewSubmit} className="mt-3">
              <span className={labelClass}>Your rating *</span>
              <StarRatingInput
                value={rating}
                onChange={setRating}
                name={`rating-${repairerId}`}
              />
              <label className="mt-2 block">
                <span className={labelClass}>Note (optional)</span>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="How was the work, communication, turnaround?"
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={savingReview || rating == null}
                className={`mt-2 ${primaryButtonClass}`}
              >
                {savingReview ? "Saving…" : "Submit review"}
              </button>
            </form>
          </section>

          <section className="mt-4 border-t border-slate-200 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Discounts
            </h4>
            {detail.discountReports.length === 0 ? (
              <p className="mt-1 text-sm text-slate-400">No discount reports yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {detail.discountReports.map((d) => (
                  <li key={d.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">
                        <span
                          className={
                            d.openToNegotiation
                              ? "font-medium text-emerald-600"
                              : "font-medium text-amber-700"
                          }
                        >
                          {d.openToNegotiation
                            ? `Negotiated ${d.discountPercent}% off`
                            : "Would not negotiate"}
                        </span>{" "}
                        <span className="font-medium text-slate-800">{d.authorName}</span>
                        <span className="text-slate-400">
                          {" "}
                          &middot; {formatDate(d.submittedAt)}
                          {d.updatedAt && " (edited)"}
                        </span>
                      </div>
                      {(d.authorEmail === currentUserEmail || canModerate) && (
                        <button
                          type="button"
                          onClick={() => void handleDelete("discount", d.id)}
                          className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {d.note && <p className="mt-1 text-sm text-slate-600">{d.note}</p>}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleDiscountSubmit} className="mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={openToNegotiation}
                  onChange={(e) => setOpenToNegotiation(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600"
                />
                Was open to negotiation
              </label>
              {openToNegotiation && (
                <label className="mt-2 block">
                  <span className={labelClass}>Discount achieved, % off the quoted total *</span>
                  <input
                    type="number"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    required
                    min={0.1}
                    max={100}
                    step={0.1}
                    className={inputClass}
                  />
                </label>
              )}
              <label className="mt-2 block">
                <span className={labelClass}>Note (optional)</span>
                <textarea
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="What was negotiated, and on what kind of job?"
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={savingDiscount}
                className={`mt-2 ${primaryButtonClass}`}
              >
                {savingDiscount ? "Saving…" : "Submit discount report"}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
