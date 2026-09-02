# Tyre Price Check

Lets a claims handler sanity-check a tyre claim's cost against the market:
enter the tyre spec (and optionally a claimed price, vehicle reg, postcode),
see retailer prices side by side, a like-for-like tier comparison, and a
variance flag if the claimed price looks high versus the market.

**Never fabricates a price.** Any source that can't be checked (disabled,
blocked, timed out, no matching product) shows "source unavailable" in the
UI — never a guess or an estimate. This is a hard requirement, not a
styling choice, given the FCA-regulated context this tool operates in.

## Architecture

```
TyrePriceCheck page --> POST /api/tyre-price --> orchestrateLookup()
                                                     |
                                    cache-first, per retailer adapter
                                                     |
                              Databricks cache (sandbox.oliver_oakes.tyre_price_cache)
                                     |                              |
                                cache hit                      cache miss
                                     |                              |
                              return cached quote      live scrape (if enabled) -> cache write

Every lookup (hit or miss) is also appended to
sandbox.oliver_oakes.tyre_price_lookup_log -- the future benchmark dataset.
```

- **Frontend**: `src/pages/TyrePriceCheck.tsx` + `src/components/tyrePrice/*`.
- **Main endpoint**: `api/src/functions/tyre-price.ts` (`POST /api/tyre-price`,
  human-only, `isAuthorizedStaff`).
- **Retailer adapters**: `api/src/lib/tyrePrice/adapters/halfords.ts`
  (Halfords is currently the only price source -- see "Retailer status"
  below), one file per retailer, each isolated behind its own feature flag
  and never throwing — a failure always resolves to a status, never an exception that
  could affect the other retailer's result.
- **Cache/log**: `api/src/lib/tyrePrice/{cache,log,databricksClient}.ts` —
  live, per-request calls to Databricks' SQL Statement Execution API. This
  is the first live App → Databricks direction in this project (every other
  Databricks integration here is Databricks → App, scheduled/batched);
  chosen deliberately over Azure Table Storage despite the cold-start-
  latency/DBU-cost tradeoff that implies.
- **Fitter lookup**: `api/src/lib/tyrePrice/fitterLookup.ts` — free,
  OSM/Overpass-based, reusing this app's existing postcode geocoding and
  distance sorting. No Google Places integration exists or is used here.
- **Pre-caching**: `api/src/functions/tyre-price-precache.ts`
  (`POST /api/tyre-price/precache`, machine-auth via `isAuthorizedPrecache`),
  triggered by `.github/workflows/tyre-price-precache.yml` (a GitHub Actions
  cron, not an Azure Function Timer trigger — Static Web Apps' colocated
  Functions don't support those).

## Retailer price scraping — legal/compliance notice

The retailer adapters in `api/src/lib/tyrePrice/adapters/` retrieve
publicly published retail prices from those retailers' own
consumer websites for internal claims-benchmarking purposes only. No
scraped content is republished externally or resold, and no attempt is
made to bypass authentication, paywalls, or technical access controls.

### Sign-off status

**Sign-off for both Halfords and Kwik Fit was confirmed by Oliver Oakes on
2026-09-01.** The underlying Legal/Compliance record is held outside this
repo — this line records only that the gate was reported as cleared, not
the review itself. Anyone relying on it should confirm the actual record
exists and still covers the current use. Kwik Fit was subsequently dropped
on technical grounds (see "Retailer status" below), so only the Halfords
half of that sign-off is actually exercised today.

The adapter nonetheless **remains disabled by default in code**
(`TYRE_PRICE_HALFORDS_ENABLED` unset =
off). That is deliberate and unchanged by sign-off: it keeps local dev,
preview environments and any future clone inert unless someone
deliberately opts in. Enabling is an Azure app-setting change per
environment, not a code change.

Each adapter respects the target site's `robots.txt` at request time,
applies a conservative per-retailer rate limit, uses a self-identifying
User-Agent (not a browser-mimicking one — see `config.ts`), and treats a
403/429 response as an immediate, non-retried "unavailable" result rather
than attempting to work around it.

**Do not enable a retailer before the Databricks cache is live.** With no
cache, every handler lookup scrapes the retailer directly — no
deduplication, no reuse, straight to the origin on every keystroke-driven
search. That is both the fastest route to being blocked and a poor way to
behave towards a retailer immediately after obtaining their-ToS sign-off.
Order: Databricks first, then real selectors, then the flags.

If a retailer's Terms of Service change, or the retailer objects to this
traffic, the relevant flag must be turned off immediately (an Azure
app-setting change, no redeploy required) pending re-review. As an
FCA-regulated firm, no scraped or estimated price is ever fabricated or
extrapolated when a source is blocked or fails — the UI shows "source
unavailable" instead, so a claims handler is never shown pricing data that
didn't actually come from a live or freshly cached retailer response.

## Retailer status (verified against real markup, 2026-09-02)

Real search-result HTML for 205/55 R16 was captured from both retailers'
live sites and the adapters were written against it. The outcome differs
per retailer, and the difference is not a selector detail:

**Halfords -- usable.** `adapters/halfords.ts`'s selectors are matched
against the real captured markup, committed as
`adapters/__fixtures__/halfords-search-result.html` (18 product tiles) and
asserted on in `halfords.test.ts`, so a site redesign surfaces as a
deliberate fixture update rather than silently in production. Two things
the real markup forced, which a synthetic fixture had wrong:

- Selectors are keyed on `data-testid`, never on class, because Halfords
  renders build-volatile Emotion class hashes (`css-fggpq3`).
- Product titles are **model-only** ("EfficientGrip Performance"); the
  brand appears only in the product URL path. The adapter recovers it from
  there and prepends it, guarding against titles that already carry their
  brand -- the real data is inconsistent about this.

**Kwik Fit -- removed.** Their listing page (`/tyres/205-55-16`) lists 107
tyres with brand, size and the EU fuel/grip/noise labels but contains **no
prices at all** -- zero occurrences of a price figure anywhere in the
product table; the only two money values on the page are an MOT promotion
and a fitting-charge footnote. That is by design on their side: Kwik Fit
quotes a fitted price for a specific centre, so a price only exists after
choosing a tyre and supplying a postcode.

Retrieving one would mean driving a multi-step, stateful, postcode-gated
quote flow rather than reading a public listing -- materially more
invasive than what was reviewed and signed off, and a separate decision
rather than a selector change. Oliver Oakes' call on 2026-09-02 was to
drop Kwik Fit and ship Halfords alone, so the adapter, its config entry,
its tests and its `TYRE_PRICE_KWIKFIT_ENABLED` flag were all removed
rather than left in place returning a permanent "unavailable".

This is recorded here so the same page isn't re-investigated later as a
missing integration: it is a deliberate exclusion with a known cause, not
an unfinished one. Restoring Kwik Fit means scoping the quote flow as its
own reviewed piece.

## Adding a new retailer adapter

1. Add a `RetailerConfig` entry to `api/src/lib/tyrePrice/config.ts`
   (base URL, robots.txt URL, rate limit, timeout, User-Agent) and a new
   `TYRE_PRICE_<NAME>_ENABLED` flag (unset = off, matching the existing two).
2. Capture real search-result HTML from the retailer's live site for a
   common size, save it under `adapters/__fixtures__/`.
3. Implement `RetailerAdapter` in a new `adapters/<name>.ts`, reusing
   `fetchListingAndMatch()` (`adapters/fetchListing.ts`) with your own
   `ListingSelectors` matched against the captured fixture.
4. Register the adapter in `adapters/index.ts`'s `REGISTRY`.
5. Write `adapters/<name>.test.ts` against the fixture (see
   `halfords.test.ts` for the pattern). If the retailer turns out not to
   publish prices on a public listing page at all, stop there and raise it
   -- see the Kwik Fit entry under "Retailer status" for why that is a
   decision, not a selector problem.
6. Get Legal/Compliance sign-off on that retailer's ToS/robots.txt before
   ever setting its flag to `"true"` anywhere.

## Running parser tests

```
cd api && npm test
```

Runs the full Vitest suite: pure logic (`varianceCalc`, `tierMap`), the
cache layer against a **mocked** Databricks client (no real Databricks
calls in CI), the Halfords adapter against its saved HTML fixture, and the
fitter lookup against canned Overpass JSON (no real Overpass call).

## New secrets

| Name | Where | Purpose |
|---|---|---|
| `DATABRICKS_SQL_HOST` | Azure app setting | Databricks workspace hostname |
| `DATABRICKS_SQL_WAREHOUSE_ID` | Azure app setting | id of a dedicated **serverless SQL Warehouse with auto-stop** |
| `DATABRICKS_SQL_TOKEN` | Azure app setting (secret) | New, narrowly-scoped service-principal token: `CAN_USE` on the one warehouse above, read/write on only `tyre_price_cache`/`tyre_price_lookup_log` — not a reused/broader credential |
| `TYRE_PRICE_CACHE_TTL_HOURS` | Azure app setting (optional, default `24`) | cache staleness window |
| `TYRE_PRICE_VARIANCE_THRESHOLD_PERCENT` | Azure app setting (optional, default `20`) | "review" flag threshold |
| `TYRE_PRICE_HALFORDS_ENABLED` | Azure app setting (unset = off) | per-retailer kill switch |
| `TYRE_PRICE_PRECACHE_KEY` | Azure app setting **and** GitHub Actions repo secret (same value) | authorizes the scheduled pre-cache trigger — deliberately separate from `DATABRICKS_WRITEBACK_KEY` |
| `TYRE_PRICE_TOKEN_EXPIRY_WARNING_DAYS` | Azure app setting (optional, default `14`) | how far ahead the pre-cache job starts failing on an approaching `DATABRICKS_SQL_TOKEN` expiry |

### Token expiry alerting

`DATABRICKS_SQL_TOKEN` is the single point of failure for this feature: when
it lapses, live cache reads and the nightly pre-cache both start failing and
nothing else would say so. The pre-cache endpoint therefore reports a
`tokenExpiry` block, and the GitHub Actions workflow **fails the run** when
the status is `expiring` or `expired`.

That red run is the alert — a warning inside a green run reaches nobody. It
will stay red every night until the token is rotated, which is the intent.
Rotating it (and updating the app setting) clears it.

Two deliberate non-alarms: a `no-expiry` token reports OK (nothing to
action), and `unknown` only prints a notice — listing tokens is a separate
permission from using the warehouse, so a 403 there is common and says
nothing about whether the sync itself works. The check never throws; it
can't break the job it's attached to.

See `api/local.settings.json.example` for local-dev placeholders.

## One-time Databricks setup

In `repairer_network_databricks/notebooks/`:

1. **`setup_tyre_price_tables.py`** — creates the two tables and applies the
   service principal's table grants (`USE CATALOG`/`USE SCHEMA` plus
   `SELECT, MODIFY` on just those two tables — nothing else in
   `sandbox.oliver_oakes` becomes reachable). Set
   `SERVICE_PRINCIPAL_APPLICATION_ID` in its Config cell; if the SP doesn't
   exist yet, leave the placeholder and the grants cell skips cleanly, then
   re-run once it does. Idempotent throughout.

   Two things it *can't* do, because they aren't SQL-grantable: `CAN USE` on
   the SQL Warehouse (UI → SQL Warehouses → your warehouse → Permissions) and
   the SP's **Databricks SQL access** entitlement. The notebook header also
   carries the admin API call that mints the token itself, since the UI
   generally won't issue a PAT on behalf of a service principal.

2. **`smoke_test_tyre_price_sql_api.py`** — run this *before* setting the
   `DATABRICKS_SQL_*` app settings. It sends the exact statements the app
   sends, using the app's own token, so a failure tells you the client's SQL
   shape or the SP's grants are wrong rather than leaving you to guess
   between that and the Azure config. Use the SP's token, not your own — a
   personal token would sail through even if the SP's grants are wrong,
   which is the failure this is here to catch.

Only then set the `DATABRICKS_SQL_*` app settings.

## Deployment notes (pre-cache schedule)

`.github/workflows/tyre-price-precache.yml` starts `workflow_dispatch`-only.
Trigger it manually once, confirm the Databricks tables are populated and
the run completes in a reasonable time, then uncomment its `schedule: cron`
line — same "manual first" discipline used for this project's Databricks
notebooks.

## Not yet built (explicit MVP scope)

- **Reg → tyre size**: `api/src/lib/tyrePrice/regToSize.ts` is a stub —
  DVLA VES gives make/model, not tyre size, and no real provider is wired
  up. Always returns "not-implemented"; the interface is stable so a real
  provider can be slotted in later with no caller-side refactor.
- A third+ retailer — see "Adding a new retailer adapter" above.
