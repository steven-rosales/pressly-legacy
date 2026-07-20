# LPMS Shift Order Selection Evidence

## T0 — Confirmed model and baseline

Status: committed.

Steven confirmed on 2026-07-19 that pre-release intake is allowed but cannot
make an order schedulable; `IN_PROGRESS` still requires intake; selection is
shift-scoped and initially empty; and a post-Start arrival requires explicit
manager placement.

## T1 — Release-gated production admission

Status: committed.

- Production policy now projects expected and inbound demand as
  `release_pending`, including when physical intake already exists.
- Only `production_released` demand with a positive estimate and recorded bag
  count becomes `eligible`; released demand without intake remains
  `intake_pending`.
- Intake can preserve pre-release physical truth without bypassing the release
  gate. Source revisions continue to preserve scheduled or finished LPMS work.
- Order Control presents pre-release intake as "Waiting for Cents IN_PROGRESS"
  in English and Spanish.

Proof:

- Production policy: 77 tests passed.
- Production unit: 107 tests passed.
- Worker Cents projection: 33 tests passed.
- Contracts: 65 tests passed.

## T2 — Versioned shift selection and exact snapshots

Status: committed.

- Migration `0023_lpms-shift-order-selection.sql` adds versioned shift
  selection metadata and location-bound selected-order membership.
- Selection replacement is one idempotent, audited, manager-authorized
  transaction under the location scheduling lock.
- A material selection change increments the selection version and supersedes
  the current draft or accepted plan; an exact no-op preserves both.
- Compute reads only selected ready orders. Accept and Start revalidate the
  same selected order IDs and immutable order snapshots.
- New, unselected eligible arrivals do not invalidate an accepted plan.
- The migration applied on a clean temporary database and the existing local
  development database. Its foreign-key/index ordering is guarded by a schema
  test.

Proof:

- Production Postgres integration: 19 tests passed across 10 files.
- Database unit and schema safety: 18 tests passed.
- API: 126 tests passed, including the LPMS happy path.
- Architecture boundaries: 58 tests passed.

## T3 — Explicit scheduling and live-placement UX

Status: committed.

- Schedule starts with no selected orders and exposes per-order checkboxes,
  selected count and weight, `Select all ready`, and `Clear`.
- Compute is disabled for an empty or stale selection and names the corrective
  action. Selection persistence is immediate once a shift exists.
- Only ready candidates appear in executable scheduling. Forecast-only demand
  remains available through Demand outlook and read-only Order Control.
- Post-Start arrival copy now says `Add to run`; the command requires manager
  override authorization and no webhook or intake path places it silently.
- English and Spanish copy uses the existing Processor components, spacing,
  typography, badges, alerts, and semantic colors.

Proof:

- Processor scheduling: 16 tests passed.
- Processor shift-window interaction: 9 tests passed.
- Processor full run: 156 tests passed and one existing production-board test
  hit the global 5-second timeout under suite load; that exact test then passed
  in isolation in 0.57 seconds.
- Relevant source trees pass Prettier and all six affected packages pass lint.
- Processor, API, Worker, Contracts, DB, and Production TypeScript checks pass.
  Production was checked with `--composite false --incremental false` because a
  source-mounted Docker watcher owns generated `dist` files and the package
  script cannot overwrite them.

## V1 — Runtime and environment boundaries

Status: committed.

- The local Processor dev server returned HTTP 200 at
  `http://localhost:4174/`.
- Chrome visual inspection was attempted, but its extension session was not
  available. No screenshot-based visual claim is made; executable component,
  interaction, accessibility, localization, and responsive tests are the UI
  proof for this run.
- No production database, deployment, webhook, secret, or customer payload was
  changed.
- No new environment variable is required. A production deploy must execute
  migration `0023` before the new API receives traffic.

## T4 — Durable policy reconciliation

Status: committed.

- The implementation-backed memory delta deprecates lagging-source admission
  and all-eligible planning.
- It records release-gated readiness, explicit shift selection, exact selected
  snapshots, and explicit post-Start manager placement.
- The completed package and laundry-production memory validate after applying
  the delta and regenerating the context pack.
