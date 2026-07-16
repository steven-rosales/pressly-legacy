# Order Control and Production History Checkpoint

Date: 2026-07-15
Domain: laundry-production
Topic: server-paginated order control, whole-order routing, and production history
Status: implementation-backed checkpoint

## Source

- The order-level workflow discussion in the current Codex task.
- Laundry-production memory v8 and its bounded context pack.
- The current shared worktree under `/home/steven/pressly`.
- Completed run-centered scheduling, live-sync, and floor-reconciliation work.
- The still-separate `lpms-production-readiness` human gate.

## Evidence Boundary

This session records implemented contracts, policies, transactions, read
models, and Processor workflows. It does not claim a live deployment, a pilot,
or completion of the separate production-readiness gate.

The focused verification and Stateworks commands are recorded in
`stateworks/work/done/lpms-order-control-history/evidence.md`.

## Confirmed Domain Facts

### Order-level control is a projection, not a new aggregate

The Processor root route is an order-first **Home** workspace. Its backend read
model is:

```text
GET /production/locations/:locationId/order-control
```

`packages/contracts/src/production/production-order-control.contracts.ts`
defines server-side filters for attention/active/all, external-reference
search, order status, due window, run, batch, current stage, priority, and
movability. Results use bounded keyset pagination ordered by due time and
stable order ID. The page also returns server-derived attention, current
placement, next required stage, route-attempt history, and action availability.

The Home workspace exposes the highest-frequency floor filters and uses an
order detail sheet for move, leave-behind, and rework decisions. It does not
load every order into browser memory and paginate locally.

### Two routing workflows have different preconditions

`modules/policy/production/src/order-routing/order-routing.policy.ts` separates
two commands:

1. **Queued rebatch** moves a whole order from a queued, unfrozen source to the
   exact mutable queued batch selected by the employee.
2. **In-flight defer or rework** leaves a whole order behind after its source
   batch has started. The restart stage cannot skip required work, and the
   policy selects the earliest feasible later batch whose required stage
   suffix remains planned and has hard capacity.

The second workflow covers bounded floor facts such as more drying, rewash,
incomplete sorting, or an incomplete current stage. It does not create generic
hold, cancellation, damage, or missing-item semantics.

Every route is whole-order atomic. Bags never split, and capacity is evaluated
using the complete order weight across every target stage in the assigned
suffix.

### Preview and commit are distinct

The public route endpoints are:

```text
POST /production/locations/:locationId/runs/:productionRunId/
  orders/:productionOrderId/route/preview

POST /production/locations/:locationId/runs/:productionRunId/
  orders/:productionOrderId/route
```

Preview evaluates the current run queue version, order version, source batch
version, canonical stage graph, target stage availability, and hard capacity.
It returns the exact source/target, restart stage, released and assigned stage
suffixes, target weight, target capacity, expected versions, and a canonical
proposal hash.

Commit reloads the routing context under the shared run-first lock order,
recomputes the proposal, compares its hash, and uses a canonical idempotency
identity. A stale version or changed proposal leaves production unchanged.

### Routing commits one coherent transaction

`modules/business/production/src/route-production-order/` commits the route as
one Production transaction:

```text
release current batch membership
-> release unfinished source order-stage attempts
-> insert one target membership
-> insert target order-stage attempts for the required suffix
-> subtract/add the whole order weight from source/target batches
-> increment source batch, target batch, order, and run queue versions
-> invalidate any prior overtime acknowledgment
-> append production_order_rebatched or
   production_order_route_exception_recorded
-> commit
```

Affected-row checks and database uniqueness preserve one active membership and
one active attempt per order/stage. The source and target weights must remain
positive and within hard capacity.

### Batch-stage execution keeps one authority

`stage_run` remains the canonical physical stage projection, and the existing
advance/reconciliation workflows remain the only authority that changes a
batch's stage progression.

Order routing does not start, complete, rewind, or otherwise mutate a batch
stage. It changes only which canonical stage runs a particular order is
assigned to for future work.

### Order-stage attempts are route history, not another state machine

Migration `packages/db/src/migrations/0020_fair_karma.sql` and
`production_order_stage_attempts` record a numbered order assignment to a
canonical `stage_run`.

An attempt's order, stage, target stage run, attempt number, and assignment
reason are immutable identity. Its lifecycle closes from `assigned` to either
`completed` by the canonical batch-stage completion path or `released` by an
order route. A route creates a new attempt instead of rewriting a completed or
released assignment.

These records answer where an order was expected to receive a stage, whether
that participation completed or was released, and why another attempt exists.
They cannot independently advance the batch, start a machine, or complete the
production run.

### History is read-only, paginated, and sanitized

The authenticated History surface provides:

```text
GET /production/locations/:locationId/history/runs
GET /production/locations/:locationId/history/runs/:productionRunId
GET /production/locations/:locationId/history/activity
GET /production/locations/:locationId/history/plans
```

Runs, activity, and plans use bounded descending keyset pages. Cursors are
bound to the selected view and filters. Activity exposes a typed allowlist of
event summaries and selected detail fields; raw work-event payloads and private
idempotency data never cross the public contract.

A run detail combines current run facts with batches, stage progress, all
historical order-membership episodes, schedule lineage, and at most 100 newest
sanitized activity entries with an explicit `hasMore` marker. It is a read
projection, not a command surface or a second event-sourced aggregate.

The Processor `/history` route presents Runs, Activity, and Plans tabs and a
read-only run detail sheet.

## Explicit V1 Limitation

Routing rejects a source batch with only one active order:

```text
SOURCE_BATCH_WOULD_BE_EMPTY
```

This is deliberate. Removing the sole order would require an explicit policy
for empty-batch deletion or retention, queue resequencing, planned stage and
machine reservations, active-stage implications, and run completion. V1 does
not guess that compensation.

## Decisions

- Keep order routing whole-order and transactionally versioned.
- Keep queued moves exact and employee-selected.
- Keep in-flight deferral/rework bounded to a required stage suffix in the
  earliest feasible later batch.
- Keep `stage_run` as the only batch-stage transition authority.
- Keep order-stage attempts as immutable assignment identities with terminal
  completion/release facts, not another workflow state machine.
- Use server keyset pagination for Home and History.
- Keep History sanitized and read-only.
- Reject a sole-order route until empty-batch semantics are designed.

## Preserved Questions and Deferrals

- Empty-batch disposition and queue compaction after moving a sole order.
- Manual holds, hard-confirmed cancellation, damaged-item, missing-bag, and
  backward correction/reopen workflows.
- Drag-and-drop and bulk order routing; v1 uses explicit detail actions.
- Production-readiness, live Cents delivery, and pilot proof remain separate.
