# LPMS Floor Truth Reconciliation

## Status

Complete. The implementation, source-backed documentation, focused tests,
isolated-Postgres integration, root gates, end-to-end workflows, and coordinated
Docker image builds passed. Laundry-production memory advanced from v7 to v8.

The separate `lpms-production-readiness` work remains stopped at its existing
human gate. This work does not advance or rewrite that evidence.

## Outcome

LPMS treats its schedule as a useful forecast without allowing the forecast to
contradict the physical floor:

1. An otherwise-valid stage may start before its planned boundary only after
   the operator confirms the exact current timing decision.
2. If physical work continued while LPMS was unavailable or updates were
   missed, an operator may reconcile one batch to a later milestone after the
   backend is reachable again.

Both workflows preserve the accepted planned windows and every hard stage,
machine, capacity, concurrency, version, and idempotency invariant.

## Domain Model

### Planned versus actual

- `planned_start_at` and `planned_end_at` are immutable forecasts and resource
  reservations inherited from the accepted production plan.
- `actual_start_at` and `actual_end_at` are separately observed floor facts.
- Boundary provenance is `live_observed`, `operator_reported`, or
  `not_recorded`.
- Missed boundaries remain null with `not_recorded`; LPMS never fabricates a
  time merely because the operator selected a later milestone.

### Early start

Normal transition policy runs first. Predecessor completion, run state,
one-active-batch-per-stage-kind, required machine assignments, and machine
availability remain hard.

If the only remaining issue is `observedAt < planned_start_at`, the command
returns `confirmation_required`. Its proof binds actor, stage version, planned
timing, and observed timing. Confirmation starts the stage, records
`live_observed` provenance and early-start audit data, and leaves the plan
unchanged.

### Recovery after reconnect

Recovery is a separate batch command because it expresses a different fact:
the physical floor is ahead of the current server projection.

The operator selects a strictly later milestone, reason, optional note, and
machines only if washing or drying will remain active. The first request
returns an exact preview and confirmation hash. Confirmation succeeds only if
the run queue version, batch version, four stage versions, actor, target,
reason, note, machine selection, and computed effects still match.

The transaction updates the current stage projection and writes one
`batch_progress_reconciled` event. It never replays fictional stage starts or
completions. Finishing through recovery shares terminalization with the normal
final-stage path, including orders, bags, active memberships, run, and shift.
Machine assignments belonging only to a skipped planned stage are removed from
the mutable execution projection instead of being relabeled as actual history;
the immutable schedule and stage window retain the original plan.
When a queued batch first moves forward, its `started_at` becomes the
reconciliation commit time as an LPMS lifecycle anchor; it does not reconstruct
the unknown physical start time of a skipped stage.

## Product Experience

- Early start uses a focused confirmation dialog with planned time, remaining
  interval, and the explicit statement that the plan will not change.
- Floor recovery uses a responsive **Record floor progress** sheet.
- The sheet reveals fields progressively: batch, later milestone, reason and
  note, then machines only for active washing or drying.
- The operator reviews concrete effects before confirming.
- Conflicts refresh the authoritative board rather than asking the user to
  reason about stale versions.
- One committed recovery event produces one SSE invalidation, followed by the
  ordinary authoritative HTTP reload.

## Recovery Is Not Offline-First

This implementation helps after reconnect. It does not allow commands to
succeed while disconnected, queue a browser command log, replay writes later,
or resolve divergent offline histories. Those capabilities would require a
separate durable client identity, dependency graph, conflict protocol, and
operator reconciliation experience.

## Explicit Deferrals

- Backward correction and reopening completed work.
- True offline/PWA command queuing and replay.
- Concurrent active batches in the same stage kind.
- Invented timestamps or machine history for missed work.
- Existing hold, cancellation, rewash, damage, missing-bag, breakdown, and
  reassignment exception workflows.

## Delivery Graph

```text
T0 memory and documentation baseline
 |-- T1 early-start and boundary-provenance implementation
 |-- T2 floor-reconciliation policy and transaction
 `-- T3 Processor recovery experience
      T1 + T2 + T3 -> V1 full verification
      V1 -> T4 accept/apply memory and close work
```

## Completion Criteria

- Focused policy, business, contract, database, API, and Processor tests pass.
- Database integration and concurrency proof pass.
- Root formatting, lint, typecheck, tests, build, and architecture boundaries
  pass on one final checkout.
- The API-composed Cents path, Processor workflow tests, and Postgres
  integration prove early start and recovery terminalization across their real
  boundaries.
- The coordinated API, Worker, and Processor Docker images build from the
  verified checkout.
- Evidence records exact commands and outcomes.
- Only then is the v7-to-v8 delta accepted and applied, `context-pack.md`
  regenerated, and this work moved to `done`.
