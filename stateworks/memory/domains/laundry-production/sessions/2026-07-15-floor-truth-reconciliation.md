# Floor Truth Reconciliation Checkpoint

Date: 2026-07-15
Domain: laundry-production
Topic: advisory stage windows, confirmed early starts, and recovery after reconnect
Status: implementation checkpoint; full verification pending

## Source

- Current shared worktree under `/home/steven/pressly`.
- Laundry-production memory v7 and its bounded context pack.
- Completed `lpms-run-centered-online-scheduling` and
  `lpms-operator-workspace-live-sync` work.
- Active `lpms-production-readiness` work, still stopped at its existing human
  gate.
- Product decision: planned stage windows coordinate the floor, while an
  operator owns truthful reporting of what physically happened.

## Evidence Boundary

The implementation paths and focused tests listed below were inspected. This
session does not claim that the final focused suites, database integration,
root acceptance, Docker end-to-end proof, deployment, or pilot have passed on
the final checkout.

The candidate memory delta must remain proposed until the active work package
records the full proof. `memory.yaml` remains version 7 and `context-pack.md`
must not be regenerated from these candidate facts yet.

## Confirmed Implementation Facts

### Planned windows and early starts

`modules/policy/production/src/stage-transition/stage-transition.policy.ts`
preserves planned stage windows as forecasts and resource reservations. It
continues to enforce predecessor completion, one active batch per stage kind,
machine availability, and other hard transition constraints.

When a start is otherwise valid but the observation time is before
`planned_start_at`, policy returns `confirmation_required` with
`PLANNED_START_NOT_REACHED`. The confirmation does not modify either planned
boundary.

`modules/business/production/src/advance-production-stage/stage-start-confirmation.policy.ts`
binds that confirmation to location, stage, actor, expected stage version,
planned timing, and observed time. The normal advance use case revalidates the
proof under lock and records early-start audit facts in the ordinary
`stage_started` work event.

The Processor renders the review through
`apps/processor/src/features/production-board/early-stage-start-dialog.view.tsx`.
It shows the planned time and remaining interval, says the plan will remain
unchanged, and makes the operator choose **Not yet** or **Start now**.

Early completion remains independently confirmation-bound. After a recovery
has left an actual start unknown, completion policy can still record the
operator-confirmed current completion rather than requiring an invented start
time.

### Boundary provenance

`packages/db/src/migrations/0018_stage_boundary_provenance.sql` and
`packages/db/src/schema/laundry-production.schema.ts` add paired provenance
for actual start and end boundaries:

```text
live_observed
operator_reported
not_recorded
```

A null boundary pairs with `not_recorded`; a recorded boundary cannot be
`not_recorded`. Normal live stage commands write `live_observed`.
`operator_reported` reserves an explicit future workflow for an operator who
supplies an actual time. The current recovery command does not infer that time
from a selected milestone.

### Forward floor reconciliation

The separate command contract is defined in
`packages/contracts/src/production/production.contracts.ts` and exposed as:

```text
POST /production/locations/:locationId/runs/:productionRunId/
  batches/:productionBatchId/progress-reconciliation
```

The request carries the expected run queue version, batch version, exact four
stage versions, a strictly later target milestone, reason, optional note,
machine identifiers for an active washing or drying target, optional
confirmation hash, and idempotency key. Reason `other` requires a note.

The pure policy under
`modules/policy/production/src/progress-reconciliation/` requires:

- a started run and its canonical four-stage graph;
- a coherent current projection with a completed prefix and at most one active
  stage;
- a strictly forward target;
- no concurrent active batch of the target stage kind; and
- machine selection for a target that leaves washing or drying active.

The business use case under
`modules/business/production/src/reconcile-production-batch-progress/` locks
the run, batch, and stages in canonical order and compares every supplied
version. It also invokes the existing machine-assignment policy, so machine
compatibility, active status, non-overlap, and effective capacity remain hard
constraints.

Without a confirmation hash, the use case returns the exact projected effects
and a canonical proposal hash. Confirmation recomputes under lock and commits
only if the hash and versions remain current. The hash binds actor, location,
run, batch, current and target milestone, reason, note, selected machines,
versions, and effects.

### Projection, history, and terminalization

Stage rows remain the current operational projection. One accepted recovery
updates that projection atomically and appends one
`batch_progress_reconciled` work event. It does not synthesize a misleading
sequence of `stage_started` and `stage_completed` events.

For skipped work, actual timestamps remain null with `not_recorded`
provenance. The reconciliation event records who asserted the new milestone,
why, the prior and target state, machines selected for a currently active
stage, and boundary provenance. Historical machine use that was not recorded
also remains unknown. A machine assignment that existed only as the skipped
stage's mutable plan is removed rather than relabeled as completed actual use;
the immutable schedule and stage window retain the plan. A known active
assignment is retained when reconciliation completes its stage.

When reconciliation first moves a queued batch forward,
`production_batches.started_at` is set to the reconciliation commit time. It is
the lifecycle anchor for when LPMS recorded the batch as non-queued, not a
reconstructed physical start timestamp. The skipped stage boundary remains
null with `not_recorded` provenance.

Migration `0019_production-batch-lifecycle-timestamps` repairs only this known
legacy gap from the existing membership-freeze or update lifecycle anchor,
aborts on ambiguous timestamp contradictions, and then enforces queued,
non-queued, and finished timestamp presence at the database boundary.

`modules/business/production/src/persistence/complete-production-batch.ts` is
shared by normal final-stage completion and reconciliation to `finished`.
Therefore both paths terminalize affected assignments, orders, bags, active
memberships, the batch, and, when appropriate, the run and shift with the same
affected-row checks.

Migration `0017_production_live_revisions` advances one live revision per work
event. Since reconciliation emits one work event, it causes one SSE
invalidation. The streamed revision remains an invalidation hint; the
Processor reloads the authoritative board over HTTP.

### Product experience

`apps/processor/src/features/production-board/floor-progress-reconciliation.view.tsx`
uses a responsive sheet titled **Record floor progress**. The operator selects
a batch, later milestone, reason and note, and machines only where required.
The first submission previews the exact effects. The confirmation step states
that queue, batch, and four stage versions will be rechecked before commit.

The experience explicitly says planned times stay unchanged and missed times
remain unrecorded. After success or conflict, the board refreshes from the
authoritative server projection.

This is recovery after reconnect. It is not a PWA or an offline-first command
system: no physical command is queued in the browser, no success is predicted
while disconnected, and no command log is replayed later.

## Decisions

- Planned stage windows are coordination forecasts and resource reservations,
  not hard assertions that physical work occurred at their boundaries.
- An otherwise-valid early start requires an actor-, version-, and timing-bound
  confirmation and preserves the accepted plan.
- Missed floor progress uses one narrow, atomic, forward-only batch command
  instead of replaying fictional stage transitions.
- Current projection and audit history remain separate: stage rows say where
  the batch is now; one work event says that an operator reconciled it.
- Unknown timestamps and historical machine use stay unknown.
- Floor recovery preserves all existing stage, machine, capacity, concurrency,
  idempotency, and terminalization invariants.
- One recovery transaction produces one work event and one SSE invalidation.

## Explicit Deferrals

- Backward correction and reopening completed stages, batches, runs, or shifts.
- A true offline command queue, PWA, conflict-replay protocol, or predicted
  offline success.
- Concurrent execution of more than one batch in the same stage kind.
- Synthetic reconstruction of missed stage timestamps or machine assignments.

These need separate state and conflict models. They are not hidden inside the
forward recovery command.

## Preserved Questions and Gates

- Holds, cancellations, rewash, damage, missing bags, breakdowns, and
  reassignment remain unresolved exception workflows.
- Owner/admin manager mapping and queued-unfreeze authorization remain
  operational assumptions.
- The separate production-readiness work remains stopped at its existing Cents
  and production setup gate.
- Full implementation verification and the v7-to-v8 memory application remain
  pending in `lpms-floor-truth-reconciliation`.
