# Run-Centered Online Scheduling Interrogation

Date: 2026-07-14
Domain: laundry-production
Topic: Pre-start plan revisions, one run per shift, and stable live-order insertion

## Sources

- Conversation with Steven about the observed Processor behavior after schedule acceptance.
- Repository and local database inspection of scheduling, acceptance, workspace
  selection, production-run persistence, stage execution, and Processor navigation.
- Existing laundry-production memory and the fixed-pulse scheduling model.

## Observed Problem

- A newly eligible order was scheduled correctly, but the Processor later lost
  the route to its production run.
- The backend workspace selected one overlapping shift heuristically, while the
  Processor retained the accepted shift only in temporary React state.
- The accepted schedule response already contained a production-run identity,
  but the Processor discarded it and continued to navigate by shift.
- The stored order, schedule, run, batches, and stages were not lost. The
  application lost the authoritative route to them.
- The deeper domain mismatch was that Accept created execution and the data
  model allowed multiple production runs for one shift. That conflicts with
  floor intuition: a shift has one production run and one live queue.

## Confirmed Pre-Start Model

- A shift has immutable schedule-plan revisions and at most one current
  revision.
- Compute includes every currently eligible order for the shift. It creates a
  new immutable revision, supersedes the old current revision, and clears any
  prior acceptance.
- Accept records the manager's preferred current proposal and acknowledged
  warnings. It does not create a production run, batches, stages, assignments,
  or scheduled-order transitions.
- Start is the commitment point. It requires the accepted revision to remain
  current and the complete eligible-order snapshot to remain unchanged.
- Start creates exactly one production run for the shift, directly in started
  execution, together with its initial batches, stage runs, assignments, order
  transitions, and work event.
- The pre-start Processor workflow is one server-derived block:
  `Compute -> Review/Accept -> Start`.

## Confirmed Live-Run Model

- After Start, new eligible orders enter the existing production run. LPMS does
  not create another run and does not globally recompute execution.
- This is an online pulse-scheduling problem with bounded recourse. Human floor
  stability is part of the objective, not an incidental UI preference.
- Automatic recourse is zero in v1: LPMS places only the arriving order and
  never moves an existing order automatically.
- Priority arrival placement chooses the earliest feasible mutable queued
  batch. If none fits, LPMS creates a batch after frozen or in-flight anchors
  and existing priority work, before the remaining ordinary mutable suffix.
- Ordinary arrival placement chooses the best-fitting mutable queued batch,
  breaking ties by earliest sequence. If none fits, LPMS appends a new batch.
- A manager may place an order into an exact requested mutable batch. The
  placement is durable and pinned, but it remains subject to hard physical
  capacity.
- An optional future optimizer may preview a bounded set of moves and savings.
  It may not change the queue until a manager explicitly accepts the proposal.

## Batch Membership and Execution

- Batch execution and batch membership are separate dimensions.
- Execution remains
  `queued -> sorting -> washing -> drying -> folding_packaging -> finished`.
- Queued batch membership is mutable until an employee explicitly freezes it.
  The system cannot currently infer physical grouping in carts or staging.
- Starting a batch implicitly and permanently freezes membership. Any
  in-flight or completed batch is irrevocable.
- Frozen batches anchor both membership and queue position against automatic
  insertion.
- A queued-only unfreeze exists as a manager operation in the implementation
  plan, but its owner/admin authorization is an assumption pending operational
  confirmation.

## Capacity, Concurrency, and Overtime

- Pulse capacity remains a hard physical constraint. Neither automatic nor
  manager-exact placement may exceed it.
- Every queue-composition mutation compares and increments a production-run
  queue version. Batch membership controls and stage transitions follow one
  run-first locking order.
- A placement that extends work beyond the shift shows the overflowing plan
  and requires explicit manager overtime acceptance.
- Overtime acceptance is bound to the exact placement hash and queue version.
  Any later queue-changing command invalidates it.
- A recoverable placement failure does not undo order eligibility. The order
  remains visibly pending and can be retried idempotently.

## Backend and Processor Authority

- Backend and database state are authoritative. React state is not durable
  ownership of shift, plan, run, or acceptance identity.
- Scheduling navigation persists an explicit shift ID; live board navigation
  persists an explicit production-run ID.
- Workspace lookup may infer a single unambiguous active context, but it must
  return candidates instead of selecting an arbitrary overlapping shift.
- Immediate mutation refresh plus bounded polling is sufficient for this work.
  SSE is deferred until the state contract and navigation model are correct.

## Assumptions

- Existing owner and admin roles act as the manager role for Accept, Start,
  queued unfreeze, exact placement, and overtime acceptance in v1.
- Queued unfreeze is owner/admin-only, explicit, confirmed, and audited until
  floor operations validate a different authorization rule.
- Operators may freeze queued batches and retry automatic placement.

## Explicitly Deferred

- SSE or another push transport.
- Drag-and-drop and paginated queue reordering; v1 uses an exact-batch selector.
- Automatic repacking or global live-run reoptimization.
- A probabilistic or arbitrary 0-to-1 stability score.
- Split orders, full event sourcing, and the already deferred exception
  workflows.

## Resolved Questions

- Production shifts constrain planning through one current plan and exactly one
  production run per shift.
- Pre-start recomputation supersedes the prior plan and revokes acceptance;
  post-start arrivals use stable insertion into the existing run.
- Acceptance and execution commitment are separate; Start creates execution.
- The prior operator-selected planning horizon is removed from this model.

## Remaining Operational Confirmation

- Confirm whether the owner/admin role mapping accurately represents the
  business manager role.
- Confirm whether a still-queued frozen batch may be explicitly unfrozen and,
  if so, whether owner/admin-only authorization is correct.

## Candidate Memory Delta

- `2026-07-14-run-centered-online-scheduling.memory-delta.yaml`
