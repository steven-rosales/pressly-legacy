# LPMS Operator Workspace and Live Sync

## Status

Complete documentation and memory checkpoint.

The shared worktree contains the implemented behavior and focused tests
recorded here. Focused, integration, end-to-end, root, and read-only runtime
verification passed. The laundry-production v7 delta is applied and its bounded
context pack is regenerated.

The separate `lpms-production-readiness` work remains stopped at `H1`. This
work does not confirm live Cents behavior, configure secrets, deploy, or
authorize a production pilot.

## Outcome

Record the implemented model by which the Processor follows durable production
state and floor intuition:

1. Planning uses real resource paths and never reuses historical shifts as
   mutable work.
2. Shift timing and folder-count changes are versioned pre-start facts that
   revoke a stale plan.
3. Early physical completion is recordable through an explicit, auditable
   confirmation without compressing the planned pulse pipeline.
4. Production changes invalidate the Processor through SSE instead of timer
   polling.
5. The private Worker continues bounded durable-inbox polling because that is
   job claiming, not UI synchronization.

## Business Rules

### Shift planning window

- Compute and Accept are legal before the shift ends.
- Start is legal only after the shift begins and before it ends.
- A run-owned, closed, or expired shift is history, not a mutable planning
  context.
- An accepted schedule is actionable only while its shift is open, unexpired,
  and the schedule has not become production-run provenance.

### Pre-start shift changes

- Shift start, end, and effective folder count are persisted together.
- Updates compare the shift version and use normal command idempotency.
- A material change supersedes the current schedule and revokes acceptance.
- A no-op update preserves the current schedule.
- A shift cannot be changed after its production run exists.

### Stage completion

- The scheduler still reserves one full pulse for every stage.
- A stage cannot start before its planned boundary.
- Before the later of planned end and actual start plus one pulse, completion
  first returns `confirmation_required`.
- Confirmation is bound to location, stage, actor, stage version, and observed
  timing. A stale confirmation cannot commit.
- Confirmed early completion records physical truth and audit data. It does not
  move a downstream stage before its planned boundary.
- Completing the last folding/packaging stage terminalizes the affected floor
  facts and closes the run and shift when every batch is finished.

## Live Synchronization

Every committed production `work_event` advances a durable location revision
in the same transaction. PostgreSQL notification is a wake-up hint; it is not
the state authority.

The API exposes one authenticated, location-authorized SSE stream. The
Processor subscribes while visible and online, coalesces invalidations, and
reloads the ordinary workspace or board read model. Initial connection,
reconnection, and upstream-listener recovery all force an authoritative
refresh.

No production entity is reconstructed from SSE payloads.

## Worker Distinction

The Worker intentionally polls the durable webhook inbox:

- one claim pass handles available leased work;
- an empty pass waits for the configured interval;
- loop failures use bounded exponential backoff;
- backlog age and pending count are two gauges from one aggregate sample, not
  evidence of a second worker poll.

Replacing Processor state polling with SSE does not change this ingestion
mechanism.

## Processor Navigation

The Processor uses resource paths:

```text
/schedule
/schedule/:shiftId
/production
/production/:runId
/configuration
```

Query parameters do not own workspace navigation. An explicit historical
shift path remains read-only. Planning a new shift returns to `/schedule` and
loads a fresh backend context.

Root, legacy query, and unknown paths remain invalid until the operator chooses
the explicit **Open scheduling** action. They are not silently redirected.

## Delivery Graph

```text
T0 checkpoint and memory baseline
 -> T1 shift and stage lifecycle evidence
 -> T2 live-sync and Worker distinction evidence
 -> T3 route, history, and documentation-drift evidence
 -> V1 existing focused and repository verification
 -> V2 read-only local runtime snapshot
 -> T4 v7 memory acceptance and application
```

## Evidence Boundary

The checkpoint proves the recorded behavior through focused, integration,
end-to-end, root static/build, Stateworks, and read-only composed-runtime
verification. The local runtime aggregate contains 15 scheduled orders totaling
800 pounds and 34 declared bags.

That aggregate is read-only checkpoint evidence. This work does not submit,
intake, schedule, start, advance, or complete those orders.

It does not prove:

- a rebuilt Processor container containing the final invalid-route fallback;
- completion of the current 15-order, 800-pound, 34-bag dataset as a production
  run;
- live vendor, cloud, alert-routing, deployment, or pilot behavior.

## Done Means

- Every checkpoint claim names its current code or test source.
- Existing focused and repository verification is recorded after the scoped
  invalid-route fallback correction; verifier failures do not authorize
  unrelated application repair.
- Local Docker, database, Worker, and SSE facts are observed read-only.
- The 15-order, 800-pound, 34-bag aggregate is never represented as a completed
  production-run proof.
- Memory v7 and its regenerated context pack agree with the applied,
  implementation-backed delta.
- Historical work evidence and the production-readiness H1 gate remain intact.

## Deferred and Preserved

- `lpms-production-readiness` remains at `H1`.
- Live Cents retry behavior, stable store identifiers, reconciliation support,
  and optional egress IPs remain externally unconfirmed.
- Owner/admin manager mapping, queued-unfreeze authorization, and exception
  workflows remain unresolved as recorded in memory v7.
- Drag-and-drop, silent live reoptimization, split orders, and full event
  sourcing remain deferred.
