# LPMS V1 Happy Path

## Purpose

Build one usable Laundry Processing Management System flow from external demand
to completed production.

For this work item, **end to end** means:

```text
Cents webhook
-> durable receipt
-> idempotent order projection
-> deterministic schedule proposal
-> operator acceptance
-> production floor execution
-> finished batch
```

The result must be usable through the processor UI, not only through tests or
HTTP calls.

## Scope Boundary

This work delivers the complete v1 happy path.

Exception behavior is deliberately deferred until operators can use the happy
path and validate the real workflows. This work does not invent behavior for
manual holds, hard cancellation, rewash, missing bags, damaged items, or
machine breakdown recovery.

The canonical domain and system design remains
[`docs/plan/lpms.md`](../../../../docs/plan/lpms.md). Durable rules are retrieved
from the `laundry-production` Stateworks memory domain.

## Observable Outcome

An authenticated operator can:

1. See eligible Cents orders grouped by due horizon.
2. Mark an order as priority and select how far ahead to pull work.
3. Configure a production shift and select a published scheduler config.
4. Generate a deterministic fixed-pulse schedule proposal.
5. Review capacity, batches, makespan, completion time, warnings, and unplaced
   orders.
6. Accept the immutable proposal exactly once.
7. Run each batch through sorting, washing, drying, and folding/packaging.
8. See the production board update from versioned operational truth.
9. Finish the batch with a complete mutation ledger.

## Architecture Contract

Modules are isolated peers. No module imports, calls, or declares a package
dependency on another module.

```text
                         apps/api
                  composition + HTTP boundary
               /              /             \              \
              v              v               v              v
 business/production  policy/production  policy/access-control  computation/scheduling
          |                  |                       |                    |
          +----------- narrow adapters, guards, and ports ---------------+

                         apps/worker
                  background composition root

                        apps/processor
                     UI + protocol adapter
```

The API imports the modules and adapts policy and computation outputs into
narrow ports owned by the production business module. The worker composes the
same public business capabilities for eventual work.

| Boundary                         | Owns                                                                          | Must not own                                |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| `modules/business/production`    | Use cases, transactions, persistence adapters, idempotency, operational state | Another module dependency                   |
| `modules/policy/production`      | Pure production decisions and transition validation                           | Routes, repositories, database access       |
| `modules/policy/access-control`  | Scoped authorization policy and route guards                                  | Production rules or state                   |
| `modules/computation/scheduling` | Pure deterministic schedule proposals                                         | Endpoints, database writes, execution state |
| `apps/api`                       | Authentication, validation, authorization, dependency adaptation, routes      | Production rules                            |
| `apps/worker`                    | Claiming, retries, reconciliation, runtime shutdown                           | A second projection or production model     |
| `apps/processor`                 | Interaction state, presentation, protocol calls                               | Backend invariants                          |
| `packages/contracts`             | Runtime protocol schemas, commands, and results                               | Business policy                             |
| `packages/db`                    | Storage schema, migrations, and database wiring                               | Application decisions                       |

Policy and computation remain headless. They receive immutable inputs and
return decisions or proposals. Production policy owns the pure definitions of
transition legality and production invariants; the business module owns the
durable state and must invoke that policy inside every relevant transaction.
Only the business module performs production mutations, and policy injection
is mandatory rather than an optional bypass.

## Production Rules

The implementation must preserve these rules:

- Every stage occupies exactly one configurable `pulse_minutes` slot.
- Sorting, washing, drying, and folding/packaging use the same pulse.
- A batch advances only at a pulse boundary.
- Early physical completion creates buffer; it never shortens the plan.
- Pulse capacity is the minimum of active washer capacity, active dryer
  capacity, and folding capacity.
- Folding capacity is folding rate multiplied by effective folders and pulse
  minutes.
- Orders remain whole; an order never splits across batches in v1.
- A batch is a group of orders, not a washer load.
- Bags are not assigned to machines.
- At most one batch is active per stage kind in v1.
- A machine cannot have overlapping active assignments.
- Schedule proposals are immutable and deterministic.
- Accepting a proposal creates exactly one production run.
- Production writes prefer consistency over availability.
- Every operational mutation and its `work_event` commit atomically.

## Scheduler Contract

The v1 scheduler is a deterministic heijunka-style packing and sequencing
algorithm. It is not presented as combinatorial optimization.

It must:

- Compute capacity from current resources and scheduler config.
- Respect priority and an explicit future-order planning horizon.
- Pack whole orders with a stable first-fit-decreasing heuristic.
- Use stable tie-breakers: priority, due bucket, weight descending, due time,
  then stable order ID.
- Produce one fixed slot per stage for every batch.
- Assign washer and dryer capacity at the stage level.
- Return makespan, completion forecast, shift overflow, warnings, and unplaced
  orders.
- Return an oversized order as unplaced rather than splitting it.
- Produce byte-equivalent canonical output from the same input and config.

Implementation defaults for this work item:

- Candidate order is priority, due bucket, weight descending, due time, then
  stable order ID.
- A shift-overflow proposal may be created, but acceptance requires explicit
  acknowledgement of the overflow warning.
- Published scheduler config requires an operator assertion that sorting,
  washing, and drying can each finish physical work inside one pulse.
- Scoped `owner`, `admin`, and `operator` roles may use the happy path;
  unauthenticated, unknown, and out-of-scope actors are denied.
- Live Cents adapters stay disabled unless the authoritative vendor contract
  is verified; local proof uses a contract-compatible fixture.

The required worked proof is:

```text
pulse_minutes = 56
fold_lbs_per_folder_minute = 2
effective_folder_count = 2
washer capacity = 674 lb
dryer capacity = 660 lb

folding capacity = 2 * 2 * 56 = 224 lb
pulse capacity = min(674, 660, 224) = 224 lb
whole-order weights = 150, 74, 140, 84, 130, 94, 128 lb
bag counts = 3, 2, 4, 2, 3, 2, 3
packed batches = [150 + 74], [140 + 84], [130 + 94], [128]
800 lb -> 4 ideal whole-order batches
makespan = (4 + 4 - 1) * 56 = 392 minutes
10:00 start -> 16:32 completion
```

A separate `160, 160, 160, 160, 160 lb` fixture proves that an 800 lb total
can require five batches even though the weight-only lower bound is four.

## Product Design Contract

The visual source of truth is `docs/agents/10/` and the official ElevenLabs UI
system built on shadcn.

The processor should use:

- Neutral white and near-black surfaces.
- Cool gray, thin borders.
- Compact bordered controls.
- Restrained shadows and radius.
- Strong, direct typography.
- Spacious setup and scheduling flows.
- Dense multi-panel production workspaces.
- Sparse color for status, warnings, and data.
- Mobile layouts that collapse into tabs, drawers, and a single readable
  column.

The current shadcn primitives are a foundation, not the finished design.
Implementation should establish tokens and layout primitives first, then build
the workflows. Product behavior must not be placed inside generic UI
components.

## Delivery Order

```text
architecture rails
-> contracts and persistence
-> headless policy and scheduling
-> production business workflows
-> API composition
-> durable worker
-> backend proof
-> processor client and design foundation
-> scheduling UI
-> production board
-> runtime packaging
-> end-to-end and visual proof
-> documentation and verified memory reconciliation
```

## Explicitly Deferred

- Manual hold and release.
- Hard-confirmed cancellation.
- Rewash, missing-bag, damaged-item, and machine-breakdown recovery.
- Exception-state UX.
- Hardware, RFID, or washer/dryer sensor integration.
- Bag-to-machine assignment.
- Splitting oversized orders.
- Parallel batches in one stage kind.
- Replanning an accepted run after floor drift.
- Rust, distributed solvers, or a deep optimization objective.
- A separate message broker.
- Full event sourcing.
- Production deployment and live Cents credential setup.

Local end-to-end proof uses a contract-compatible synthetic Cents fixture and
a fail-closed live adapter. It proves the LPMS path; it does not claim that a
live Cents signing or reconciliation contract has been externally verified.

## Definition Of Done

This work is done only when:

- Module isolation is mechanically enforced.
- The fixed-pulse and whole-order rules pass pure tests.
- Database constraints and transactional tests prove critical invariants.
- Duplicate, out-of-order, crashed-worker, and dead-letter paths are proven.
- The same scheduling input produces the same canonical proposal.
- Proposal acceptance and production commands are atomic and idempotent.
- The processor completes the full happy path against the API.
- Desktop and mobile screenshots are compared with the design references.
- Keyboard, focus, loading, empty, error, conflict, and warning states work.
- Worker and processor builds are included in local and CI verification.
- Root format, lint, typecheck, test, build, and architecture checks pass.
- Evidence and the final report describe what is actually implemented.
