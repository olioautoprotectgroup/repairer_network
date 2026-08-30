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
- **Retailer adapters**: `api/src/lib/tyrePrice/adapters/{halfords,kwikfit}.ts`,
  one file per retailer, each isolated behind its own feature flag and never
  throwing — a failure always resolves to a status, never an exception that
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

The Halfords and Kwik Fit adapters in `api/src/lib/tyrePrice/adapters/`
retrieve publicly published retail prices from those retailers' own
consumer websites for internal claims-benchmarking purposes only. No
scraped content is republished externally or resold, and no attempt is
made to bypass authentication, paywalls, or technical access controls.

**Both adapters ship disabled by default** (`TYRE_PRICE_HALFORDS_ENABLED` /
`TYRE_PRICE_KWIKFIT_ENABLED` unset) and must not be enabled in any
environment until AutoProtect Group's Legal/Compliance function has
reviewed the specific retailer(s)' current Terms of Service and
`robots.txt`, and given written sign-off for this specific use case. Each
adapter respects the target site's `robots.txt` at request time, applies a
conservative per-retailer rate limit, uses a self-identifying User-Agent
(not a browser-mimicking one — see `config.ts`), and treats a 403/429
response as an immediate, non-retried "unavailable" result rather than
attempting to work around it.

If a retailer's Terms of Service change, or the retailer objects to this
traffic, the relevant flag must be turned off immediately (an Azure
app-setting change, no redeploy required) pending re-review. As an
FCA-regulated firm, no scraped or estimated price is ever fabricated or
extrapolated when a source is blocked or fails — the UI shows "source
unavailable" instead, so a claims handler is never shown pricing data that
didn't actually come from a live or freshly cached retailer response.

**Before either flag is ever turned on**, the person doing the compliance
review must also capture real search-result HTML from the live site and
update `adapters/{halfords,kwikfit}.ts`'s selectors (and the fixtures in
`adapters/__fixtures__/` + their tests) to match — the selectors shipped
here are placeholders matched against synthetic fixtures, not verified
against either retailer's real markup (this environment has no way to
responsibly capture that).

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
   `halfords.test.ts`/`kwikfit.test.ts` for the pattern).
6. Get Legal/Compliance sign-off on that retailer's ToS/robots.txt before
   ever setting its flag to `"true"` anywhere.

## Running parser tests

```
cd api && npm test
```

Runs the full Vitest suite: pure logic (`varianceCalc`, `tierMap`), the
cache layer against a **mocked** Databricks client (no real Databricks
calls in CI), both adapters against their saved HTML fixtures, and the
fitter lookup against canned Overpass JSON (no real Overpass call).

## New secrets

| Name | Where | Purpose |
|---|---|---|
| `DATABRICKS_SQL_HOST` | Azure app setting | Databricks workspace hostname |
| `DATABRICKS_SQL_WAREHOUSE_ID` | Azure app setting | id of a dedicated **serverless SQL Warehouse with auto-stop** |
| `DATABRICKS_SQL_TOKEN` | Azure app setting (secret) | New, narrowly-scoped service-principal token: `CAN_USE` on the one warehouse above, read/write on only `tyre_price_cache`/`tyre_price_lookup_log` — not a reused/broader credential |
| `TYRE_PRICE_CACHE_TTL_HOURS` | Azure app setting (optional, default `24`) | cache staleness window |
| `TYRE_PRICE_VARIANCE_THRESHOLD_PERCENT` | Azure app setting (optional, default `20`) | "review" flag threshold |
| `TYRE_PRICE_HALFORDS_ENABLED` / `TYRE_PRICE_KWIKFIT_ENABLED` | Azure app setting (unset = off) | per-retailer kill switch |
| `TYRE_PRICE_PRECACHE_KEY` | Azure app setting **and** GitHub Actions repo secret (same value) | authorizes the scheduled pre-cache trigger — deliberately separate from `DATABRICKS_WRITEBACK_KEY` |

See `api/local.settings.json.example` for local-dev placeholders.

## One-time Databricks setup

Run `repairer_network_databricks/notebooks/setup_tyre_price_tables.py`
once (manually, "Run all") to create the two tables above, before setting
the `DATABRICKS_SQL_*` app settings.

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
