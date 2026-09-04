# Repairer Network Search

An internal tool for AutoProtect Group claims handlers: search the approved
repairer network by postcode, see results ranked by distance with an
interactive map, restricted to `@autoprotectgroup.co.uk` staff.

- **Frontend**: React + Vite + TypeScript + Tailwind CSS, map via MapLibre GL
  (free, no API key).
- **API**: Azure Functions (Node/TypeScript), colocated under `api/`.
- **Data (today)**: `api/data/repairers.json`, generated from the repairer
  spreadsheet by `scripts/build-data.ts`. Editable in-app via **Manage
  Repairers** — edits are committed back to this file in git (see
  [Data storage](#data-storage-today) below), so no database is needed yet.
- **Removing a repairer**: the network owner can archive one, taking it out
  of Search while keeping the record — see
  [Removing a repairer](#removing-a-repairer).
- **Feedback**: handlers rate repairers 1-5 with an optional note, and
  report whether a repairer negotiated and by how much. Stored in
  `api/data/repairer-feedback.json` on the same GitHub-commit model, and
  documented in `docs/REPAIRER_FEEDBACK.md`.
- **Data (future)**: swap the data source in `api/src/lib/data.ts` for a
  Databricks SQL Warehouse query once a repairer table exists in the
  datalake. See `Databricks_MetaData`'s `catalogs/curated/<schema>/` +
  `INDEX` convention for how that table should be documented there. Keep
  auth exactly as-is — the `@autoprotectgroup.co.uk` restriction must stay
  enforced at this app's login layer, not as Databricks-side row-level
  security with a shared service principal.

## Sensitive data handled deliberately

The source spreadsheet contains bank account numbers, sort codes, VAT
numbers and invoice contacts. **None of that is in this repo or app** —
`scripts/build-data.ts` only extracts operational fields (contact
details, coverage, capabilities, rates). The raw spreadsheet itself must
never be committed here; always run the build script against a local copy
kept outside the repo.

## One-time data build

```bash
npm install
npm run build-data -- /path/to/Repairer_Form.xlsx
```

This extracts/repairs postcodes (falling back to the free-text address
column when the postcode column is blank), strips sensitive fields, and
geocodes every postcode via the free [postcodes.io](https://postcodes.io)
API, writing `api/data/repairers.json`. **Requires normal internet access**
to reach postcodes.io — run it from a machine without restricted network
egress.

As of the last run, 88 of 95 repairers had a usable postcode; 7 need a
postcode entered manually via the **Manage Repairers** screen once the app
is live (the script prints their names). Also worth checking after import:
several phone numbers in the source sheet lost their leading `0` because
the spreadsheet stored them as numbers, not text — spot-check these before
relying on them to call a repairer.

## Local development

Two terminals:

```bash
# terminal 1 - frontend (proxies /api to :7071, see vite.config.ts)
npm install
npm run dev

# terminal 2 - API (requires Azure Functions Core Tools: `npm i -g azure-functions-core-tools@4`)
cd api
npm install
cp local.settings.json.example local.settings.json   # fill in GITHUB_TOKEN etc.
npm run build
npm start
```

Login and the `x-ms-client-principal` header aren't emulated by `func start`
alone; use the [Azure Static Web Apps CLI](https://learn.microsoft.com/azure/static-web-apps/local-development)
(`swa start`) if you need to exercise the login-gated UI locally.

## Azure setup (one-off, per environment)

1. **Create the Static Web App** (Free tier) in the Azure Portal, connected
   to this GitHub repo/branch. If you let the portal create the GitHub
   Actions workflow itself, it adds its own file (named after the app's
   auto-generated hostname) — make sure `api_location` is set to `"api"` and
   `output_location` to `"dist"` in it (the portal's defaults assume no API
   and a Create-React-App-style `build/` output, neither of which matches
   this project), and remove any other Azure SWA workflow file so you don't
   end up deploying to two places.
2. In the Static Web App's **Configuration**, add application settings:
   - `GITHUB_TOKEN` — a fine-grained PAT scoped only to this repo, with
     Contents: Read and write. Used by the Manage Repairers screen to commit
     data edits.
   - `GITHUB_OWNER` = `olioautoprotectgroup`, `GITHUB_REPO` = `repairer_network`,
     `GITHUB_BRANCH` = the branch the Static Web App deploys from.
   - `DATABRICKS_WRITEBACK_KEY` — a random shared secret (not an Azure/GitHub
     credential). Authorizes the two Databricks-side automated jobs (see
     [Databricks integration](#databricks-integration) below) to call
     `POST /api/repairers` and `PUT /api/repair-counts` without a signed-in
     AAD session, via an `x-writeback-key` header. Store the same value as a
     Databricks secret on that side. Not required for the app's normal
     human-facing functionality (search, Manage Repairers) — only for the
     automated jobs.
3. The deployment token secret (`AZURE_STATIC_WEB_APPS_API_TOKEN_...`) is
   added to this repo's GitHub Actions secrets automatically when you
   connect the Static Web App to GitHub through the portal — nothing to do
   here.

**No Entra ID app registration needed, and no `auth` block in
`staticwebapp.config.json` at all.** Azure Static Web Apps' Free tier
rejects *any* deploy that configures a custom identity provider or custom
roles (`rolesSource`) — both are **Standard SKU** features (~$9+/month).
Free tier only has two built-in roles: `anonymous` and `authenticated` (any
successfully logged-in user, any provider, any tenant). So the routes in
`staticwebapp.config.json` just require `authenticated`, and the real
`@autoprotectgroup.co.uk` check happens in application code instead — see
below. This is still a solid gate: nobody can forge a verified
`@autoprotectgroup.co.uk` UPN without a real, DNS-verified AutoProtect Group
account.

**PR preview environments need deleting by hand.** Every pull request gets
its own preview deploy (`...-<pr-number>.westeurope.7.azurestaticapps.net`),
and Azure's generated workflow normally tears that down when the PR closes.
That teardown job has been removed, because it cannot succeed against this
app — with the deployment token supplied it fails on the content server's
"No matching static site found", an open upstream issue with no fix
([Azure/static-web-apps#1638](https://github.com/Azure/static-web-apps/issues/1638));
the reasoning is commented in the workflow. So delete old ones under
**Environments** in the Static Web App in the portal: the Free tier caps how
many can exist at once, and once that cap is reached new PR preview deploys
start failing.

## How access control works

- Login goes through Azure Static Web Apps' built-in AAD provider
  (`/.auth/login/aad`) — free, but not scoped to any particular tenant, so
  any Microsoft account can reach the login screen and get the built-in
  `authenticated` role that every route requires.
- The actual domain restriction happens in two places, both reading the
  `x-ms-client-principal` header SWA attaches to every request once a user
  is logged in:
  - **Server-side (the real enforcement)**: `api/src/lib/auth.ts`'s
    `isAuthorizedStaff()` is checked at the top of `search` — a logged-in
    user from outside `@autoprotectgroup.co.uk` gets a 403 from every
    endpoint.
  - **Client-side (UX only)**: `src/App.tsx` shows an "access restricted"
    screen instead of the app for the same reason, so an unauthorized user
    doesn't just see the app fail silently against 403s.
- **Manage Repairers is restricted further, to one person.** Search is for
  the whole domain; adding and editing repairers is not. The allowed
  addresses live in `REPAIRER_MANAGERS` in `api/src/lib/auth.ts`
  (`isAuthorizedRepairerManager()`, gating `repairers`
  list/create/update — again the real enforcement) and in a hand-synced
  copy of the same list in `src/App.tsx`, which hides the nav link and
  serves an explanatory page on `/manage` instead of the editor. Everyone
  else on the domain gets a 403 from those three endpoints. To grant
  someone access, add their address to **both** lists — the frontend copy
  alone only un-hides a screen whose every request still 403s. The
  Databricks intake-merge job is unaffected: it authorizes
  `POST /api/repairers` with the `x-writeback-key` shared secret, not a
  signed-in identity.
- **Removing a repairer is the network owner's alone**, and is an *archive*,
  not a delete — see [Removing a repairer](#removing-a-repairer) for why.
  `PUT /api/repairers/{id}/archive` gates on `isAuthorizedRepairerManager`
  like the rest of Manage Repairers, and deliberately has no
  `isAuthorizedWriteback` branch: no Databricks job should ever be able to
  take a repairer out of the network.
- **Reviews and discount reports go the other way — deliberately open to
  the whole domain.** Any handler who used a repairer can rate it, so those
  routes gate on `isAuthorizedStaff()`, not the owner check. Two narrower
  rules sit on top: the author is always read from the signed
  `x-ms-client-principal` header and never from the request body (otherwise
  anyone could forge a colleague's review of a named supplier), and while
  authors edit only their own submissions, `isAuthorizedRepairerManager`
  may *delete* anyone's — a route to remove something inaccurate about a
  named business without handing everyone that power. See
  `docs/REPAIRER_FEEDBACK.md`.
- If a Standard-SKU custom Entra app registration (single-tenant, so
  outside accounts can't even reach the login screen) is wanted later for
  belt-and-braces, it's an additive change plus the SKU upgrade —
  `isAuthorizedStaff()` keeps working unchanged either way.

## Data storage (today)

There's no database. Two JSON files under `api/data/` are the source of
truth, both persisted the same way:

| File | Written by | Read by |
|---|---|---|
| `repairers.json` | Manage Repairers, the Databricks intake-merge job, the nightly repair-count sync | search (bundled copy), Manage Repairers (live) |
| `repairer-feedback.json` | any signed-in handler, via the review / discount forms on a repairer card | card aggregates (bundled copy), the feedback panel (live) |

They are deliberately **separate blobs, not one file**. Every write goes
out with the sha it was read at, so same-file writes conflict: a handler
leaving a review at 02:26 would 409 against the nightly repair-count sync.
Different paths mean different shas and no contention at all. Feedback also
stays outside `scripts/build-data.ts`'s blast radius that way — re-running
that script rebuilds `repairers.json` from the spreadsheet and would drop
anything it doesn't know about.

Saving a change in **Manage Repairers** commits it back to this file via the
GitHub API (`api/src/lib/github.ts`), which triggers the existing CI/CD to
redeploy — edits go live for everyone in about a minute (the person who
just saved sees their own change immediately, since the save endpoint
returns the new record directly). Azure Static Web Apps' managed Functions
are deployed read-only, so this can't also write to local disk for
instant same-instance visibility — the GitHub commit is the only
persistence step.

Writes always read the *current* file straight from GitHub right before
merging in an edit (`getCurrentFile()`), never the local copy search/
list use for fast reads — that copy can be stale by design, and building a
"full array" write on top of it would silently erase anyone else's change
made in the meantime. The commit is sent with the sha it was read at, so a
genuine conflict (two saves landing at once) fails with a clear "please
retry" instead of one silently overwriting the other.

Feedback writes are the one exception: an append re-applied to a freshly
re-read file converges on the same result, so those retry once
automatically before surfacing the same message (see
`api/src/lib/feedback/store.ts`). Repairer-list writes deliberately do not
— they replace a whole array built from a snapshot, where a blind retry
could resurrect stale rows.

This keeps everything on already-free services. If
instant writes are ever needed before the Databricks migration, swapping
in Azure Table Storage is
a small, isolated change to `api/src/lib/data.ts`.

## Removing a repairer

Manage Repairers can **archive** a repairer, which is how one is taken out of
the network. An archived repairer disappears from Search — both from the
results and from the "search from this repairer" origin match — but stays in
`api/data/repairers.json` with an `archivedAt`/`archivedBy` stamp, and stays
visible to the network owner in an Archived section with an Un-archive button.

**It is an archive rather than a delete for two concrete reasons**, both of
which a hard delete would trip:

1. The nightly mirror below is a copy of `repairers.json`, and the
   intake-merge job anti-joins new Microsoft Forms sign-ups against that
   mirror **by company name**. Delete the row and the repairer's original
   sign-up reads as brand new, so the next intake run POSTs it straight back
   in. That notebook lives outside this repo, so nothing here could stop it.
2. Ids are only unique against what is currently in the file
   (`uniqueSlug`, `api/src/functions/repairers.ts`). A deleted repairer frees
   its slug, so a later create for a similarly named business could take it
   and silently inherit the old repairer's reviews and discount reports,
   which are keyed on that id. Five ids already carry `-2` collision
   suffixes, so same-name creates demonstrably happen.

Keeping the row solves both, and makes a mistaken click one click to undo.
Their reviews and discount reports are kept untouched and come back with them.

Two consequences worth knowing:

- The nightly repair-count sync keeps updating archived repairers. That is
  harmless, and is the point — the id still matches, so the sync doesn't
  start logging unmatched ids that nobody would ever see.
- **Re-running `scripts/build-data.ts` un-archives everything**, because it
  rebuilds the file from the spreadsheet and drops any field it doesn't know
  about. That is the same trap that already wipes `recentRepairCount` and
  `repairCountAsOf`; the script is a one-off import, not a sync.

## Databricks integration

`api/data/repairers.json` (via GitHub) stays the *only* writable source of
truth — nothing below changes that. Three pieces, built incrementally
(see the `Databricks_MetaData` repo's `catalogs/curated/all_purpose/
00_curated_all_purpose_INDEX.md`, "Canonical working views" section, for
the lake-side pointer to this):

1. **Nightly mirror** — a Databricks Job reads this repo's
   `api/data/repairers.json` (read-only PAT, separate from `GITHUB_TOKEN`)
   and writes it to `sandbox.oliver_oakes.repairer_network`, so the data is
   queryable/joinable in the lake without going through this app or GitHub.
   One-way; that table is never written to directly. (Sandbox, not
   `curated`, until/unless it's ever promoted — matches how every other
   Databricks pipeline object feeding this org's tooling starts out.)
2. **New-repairer intake merge** — new repairer sign-ups arrive as
   Microsoft Forms responses exported to Excel. An ad-hoc (manually
   triggered, not scheduled) Databricks notebook anti-joins the export
   against the mirror by company name, and calls `POST /api/repairers`
   once per genuinely-new row using the `x-writeback-key` header — reusing
   `createRepairer`'s existing geocoding, slug-uniqueness, and sha-safe
   GitHub commit logic unchanged. `api/src/lib/auth.ts`'s
   `isAuthorizedWriteback()` authorizes this alongside the normal
   AAD-authenticated Manage Repairers path.
3. **`recentRepairCount`** — once a validated repairer↔claim join exists in
   the lake (unscoped analyst work, not yet done — see the schema docs), a
   nightly job computes a trailing-window repair count per repairer and
   batches it to `PUT /api/repair-counts` (`api/src/functions/
   repair-counts.ts`, machine-auth only). `null` means "not yet computed,"
   never treat it as zero. These two fields (`recentRepairCount`,
   `repairCountAsOf` in `Repairer`) are deliberately excluded from the
   Manage Repairers form (`RepairerFormValues`) and the create/update
   `RepairerInput` type — they can only ever be set by this sync, never by
   hand. Currently dark-launched: the fields exist in the type/data model
   but nothing in the UI renders them yet.

The full phased plan (cost tradeoffs, the join-key validation prerequisite,
rollout/verification steps) is tracked outside this repo; ask before
building the Databricks-side jobs if you don't have that context.

## Tyre Price Check

A separate feature: lets a claims handler compare a tyre claim's cost
against live/cached retailer prices. Has its own architecture (a live
per-request Databricks connection, server-side retailer scraping adapters
that ship disabled by default pending Legal/Compliance sign-off, a GitHub
Actions cron for pre-caching) — see **[`docs/TYRE_PRICE_CHECK.md`](docs/TYRE_PRICE_CHECK.md)**
for the full write-up, including the legal/ToS notice for the scraping
adapters.
