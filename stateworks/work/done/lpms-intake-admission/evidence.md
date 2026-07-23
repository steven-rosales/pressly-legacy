# LPMS Intake Admission Evidence

## T0 — Confirmed model

Status: committed.

Steven confirmed on 2026-07-22 that manual admission leaves Cents unchanged,
is available to owner, admin, and operator roles within their location, and may
be reversed only before selection or production commitment.

The architecture review keeps the workaround as a Production-owned,
source-neutral admission override. This preserves Orders and Cents truth while
placing release, reversal, eligibility, and scheduling concurrency under one
authority.

## T1 — Manual Production admission

Status: committed.

- Added a pure Production policy for manual release and safe reversal.
- Added a versioned, idempotent, actor-audited command under the location
  scheduling lock.
- Added database provenance and a consistency constraint for the manual
  override.
- Preserved the override across lagging unreleased source updates while making
  source withdrawal authoritative.
- Added location-scoped `production:admission` authorization for owner, admin,
  and operator.
- Projected source state, effective Pressly state, and allowed actions from the
  server.

Proof:

- Production policy: 83 tests passed.
- Access control: 26 tests passed.
- Production unit and HTTP: 116 tests passed.
- Production Postgres integration: manual release persisted and reversal after
  open-shift selection was rejected.
- Contracts: 68 tests passed.
- Database: 27 tests passed.
- API: 126 tests passed.

## T2 — Dedicated Intake workspace

Status: committed.

- Added `/intake` to desktop and mobile navigation.
- Removed the intake queue from Schedule and Production rendering.
- Added compact Forecast only, Needs intake, and Ready queues.
- Added source status, customer context, bag intake, priority, manual release,
  and safe reversal controls.
- Kept the Cents state visibly read-only and described manual release as a
  Pressly-only decision.
- Added English and Spanish copy.

Proof:

- Processor: 163 tests passed.
- Route, navigation, adapter, release confirmation, bag-intake, and priority
  interactions passed.
- Local production build served `/intake` with HTTP 200.
- No browser-based visual-fidelity claim was made because browser control was
  not authorized for this task.

## V1 — Repository and runtime verification

Status: committed.

- `pnpm typecheck`: 49 tasks passed across 28 packages.
- `pnpm lint`: 27 tasks passed.
- `pnpm test`: 50 package tasks and all tooling tests passed.
- Architecture boundaries: 68 tests passed.
- Stateworks network validation passed.
- `git diff --check` passed.
- The local Docker stack rebuilt from the changed source; API, Worker,
  Processor, Web, and Postgres reported healthy.
- API readiness returned HTTP 200.
- The local database contains the three override-provenance columns and the
  strict consistency constraint from migration `0029`.

## T3-V2 — Prelaunch Cents order cleanup

Status: committed.

- Added custom data migration `0030_prelaunch-cents-order-cleanup.sql`.
- The fixed cutoff is July 23, 2026 at midnight in America/New_York.
- Selection requires an exact Cents source link and excludes any canonical
  order linked to a non-Cents source.
- The migration removes order-owned source, commercial, demand, intake,
  selection, batch-membership, stage-attempt, and Production rows in
  foreign-key-safe order.
- Canonical users, webhook events, and encrypted webhook quarantine history
  are preserved.
- Bounded table locks prevent the migration from racing active application
  writes; failure to acquire them stops deployment without partial cleanup.
- Later Cents observations may recreate a removed order through the normal
  source-neutral ingestion path.

Proof:

- The complete migration chain applied successfully to the isolated migration
  database.
- The focused Postgres migration test removed one old Cents-only aggregate,
  preserved the exact-cutoff Cents order, a multi-source order, a manual order,
  the shared user, and webhook audit history.
- Reapplying the cleanup removed zero additional rows.
