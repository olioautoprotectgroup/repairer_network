# Repairer Reviews & Discount Reporting

Claims handlers rate a repairer 1–5 with an optional note, and separately
report whether the repairer negotiated and what discount they achieved.
Both are attributed to the handler who submitted them, aggregated onto the
repairer card, and browsable per repairer.

Everything on a card before this was either curated by one owner (Manage
Repairers) or machine-computed (`recentRepairCount`, from the nightly
Databricks job). This is the first data in the app written by the whole
team.

## Architecture

```
Card aggregates   GET  /api/repairer-feedback                          bundled file, ~1 min stale
Panel detail      GET  /api/repairer-feedback/{repairerId}             live GitHub read
Submit review     POST /api/repairer-feedback/{repairerId}/reviews
Submit discount   POST /api/repairer-feedback/{repairerId}/discounts
Edit own          PUT  /api/repairer-feedback/{reviews|discounts}/{id}
Delete            DEL  /api/repairer-feedback/{reviews|discounts}/{id}
```

| Module | Role |
|---|---|
| `api/src/lib/feedback/validate.ts` | pure input rules; returns an error *message*, never throws |
| `api/src/lib/feedback/summarize.ts` | pure aggregation into the per-repairer rollups |
| `api/src/lib/feedback/store.ts` | read-modify-commit, ownership rules, duplicate suppression |
| `api/src/functions/repairer-feedback.ts` | the eight routes; guard first, then validate, then write |
| `src/components/RepairerFeedbackPanel.tsx` | the inline panel and both forms |
| `src/components/StarRating.tsx` | ★/☆ display and a radio-based 1–5 input |

**Aggregates are computed on every read, never stored.** There is no
denormalised average that can drift out of step with the rows behind it,
and the arithmetic lives in a `lib/` module where the test suite already
reaches it (this repo's tests stop at `lib/` — importing anything under
`api/src/functions/` registers routes as a module side effect).

**Search is untouched.** Feedback is a separate frontend call merged
client-side, so if it fails the cards render without ratings rather than
the search failing. `/api/search` still touches only the bundled JSON plus
geocoding.

**The card's own aggregate updates immediately after a submit.** The panel
re-reads the live endpoint and hands the fresh summary back up to the card,
so a handler sees their own review straight away instead of waiting for the
redeploy — the same reason Manage Repairers applies the saved record
directly rather than re-fetching.

## Storage: why not Databricks

Databricks was the obvious candidate and was rejected on evidence, not
preference.

`README.md`'s Databricks section states the governing constraint:
`api/data/repairers.json` via GitHub is the *only* writable source of
truth. Beyond that, the app→Databricks direction is not usable today:

1. **It has never authenticated against a real warehouse.** The tyre-price
   SQL client is written and unit-tested against mocks, but
   `docs/TYRE_PRICE_CHECK.md` ("One-time Databricks setup") lists five
   undone steps, the nightly pre-cache workflow has never run, and Tyre
   Price Check is hidden from the nav precisely because of it.
2. **The service principal cannot reach a new table.** Its grant covers
   `tyre_price_cache` and `tyre_price_lookup_log` only. A new table needs a
   grants change in the out-of-repo `repairer_network_databricks/notebooks/`.
3. **The latency is wrong for this read.** A cold serverless warehouse
   costs up to ~45 s and the client already models that as a first-class
   error (`DatabricksColdStartTimeoutError`). Ratings render on every card
   of every search.

Making reviews the first user-facing feature to depend on that path would
have shipped something that could not work until unrelated infrastructure
landed. The GitHub-commit model works today, needs no new credentials, and
costs nothing.

**The trade-off accepted:** every submission is a git commit, so it
triggers a redeploy and the bundled aggregate is up to ~1 minute stale.
That is already the norm here — the nightly sync and Manage Repairers
produce several data commits a day — and both mitigations already existed
in the codebase (live reads for the detail view, applying the write's
response locally).

**The Databricks path stays open.** The proven direction is the existing
nightly *mirror* job, which already copies `repairers.json` into
`sandbox.oliver_oakes.repairer_network`. Pointing that same job at
`repairer-feedback.json` would give lake-side analytics on feedback with no
new app-side SQL path and no new service-principal grants — the recommended
next step if this data is ever wanted for supplier negotiations. It needs
the out-of-repo notebooks, so it is written down here rather than built.
When it lands, its context doc in `Databricks_MetaData` needs a declared
Grain and a Joins section, and note that repo's CI validator **fails on any
email address in a committed Markdown doc** — so examples must use
placeholder authors, not real `authorEmail` values.

## Validation

Server-side is the real gate; the forms carry HTML-native constraints only,
the same split as Manage Repairers.

| Field | Rule |
|---|---|
| `rating` | integer 1–5. A numeric string is rejected, not coerced — `"4"` would pass a range check and then sit in a field every average divides by |
| `note` | optional, trimmed, ≤ 1000 chars. Whitespace-only becomes `null`, so "no note" is one value in the data rather than two |
| `openToNegotiation` | boolean, required |
| `discountPercent` | required when open to negotiation, `> 0` and `<= 100`, rounded to 1dp. Must be **absent** when not open — silently dropping it would misreport what the handler submitted |
| `repairerId` | must exist in `repairers.json`, else 404 |

`null` averages mean "nothing submitted yet", never "rated zero" — the same
convention `recentRepairCount` documents in `api/src/lib/types.ts`.

The discount average is taken over the reports that *did* negotiate.
Counting "wouldn't negotiate" as a 0% discount would answer a different
question ("expected discount") and read as a suspiciously low "discount
achieved" on the card.

### Duplicate suppression

Storage is append-only on purpose: a handler may rate the same repairer
again later, which is how a repairer improving or declining becomes
visible. So duplicates are only collapsed where they're clearly accidental
— an identical submission (same author, repairer, rating and note) inside
**5 minutes** is rejected as a double-click with a 409. The submit button
is also disabled while saving.

## Permissions

- **Submitting** is open to the whole `@autoprotectgroup.co.uk` domain
  (`isAuthorizedStaff`), not the narrower repairer-network-owner check that
  guards Manage Repairers. Restricting it to the data owner would defeat
  the point.
- **Authorship** is read from the signed `x-ms-client-principal` header and
  never from the request body. A body-supplied author would let any handler
  forge a colleague's review of a named supplier.
- **Editing** is the author's own submissions only. Nobody edits words
  attributed to someone else.
- **Deleting** is the author's own, or anyone's for
  `isAuthorizedRepairerManager` — a route to remove something inaccurate or
  abusive about a named business without giving everyone that power.

Attribution is mandatory and visible to all staff. That is the main check
on quality: notes concern named suppliers in an FCA-regulated context, and
a note signed by a colleague behaves very differently from an anonymous
one.

Staff email addresses are stored as `authorEmail` (with a derived display
name shown in the UI). These are internal staff identifiers, not consumer
PII, and they already flow through the app's auth on every request — but
they are the reason feedback data should not be exported outside the
business without thought.

## Conflict handling

Feedback writes retry **once** automatically on a GitHub 409, then fall
back to the existing "someone else saved just now, please retry" message.
That retry is safe here specifically because the mutation is re-applied to
a freshly re-read file, so an append converges. Repairer-list writes still
have no retry, deliberately: they replace a whole array built from a
snapshot, where a blind retry could resurrect stale rows.

## Running the tests

```bash
cd api && npm ci && npm test
```

`src/lib/feedback/*.test.ts` covers the validation rules, the aggregation
arithmetic, and the store's ownership/duplicate/conflict behaviour with the
`github` module mocked (the same approach `tyrePrice/cache.test.ts` takes
with `databricksClient`).

There are **no frontend tests**, because there is no frontend test
infrastructure in this repo — no vitest, jsdom or testing-library at the
root, and CI's `frontend` job runs `npm run build` only. Standing that up
is separate work. The design compensates by keeping every calculation and
rule server-side, where the suite does reach it, leaving the components
presentational.

## Not yet built (explicit scope)

- **Editing from the UI.** `PUT` on both resources is implemented and
  tested, but the panel currently offers submit and delete only — deleting
  and resubmitting is one click more and needs no extra UI.
- **Sorting or filtering search results by rating.** Deliberately out of
  scope until there is enough feedback for a ranking to mean anything;
  ordering 114 repairers by an average of one or two reviews would be
  actively misleading.
- **Notifying anyone** when a repairer gets a poor review.
- **The Databricks mirror** described above.
