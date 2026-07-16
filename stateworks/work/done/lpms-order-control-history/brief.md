# LPMS Order Control and History

## Status

Complete. LPMS now has a server-paginated order-first Home, bounded whole-order
routing, and read-only production History. Laundry-production memory advances
from v8 to v9 through the implementation-backed delta in this work.

The separate `lpms-production-readiness` work remains at its existing human
gate. This package does not claim deployment or pilot completion.

## Outcome

Employees can work at order granularity without weakening batch execution:

1. Move a whole order between mutable queued batches.
2. Leave behind or rework a whole in-flight order in the earliest feasible
   later batch.
3. Review the exact route before a versioned, idempotent transaction commits.
4. Find orders through server-side filters and bounded keyset pages.
5. Review production runs, sanitized activity, and schedule revisions through
   a read-only History workspace.

## Ownership Model

```text
stage_run
  = canonical batch-stage execution authority

production_order_stage_attempt
  = numbered order assignment and route-history record
  != another batch state machine
```

An order attempt retains immutable assignment identity. It closes as completed
through canonical stage completion or released through routing. A new route
creates a new numbered attempt.

## Routing Policies

### Queued rebatch

- Source must be queued and unfrozen.
- Target is the exact mutable queued batch selected by the employee.
- The complete order moves; bags never split.
- LPMS rejects an invalid target instead of substituting one.

### In-flight defer or rework

- Source must be started and unfinished.
- Restart cannot skip required work.
- LPMS selects the earliest feasible strictly later batch.
- Every assigned target stage must fit the complete order under hard capacity.
- Completed attempts remain history; unfinished attempts are released.

## Transaction Boundary

An accepted route atomically updates membership history, order-stage attempts,
source and target weights, source and target batch versions, order version, run
queue version, overtime acknowledgment, and one routing `work_event`.

## Home and History

- `/` is the order-first Home workspace.
- Home uses server-side attention/status/due/stage/priority/search filters and
  bounded due-time/ID keyset pages.
- `/history` provides bounded Runs, Activity, and Plans pages.
- Run detail includes batches, canonical stage progress, historical order
  memberships, schedule lineage, and up to 100 newest sanitized activities
  with an explicit continuation marker.
- Raw work-event payloads and private idempotency data stay internal.

## Explicit V1 Limitation

LPMS returns `SOURCE_BATCH_WOULD_BE_EMPTY` when the route would remove the only
active order from its source batch. Empty-batch deletion or retention, queue
resequencing, reservation cleanup, in-flight compensation, and completion
effects require a separate policy.

## Explicit Deferrals

- Sole-order empty-batch routing.
- Generic holds and hard-confirmed cancellation.
- Damaged-item and missing-bag workflows.
- Backward correction and reopen.
- Drag-and-drop and bulk routing.
- Deployment and pilot proof.
