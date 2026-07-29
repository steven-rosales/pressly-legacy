# LPMS State Transition Catalog

Status: current authority catalog after
`lpms-operational-authority-remaining-day-forecast` and the 2026-07-28
source-autonomy implementation.

This catalog names the one owner for each durable lifecycle. It is deliberately
not a global workflow model. Each graph belongs to one aggregate; application
use cases compose graph decisions with locks, versions, persistence, outbox
effects, and work events.

## Authority Boundary

The supported flow is:

```text
Cents webhook
  -> durable inbox
  -> Worker-owned vendor adapter
  -> exact SUBMITTED candidate
  -> exact COMPLETED or CANCELED source closure
  -> every other source state is evidence-only

operator Accept
  -> candidate graph and exact identity/version recheck
  -> atomic canonical User, Order, unreleased fulfillment, and outbox event

operator Reject
  -> terminal candidate decision with no canonical or Production effect

operator Restore
  -> source_closed to manager-owned restored_pending
  -> later source closure cannot override the manager

explicit Pressly command
  -> Orders canonical lifecycle/release graph
  -> atomic canonical mutation plus source-neutral fulfillment-demand outbox event

Orders fulfillment-demand outbox event
  -> Worker projector
  -> Production demand projection
```

- Cents can propose one incoming Order only from an exact `SUBMITTED`
  observation. Exact `COMPLETED` or `CANCELED` observations can close only an
  unresolved candidate or create an exact-identity tombstone. Cents does not
  own canonical creation, lifecycle, descriptive fields, or physical floor
  state.
- `READY_FOR_PICKUP`, `PICKED_UP`, `IN_PROGRESS`, and every other known or
  unknown Cents lifecycle value is acknowledged as evidence only. Later events
  cannot change accepted or rejected candidates, manager-restored candidates,
  or canonical work.
- The candidate snapshot is immutable. Exact source identity is the only
  automatic suppression and acceptance key; fuzzy or contact matching is never
  authoritative.
- Only explicit Pressly commands may request a commercial-lifecycle or
  fulfillment-release edge, and the owning directed graph is the sole decision
  authority.
- Production receives source-neutral canonical facts and never interprets a
  vendor lifecycle code.
- Physical bag count and bag rows are owned by versioned operator intake.
  External or projection-envelope `bagCount` values are compatibility evidence
  only and cannot change them.

The Cents wire status is treated as forward-compatible text. The adapter
classifies only exact `SUBMITTED`, `COMPLETED`, and `CANCELED`; it does not
maintain or normalize a vendor lifecycle graph. Webhook arrival order remains
unknown and cannot be used as a canonical revision fence.

## Classification Rules

Every persisted value is one of:

1. **Authoritative lifecycle** — one aggregate-owned directed graph decides
   every transition.
2. **Orthogonal fact** — independently versioned data such as membership
   freeze, admission override, or selection.
3. **Derived or dependent projection** — deterministic output from
   authoritative facts, even when cached in storage for reads.
4. **Durable job state** — lease/retry mechanics, not a business lifecycle.

Readiness, attention, between-stage milestones, actionability, due buckets,
forecast groups, and capacity risk are projections. They must not become
parallel lifecycle machines.

## Orders

### Incoming Order Candidate

| Property        | Value                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Persisted field | immutable candidate, current state, append-only transitions, and tombstone |
| States          | `pending`, `source_closed`, `restored_pending`, `accepted`, `rejected`     |
| Owner           | `modules/business/orders/src/incoming-order-proposal.policy.ts`            |
| Current writers | source-neutral submit/close; explicit operator Accept, Reject, or Restore  |
| Lock/version    | exact source identity, candidate lock, optimistic version                  |
| Terminal states | `accepted`, `rejected`                                                     |

Authoritative graph:

```text
pending --accept--> accepted
pending --reject--> rejected
pending --source_close--> source_closed
source_closed --restore--> restored_pending
restored_pending --accept--> accepted
restored_pending --reject--> rejected
```

No edge leaves either terminal state. No source-close edge leaves
`restored_pending`. Acceptance creates canonical work transactionally with an
unreleased fulfillment; rejection creates none.

### Commercial Order

| Property        | Value                                                   |
| --------------- | ------------------------------------------------------- |
| Persisted field | `orders.state`                                          |
| States          | `open`, `completed`, `canceled`                         |
| Owner           | `modules/business/orders/src/order-lifecycle.policy.ts` |
| Current writers | explicit lifecycle command; initial order creation      |
| Lock/version    | Order aggregate lock and `orders.version`               |
| Terminal states | `completed`, `canceled`                                 |

Authoritative graph:

```text
open --complete--> completed
open --cancel----> canceled
```

Source completion or cancellation never requests either edge. External
lifecycle metadata remains retained observation evidence for reconciliation and
operator context.

### Fulfillment Release

| Property        | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| Persisted field | `order_fulfillments.release_state`                          |
| States          | `unreleased`, `released`, `withdrawn`                       |
| Owner           | `modules/business/orders/src/order-lifecycle.policy.ts`     |
| Current writers | `change-fulfillment-release`; initial order creation        |
| Lock/version    | Fulfillment aggregate lock and `order_fulfillments.version` |
| Terminal state  | `withdrawn`                                                 |

Authoritative graph:

```text
unreleased --release--> released
unreleased --withdraw-> withdrawn
released   --withdraw-> withdrawn
```

Every edge requires an explicit Pressly command. External source adoption cannot
use any edge.

### Orders Values That Are Not Aggregate Lifecycles

| Persisted value                                      | Classification              | Owner                                                       |
| ---------------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| Source revision timestamp and hash                   | monotonic observation fence | Orders source-ordering policy                               |
| Latest normalized source snapshot and lifecycle code | retained observation        | Orders source repository                                    |
| Per-field authority                                  | orthogonal fact             | Orders field-authority policy                               |
| Source identity link                                 | stable identity             | Orders persistence                                          |
| Outbox `pending/processing/completed/dead`           | durable job state           | Orders outbox claim/complete/retry/dead-letter capabilities |

Equal revision and hash is a replay, an older revision is stale, and equal
revision with a different hash is a conflict. None of those classifications is
a commercial or fulfillment transition.

## Production

### Shift

| Property        | Value                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Persisted field | `production_shifts.status`                                                 |
| Runtime states  | `open`, `closed` (`draft` is a legacy/default storage value)               |
| Owner           | new Production lifecycle policy                                            |
| Current writers | `manage-production-shift`; final-batch completion; migration `0031` repair |
| Lock/version    | location scheduling lock and `production_shifts.version`                   |
| Terminal state  | `closed`                                                                   |

Graph:

```text
open --close_after_execution--> closed
```

Legacy `draft` rows must be characterized or normalized; they are not a reason
to add a second runtime transition table.

### Schedule Revision

| Property        | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Persisted field | `schedule_runs.status`                                                             |
| States          | `draft`, `accepted`, `superseded`, `rejected`                                      |
| Owner           | new Production schedule lifecycle policy                                           |
| Current writers | `create-schedule`; `accept-schedule`; migration `0031` repair                      |
| Lock/version    | location scheduling lock, immutable snapshot hashes, one-current-plan unique index |
| Terminal states | `superseded`, `rejected`                                                           |

Graph:

```text
draft    --accept-----> accepted
draft    --supersede-> superseded
accepted --supersede-> superseded
draft    --reject-----> rejected
```

Acceptance warnings, operating windows, selection freshness, and snapshot
hashes are guards. They are not states.

### Production Run

| Property        | Value                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Persisted field | `production_runs.status`                                                   |
| Runtime states  | `started`, `completed`                                                     |
| Owner           | new Production run lifecycle policy                                        |
| Current writers | `start-schedule`; final-batch completion                                   |
| Lock/version    | run-first lock, `production_runs.version`, and independent `queue_version` |
| Terminal state  | `completed`                                                                |

Graph:

```text
started --complete_final_batch--> completed
```

`planned` is legacy-readable only and is not created by the current Start
command. Queue version and overtime acknowledgement are orthogonal concurrency
facts.

### Production Batch

| Property        | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| Persisted field | `production_batches.status`                                                   |
| States          | `queued`, `sorting`, `washing`, `drying`, `folding_packaging`, `finished`     |
| Owner           | new Production batch lifecycle policy                                         |
| Current writers | `start-schedule`; stage advance; floor reconciliation; final-batch completion |
| Lock/version    | run-first lock, queue version, and `production_batches.version`               |
| Terminal state  | `finished`                                                                    |

Ordinary execution follows:

```text
queued -> sorting -> washing -> drying -> folding_packaging -> finished
```

Floor reconciliation may move only forward to a later milestone. Its explicit
forward edges are part of the same batch graph; it cannot create a backward or
reopen path.

### Stage Run

| Property        | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Persisted field | `stage_runs.status`                                   |
| States          | `planned`, `started`, `completed`                     |
| Owner           | existing Production stage-transition policy           |
| Current writers | `start-schedule`; stage advance; floor reconciliation |
| Lock/version    | run-first lock, batch lock, and `stage_runs.version`  |
| Terminal state  | `completed`                                           |

Graph:

```text
planned --start----------------> started
started --complete-------------> completed
planned --reconcile_completed--> completed
```

Timing confirmation, sequence, active-stage uniqueness, machine compatibility,
capacity, and provenance remain guards and effects around this graph.

### Production Order Execution

| Property                | Value                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Current persisted field | `production_orders.status`                                                                                   |
| Current mixed values    | readiness: `release_pending`, `intake_pending`, `eligible`, `ineligible`; execution: `scheduled`, `finished` |
| Current writers         | fulfillment-demand projection; intake; manual admission; Start; live placement; final completion             |
| Target owner            | new Production-order execution lifecycle policy                                                              |
| Lock/version            | location scheduling lock before selection; run-first lock after commitment; `production_orders.version`      |

The current field is not a valid lifecycle because it mixes readiness with
execution. Before graph consolidation it must become:

```text
unassigned --schedule_or_place--> scheduled --finish--> finished
```

Readiness is then derived from canonical admission, positive demand, intake,
selection/commitment facts, and execution state. No migration may invent a
historical transition.

### Production Order Resolution

| Property        | Value                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Persisted field | `production_orders.resolution_state`                                                                           |
| States          | `open`, `resolved_without_production`                                                                          |
| Owner           | `modules/policy/production/src/lifecycle/production-order-resolution-lifecycle.policy.ts`                      |
| Writers         | explicit manager resolve and restore commands only                                                             |
| Lock/version    | location scheduling lock and `production_orders.version`                                                       |
| Archive meaning | read-only presentation of retained `resolved_without_production` work; never deletion, cancellation, or finish |

Authoritative graph:

```text
open --resolve_without_production--> resolved_without_production
resolved_without_production --restore--> open
```

Resolution is orthogonal to execution. The graph alone owns the persistent
transition. A pure Production policy guard classifies execution, selection,
membership, attempt, route, intake, manual-admission, priority, and pending
placement facts before the command may request an edge. External source
observations cannot request either edge or implicitly restore resolved work.

### Order Stage Attempt

| Property        | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| Persisted field | `production_order_stage_attempts.status`                             |
| States          | `assigned`, `completed`, `released`                                  |
| Owner           | new Production attempt lifecycle policy                              |
| Current writers | Start/live placement/route creation; stage completion; route release |
| Lock/version    | owning run, batch, order, and stage versions                         |
| Terminal states | `completed`, `released`                                              |

Graph:

```text
assigned --complete_with_stage--> completed
assigned --release_for_route----> released
```

Completed and released attempts remain immutable history. Rework creates a new
numbered attempt.

### Production Values That Are Not Independent Aggregate Lifecycles

| Persisted value                                | Classification                       | Reason                                                                     |
| ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `order_demands` commercial/admission facts     | source-neutral Orders projection     | Production consumes but does not reinterpret upstream lifecycle            |
| `order_demands.phase`                          | cached derived demand projection     | expected/inbound/released/post-production/withdrawn is not floor authority |
| `production_orders.admission_override`         | orthogonal audited fact              | changes effective admission only                                           |
| bag count/intake version                       | operator-recorded physical intake    | readiness input; never projected from an external observation              |
| priority                                       | orthogonal planning fact             | ordering input                                                             |
| shift selected-order rows/version              | versioned set                        | explicit selection, not lifecycle                                          |
| batch membership freeze                        | orthogonal fact                      | mutability is separate from batch status                                   |
| batch membership `active` and release metadata | dependent membership history         | released atomically by routing/completion; never advances a batch          |
| bag status                                     | dependent order-execution projection | bags stay with the whole order                                             |
| machine assignment status                      | dependent stage projection           | cannot advance the owning stage                                            |
| stage boundary provenance                      | orthogonal fact                      | describes evidence quality, not progress                                   |
| pending placement JSON                         | durable proposal outcome             | reloadable context, not executable state                                   |
| work events                                    | append-only audit ledger             | evidence of mutations, not a transition authority                          |
| live revision                                  | invalidation counter                 | transport hint, not production state                                       |

Between-stage milestones, Order Control attention, allowed next actions, due
buckets, forecast groups, appendability, and capacity risk are pure read
projections from these authoritative facts.

## Historical Pre-Change Mismatches (Superseded)

The starting checkout for
`lpms-operational-authority-remaining-day-forecast` proved the following
point-in-time mismatches. They are preserved as historical evidence and are not
descriptions of the current authority model:

1. `apps/worker/.../cents-order.handler.ts` maps Cents `COMPLETED` to canonical
   commercial completion, `CANCELED` to canonical cancellation/withdrawal, and
   every other status after `PICKED_UP` to released.
2. Orders source observation currently decides snapshot retention and
   canonical adoption together. An invalid lifecycle transition returns
   `ORDER_SOURCE_TRANSITION_INVALID`; the newer snapshot is not retained and
   the Worker classifies the non-5xx result as a terminal inbox failure.
3. The fulfillment graph currently permits source adoption to use
   `released -> withdrawn` because source and Pressly commands share only the
   target-state check.
4. Only commercial Order, fulfillment release, and stage run use
   `stateMachine.define`; other persistent Production transitions are local
   repository/use-case assignments.
5. `production_orders.status` mixes readiness and execution.
6. Source comparison is implemented independently in both
   `modules/computation/order-control` and
   `modules/business/production/src/list-production-order-control`, then
   rendered as floor attention by Home and Intake.
7. The existing demand forecast is shift-scoped, returns no forecast when an
   active run exists, and models an empty future pipeline rather than unfinished
   work remaining today.
8. Home and Schedule both render detailed demand outlook information; there is
   no `/forecast` route.

The historical pre-change unit baseline was green: Orders 9 tests, Worker 31,
Production policy 83, scheduling 16, Production 116, and Processor 170. Those
counts are not current verification evidence.

## Historical Execution Boundary (Superseded)

At planning time, this package was ordered before
`stateworks/work/queued/lpms-order-control-correctness-hardening` and must not
run concurrently with it because both change Production policy/business,
contracts, database tests, Processor surfaces, and Order Control semantics. That
sequencing statement is retained as historical delivery evidence; it is not a
current work-status claim.

## Remaining Live-Readiness Gate

`stateworks/work/active/lpms-production-readiness` remains stopped at its
existing external gate. Its repository proof predates this authority and
forecast model and must be revalidated against the current Orders-command,
outbox-projection, and operator-intake boundaries before any deployment or pilot
claim.

Historical completed Stateworks packages remain immutable evidence; this
catalog supersedes their now-deprecated source-comparison policy without
rewriting them.
