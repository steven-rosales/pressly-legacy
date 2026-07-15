# Operator Workspace and Live Sync Checkpoint

Date: 2026-07-15
Domain: laundry-production
Topic: shift actionability, physical completion, and live workspace refresh
Status: documentation and memory checkpoint; comprehensive acceptance pending

## Source

- Current shared worktree under `/home/steven/pressly`.
- Laundry-production memory v6 and its bounded context pack.
- Completed `lpms-run-centered-online-scheduling` work.
- Active `lpms-production-readiness` work, still stopped at `H1`.
- The prior conversation decisions that backend state owns shift/run identity,
  physical truth is operator-confirmed, and Processor timer polling should be
  removed.

## Evidence Boundary

The code paths and focused tests below were inspected. This session does not
claim that their complete commands, root acceptance, composed Docker proof, or
a 15-order production run have passed on the final checkout.

Read-only local SQL currently records 15 scheduled orders totaling 800.000
pounds and 34 declared bags at `pressly-one`. That aggregate is runtime context,
not production-run proof, and no live row was changed to collect it.

The candidate delta must remain proposed until the active work package records
that evidence.

## Confirmed Implementation Facts

### Shift planning window

`modules/policy/production/src/shift-planning-window/shift-planning-window.policy.ts`
currently applies these boundaries:

- Compute and Accept are rejected at or after shift end.
- Start is rejected before shift start and at or after shift end.
- Invalid shift windows are rejected.

Create, Accept, and Start invoke this policy inside their application flow.

### Versioned pre-start shift changes

`modules/business/production/src/manage-production-shift/` currently:

- persists start, end, and effective folder count together;
- compares the expected shift version;
- serializes through the location scheduling lock;
- records one idempotent `production_shift_updated` work event;
- supersedes the current schedule after a material change;
- preserves the current schedule after a no-op;
- rejects changes when the shift is closed or already owns a production run.

This turns folder count into an authoritative shift fact instead of temporary
Processor state.

### Actionable plan versus history

`modules/business/production/src/load-production-workspace/` currently treats
a schedule as actionable only when:

- its shift exists, is open, and has not ended;
- its status is draft or accepted; and
- no production run uses that schedule as provenance.

The Processor classifies a run-owned, closed, or expired shift as history.
Explicit `/schedule/:shiftId` remains a read-only historical resource. Implicit
`/schedule` can load a fresh planning context for waiting work rather than
reusing a completed shift.

The root, legacy query, and unknown paths render a bounded not-found state.
They do not redirect automatically; the operator explicitly chooses whether to
open scheduling.

### Final production closure

`modules/business/production/src/advance-production-stage/` currently closes
the physical happy path in one transaction when folding/packaging completes:

- stage and assignments complete;
- affected orders and bags finish;
- active batch memberships deactivate without deleting history;
- the batch finishes;
- the run completes when every batch is finished;
- the shift closes when its run is complete.

Affected-row assertions reject partial terminalization.

### Early physical completion

The stage-transition policy computes the effective completion boundary as the
later of:

```text
planned stage end
actual stage start + planned pulse duration
```

Before that boundary, completion returns `confirmation_required`. The
confirmation hash binds location, stage, actor, expected stage version, actual
start, planned end, effective boundary, duration, and observation time.

A valid confirmation records early-completion audit facts. It does not alter
downstream planned windows, and the next stage still cannot start before its
planned boundary.

### SSE invalidation

Migration `0017_production_live_revisions` currently:

- adds a durable per-location `live_revision`;
- backfills it from existing location work-event counts;
- advances it after each inserted production work event; and
- publishes the committed revision through PostgreSQL notification.

The API subscribes before it reads the initial revision, buffers a concurrent
change, and exposes authenticated, location-authorized `ready`, `change`, and
`resync` SSE events.

The Processor uses the stream only to invalidate. It coalesces refreshes and
reloads the authoritative workspace or board through ordinary HTTP reads.
Visibility, connectivity, route changes, and request cancellation bound its
connection and read lifecycle.

### Intentional Worker polling

The private Worker still polls the durable webhook inbox by design:

- one pass claims leased work;
- an empty pass waits for the configured interval;
- failures use bounded exponential backoff;
- heartbeat continues independently of browsers;
- backlog age and pending count are two gauges from one slower aggregate
  sample.

This is ingestion job claiming, not Processor production-state polling. The SSE
decision does not remove or replace it.

## Decisions

- Use SSE as a loss-tolerant invalidation channel, never as a second production
  state model.
- Keep explicit post-command refresh because mutation completion and UI
  navigation still require an authoritative snapshot.
- Treat run provenance, shift status, and shift time as the source of schedule
  actionability.
- Present run-owned, closed, and expired shift contexts as history.
- Keep root, legacy query, and unknown paths invalid until the operator chooses
  a real resource route.
- Permit early physical completion only through an explicit current
  confirmation while preserving the fixed-pulse downstream schedule.
- Keep Worker inbox polling because it is the bounded durable-work execution
  mechanism.

## Preserved Assumptions

- Existing owner/admin roles still act as laundry-production managers in v1.
- Queued unfreeze is still assumed to be owner/admin-only.
- Cents pricing remains an estimated-weight source pending operational
  calibration.

This checkpoint does not raise their confidence.

## Open Questions

- Exception effects remain unresolved: holds, cancellation, rewash, damage,
  missing bags, breakdowns, and reassignment.
- Floor authority for owner/admin manager mapping remains unconfirmed.
- Queued-unfreeze authorization remains unconfirmed.
- Live Cents retry behavior, stable store identifiers, reconciliation support,
  and optional source IPs remain in production-readiness `H1`.
- Alert recipients and production thresholds remain operator-owned setup.

## Candidate Memory Deltas

- Add shift planning-window and pre-start shift-change invariants.
- Make schedule actionability explicitly run-provenance-aware.
- Clarify that pulse occupancy is a scheduling reservation while early physical
  completion is confirmable without downstream pull-forward.
- Add atomic final run/shift closure.
- Deprecate the SSE-deferral and Processor-polling decisions.
- Add revision-based SSE invalidation and intentional Worker inbox polling.
- Keep all existing operational assumptions and production-readiness gates
  unresolved.
