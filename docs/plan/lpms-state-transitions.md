# LPMS State Transition Catalog

Status: implementation baseline for
`lpms-operational-authority-remaining-day-forecast`.

This catalog names the one owner for each durable lifecycle before the
implementation changes it. It is deliberately not a global workflow model.
Each graph belongs to one aggregate; application use cases compose graph
decisions with locks, versions, persistence, outbox effects, and work events.

## Authority Boundary

The supported flow is:

```text
Cents webhook
  -> durable inbox
  -> Worker-owned vendor adapter
  -> Orders source observation
  -> Orders canonical adoption decision
  -> atomic source-neutral fulfillment-demand outbox event
  -> Worker projector
  -> Production demand projection
```

- Cents supplies observations. It does not own Pressly's canonical lifecycle or
  physical floor state.
- Orders retains a valid newer source observation before deciding which fields
  may change canonical state.
- The first non-canceled `IN_PROGRESS`-or-later observation may cross the
  one-way fulfillment handoff.
- Before handoff, a source cancellation may withdraw prospective demand.
- After handoff, source lifecycle codes are observation-only. They cannot
  complete, cancel, withdraw, rewind, delete, or otherwise terminalize Pressly
  Order, fulfillment, or Production state.
- Source-owned non-lifecycle fields continue to use their independent
  field-authority and source-revision rules.
- Production receives source-neutral canonical facts and never interprets a
  vendor lifecycle code.

The official Cents webhook article documents the order lifecycle values
`SUBMITTED`, `READY_FOR_PICKUP`, `PICKED_UP`, `IN_PROGRESS`,
`READY_FOR_RETURN`, `OUT_FOR_DELIVERY`, `COMPLETED`, and `CANCELLED`.
Pressly's Cents adapter normalizes `CANCELLED` to its boundary spelling
`CANCELED`. The article is not evidence that delivery is ordered, so webhook
arrival order remains unknown and cannot be used as a revision fence.

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

### Commercial Order

| Property        | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Persisted field | `orders.state`                                                        |
| States          | `open`, `completed`, `canceled`                                       |
| Owner           | `modules/business/orders/src/order-lifecycle.policy.ts`               |
| Current writers | source observation repository; `update-order`; initial order creation |
| Lock/version    | Order aggregate lock and `orders.version`                             |
| Terminal states | `completed`, `canceled`                                               |

Authoritative graph:

```text
open --complete_pressly--> completed
open --cancel_pressly----> canceled
```

A pre-handoff source cancellation may request the `open -> canceled` edge as
part of the same Orders adoption decision that withdraws prospective
fulfillment. Source completion does not complete Pressly work. Once handoff has
occurred, no source observation may request either terminal edge.

### Fulfillment Release

| Property        | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| Persisted field | `order_fulfillments.release_state`                                                  |
| States          | `unreleased`, `released`, `withdrawn`                                               |
| Owner           | `modules/business/orders/src/order-lifecycle.policy.ts`                             |
| Current writers | source observation repository; `change-fulfillment-release`; initial order creation |
| Lock/version    | Fulfillment aggregate lock and `order_fulfillments.version`                         |
| Terminal state  | `withdrawn`                                                                         |

Authoritative graph:

```text
unreleased --source_handoff_or_pressly_release--> released
unreleased --pre_handoff_withdraw-------------> withdrawn
released   --explicit_pressly_compensation----> withdrawn
```

The `released -> withdrawn` edge remains available only to an explicit Pressly
command or separately modeled compensation workflow. Source adoption cannot
use it.

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
| bag count/intake version                       | physical intake fact                 | readiness input                                                            |
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

## Pre-Change Mismatches

The starting checkout proves the following:

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

The pre-change unit baseline is green: Orders 9 tests, Worker 31, Production
policy 83, scheduling 16, Production 116, and Processor 170.

## Execution Boundary

This package executes before
`stateworks/work/queued/lpms-order-control-correctness-hardening` and must not
run concurrently with it because both change Production policy/business,
contracts, database tests, Processor surfaces, and Order Control semantics.

`stateworks/work/active/lpms-production-readiness` remains stopped at its
existing external gate. Its repository proof predates this authority and
forecast model and must be revalidated before any deployment or pilot claim.

Historical completed Stateworks packages remain immutable evidence; this
catalog supersedes their now-deprecated source-comparison policy without
rewriting them.
