# LPMS Run-Centered Online Scheduling

## Status

Complete. Tasks T0 through T6 and full acceptance (`V1`) are verified. The
separate controlled production pilot remains stopped at the existing
`lpms-production-readiness` human gate; this work does not advance that gate.

The active `lpms-production-readiness` work remains stopped at its current
human gate. Its historical evidence remains valid for the code it proved, but
its local/RV1 proof must be rerun against this implementation before the pilot
continues.

## Outcome

LPMS has two explicit phases:

1. Before production, immutable plans move through
   `Compute -> Review/Accept -> Start`.
2. After Start, one stable production run per shift accepts new orders through
   deterministic online insertion without silently moving existing work.

Backend and database state own shift, plan, run, queue, and action identity.
The Processor can refresh or restart without losing the route to accepted or
active work.

## Architecture

This is a stateful domain workflow with persistence and concurrency risk, so it
uses the smallest boundary structure that preserves those rules:

- `modules/computation/scheduling` owns pure deterministic pre-start planning
  and post-start insertion decisions.
- `modules/policy/production` owns transition and authorization-independent
  production policy.
- `modules/business/production` owns transactional orchestration, locking,
  idempotency, persistence, and work events.
- Contracts define discriminated command outcomes and boundary validation.
- API and Worker apps compose capabilities; Processor renders backend truth and
  does not recreate lifecycle policy.

No generic workflow engine, event-sourcing platform, queue abstraction, or
solver framework is introduced.

## Durable Model

### Schedule revisions

- `schedule_runs` remain immutable proposals with snapshots and hashes.
- A shift has at most one current `draft|accepted` revision.
- Compute always creates a new revision, supersedes the previous current
  revision, and clears acceptance. Command idempotency handles retries.
- Accept stores actor, timestamp, output hash, and acknowledged warnings only.
- Acceptance creates no execution rows and changes no order to scheduled.

### Production run

- A production shift has exactly one `production_run` at most.
- Start is the only command that creates it, directly in started execution.
- Start atomically creates initial batches, stages, machine assignments,
  scheduled-order transitions, and a work event.
- Lifecycle `version` remains distinct from positive `queue_version`.
- The run stores projected completion and any overtime acknowledgment bound to
  an exact queue version and proposal hash.

### Batch membership

- Batch execution remains
  `queued -> sorting -> washing -> drying -> folding_packaging -> finished`.
- Membership state is orthogonal: a queued batch is mutable or frozen.
- `membership_frozen_at/by` records explicit physical commitment.
- Starting a batch implicitly and permanently freezes it; every non-queued
  batch is frozen.
- Order membership records `initial_schedule`, `automatic`, or
  `manager_exact` provenance. Exact placement also records durable pin data.

## Migration

The forward migration must fail before mutation if one shift already has
multiple runs or if started execution is internally inconsistent. It never
chooses or deletes execution history silently.

- Convert legacy never-started planned runs back into accepted plans: restore
  their orders to eligible, remove the unstarted execution graph, and preserve
  schedule/work-event audit history.
- Preserve started and completed runs and backfill queue/freeze metadata.
- Supersede non-current schedule revisions deterministically.
- Add one-run-per-shift and one-current-plan-per-shift constraints.
- Clone the latest scheduler configuration per location as
  `fixed-pulse-ffd-v2`; historical v1 rows remain readable.

The database state inspected during planning contained one legacy planned run
and no shift with multiple runs, so it fits the normalization path. Migration
tests must still cover abort and preservation cases independently.

## Business Workflows

### Compute

- Lock the shift and snapshot every currently eligible order.
- Produce deterministic `fixed-pulse-ffd-v2` output.
- Supersede the prior current revision and revoke its acceptance.
- Do not accept `horizonEnd`; all eligible orders participate.

### Accept

- Require the schedule revision to be current and its output hash to match.
- Validate the exact eligible-order snapshot and acknowledged warnings.
- Persist preference only. Orders remain eligible.

### Start

- Require the accepted revision still to be current.
- Revalidate the complete eligible-order snapshot. Any new, removed, or changed
  eligible order requires Compute and Accept again.
- Create the shift's single started run and execution graph atomically.
- Let database uniqueness resolve concurrent Start attempts.

### Live placement

`online-stable-insertion-v1` is a pure sibling computation:

- Priority order: use the earliest feasible mutable queued batch.
- If priority does not fit: create a batch after frozen/in-flight anchors and
  existing priority work, before the remaining ordinary mutable suffix.
- Ordinary order: use the best-fitting mutable queued batch, with earliest
  sequence as the tie-breaker.
- If ordinary does not fit: append a batch.
- Exact manager placement either commits to the requested mutable batch or
  rejects; LPMS never silently substitutes another batch.
- Existing orders never move automatically.
- New batches may shift only the mutable suffix. Frozen and in-flight stage
  windows remain unchanged.
- Rebuild affected planned stage windows and machine assignments from the
  run's accepted resource snapshot.

The computation returns a canonical proposal hash, affected suffix, projected
completion, and overtime outcome.

When demand or bag intake makes an order eligible after Start, Production
immediately attempts automatic placement. A recoverable conflict or required
overtime confirmation does not undo eligibility; the order remains visibly
pending and retryable.

### Membership control

- An employee can explicitly freeze a queued batch.
- Starting a batch implicitly freezes it.
- Owner/admin may explicitly unfreeze a still-queued batch with confirmation
  and audit; this is an implementation assumption pending floor confirmation.
- A non-queued batch can never be unfrozen.

### Concurrency and overtime

- Queue-changing commands lock the run, compare `queue_version`, and increment
  it once.
- Freeze, unfreeze, placement, stage transition, and completion use the same
  run-first lock order.
- Hard pulse capacity can never be overridden.
- Overtime first returns `confirmation_required` with proposal hash and queue
  version.
- Owner/admin confirmation recomputes under lock and commits only when both
  still match. Any intervening queue change makes it stale.

## Public Contract

- `POST /production/locations/:locationId/schedules` accepts shift ID,
  scheduler-config ID, and idempotency key; it no longer accepts `horizonEnd`.
- `POST .../schedules/:scheduleRunId/accept` returns accepted schedule identity
  and timestamp, never production-run IDs.
- `POST .../schedules/:scheduleRunId/start` creates execution and returns run
  ID, initial batch IDs, and queue version.
- `GET .../workspace?shiftId=:shiftId` honors explicit scope. Without it, the
  endpoint uses one unambiguous started run or accepted plan and otherwise
  returns candidate shifts.
- `GET .../runs/:productionRunId/board` replaces shift-based latest-run lookup.
- Versioned commands cover automatic-placement retry, manager-exact placement,
  freeze, queued-only unfreeze, and overtime-confirmed placement.

Workspace and board contracts expose current-plan status, active-run
candidates, queue version, membership freeze, placement pin/provenance,
projected completion, overtime state, pending eligible orders, and placement
previews.

## Processor

- Render one server-derived `Compute -> Review/Accept -> Start` block.
- Remove local acceptance/shift ownership and timestamp-driven remounts.
- Persist `shiftId` for scheduling and `runId` for the board in the URL.
- Await mutation refresh before navigation.
- Show pending arrivals, placement outcomes, frozen membership, exact-batch
  selection, and overtime confirmation on the board.
- Operators can freeze and retry automatic placement. Owner/admin can Accept,
  Start, unfreeze, place exactly, and confirm overtime.
- Refresh after every command and poll a visible online workspace every ten
  seconds. Do not add SSE.

## Delivery Graph

```text
T0 memory/baseline reconciliation
 |-- T1 contracts, schema, and migration
 `-- T2 pure scheduling and production policies
      T1 + T2 -> T3 pre-start lifecycle
      T3 -> T4 live queue workflows
      T4 -> T5 API, workspace, and Processor
      T5 -> V1 full verification
      V1 -> T6 documentation, evidence, and implementation memory
```

## Verification

- Pure computation tests cover deterministic global planning, all-eligible
  input, priority/ordinary placement, batch creation position, frozen anchors,
  exact rejection, no existing-order movement, suffix reprojection, and
  overtime hashing.
- Policy and contract tests cover lifecycle preconditions, membership legality,
  capacity, discriminated outcomes, role boundaries, and malformed input.
- Database/integration tests cover constraints, migration normalization and
  aborts, recompute revocation, Accept without execution, concurrent Start,
  input drift, queue conflicts, freeze races, completion races, pins, and stale
  overtime confirmation.
- Processor tests cover refresh durability, recompute revocation, run-ID
  navigation, pending arrivals, expected versions, conflict refresh, and stale
  overtime confirmation.
- Docker end-to-end proof covers Cents-shaped demand, intake with priority,
  automatic placement, freeze, all four pulse stages, and run completion.

## Explicit Defaults and Deferred Work

- Automatic placement is the default; hard/recoverable failures and overtime
  confirmation leave the order pending.
- Existing owner/admin roles act as managers; no new authorization role ships.
- V1 uses an exact-batch selector, not drag-and-drop or pagination.
- No 40-percent large-order threshold and no probabilistic stability score.
- No automatic repacking, silent live optimizer, SSE, full event sourcing,
  split orders, or new exception workflows.

## Done Means

- Refreshing the Processor cannot lose accepted-plan or active-run identity.
- Accept creates no execution; Start creates one and only one run per shift.
- A changed eligible-order set blocks stale Start.
- Post-start arrivals are placed deterministically without moving existing
  orders, or remain visibly pending with an explicit reason.
- Freeze, exact placement, capacity, queue-version, and overtime rules hold
  under concurrency.
- The coordinated migration/API/Worker/Processor release passes package,
  architecture, database, Processor, Docker, and Stateworks verification.
- Canonical LPMS documentation and implementation-backed memory are updated
  only after verification succeeds.
