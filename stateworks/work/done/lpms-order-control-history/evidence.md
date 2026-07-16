# LPMS Order Control and Production History Evidence

Status: verified; memory v9 applied and context regenerated

## Evidence Boundary

Verification ran on branch `codex/lpms-floor-truth-reconciliation`, based on
Git commit `97f614259a276a432b7841686511f6acde04b54a`, plus the complete shared
feature worktree recorded by this package. Postgres proof used the isolated
test service on port 55434; it did not reset or write the local development
database on port 55433.

This package proves the implemented order-control and History slice. It does
not claim deployment, a production pilot, or completion of the separate
`lpms-production-readiness` human gate.

## T0 — Durable Model and Documentation

The implementation-backed sources are:

- `docs/plan/lpms.md`, which now documents whole-order routing, immutable
  order-stage attempts, Home and History projections, public endpoints, and
  the v1 sole-order limitation;
- `stateworks/memory/domains/laundry-production/sessions/2026-07-15-order-control-history.md`,
  which records inspected contracts, policy, transaction, schema, read
  models, and deferred boundaries; and
- `stateworks/memory/domains/laundry-production/deltas/2026-07-15-order-control-history.memory-delta.yaml`,
  which was validated, accepted after focused proof, applied exactly once to
  memory v8, and then marked `applied`.

The memory delta advances laundry-production to v9 without changing the
existing floor-reconciliation facts or the separate production-readiness
gate.

## T1 — Whole-Order Routing and Transition Ownership

### Contracts and pure policy

- `packages/contracts/src/production/production-order-control.contracts.ts`
  defines preview and commit commands, version-bound proposal identity,
  bounded reason/restart values, and typed conflict outcomes.
- `modules/policy/production/src/order-routing/order-routing.policy.ts`
  separates exact queued rebatching from in-flight defer or rework.
- A queued route requires a mutable queued source and the exact employee-
  selected mutable queued target.
- An in-flight route preserves completed work, cannot skip required work, and
  chooses the earliest feasible strictly later batch whose required stage
  suffix has hard capacity for the complete order.

### One execution authority

- `stage_run` remains the canonical batch-stage projection and transition
  authority.
- `production_order_stage_attempts` records immutable numbered assignments to
  canonical stage runs. An assigned attempt closes as `completed` through the
  canonical completion path or `released` through routing.
- Routing creates later attempts instead of rewriting completed or released
  assignments. Attempts cannot independently start, complete, rewind, or
  finish a batch stage.

### Atomic commit

`modules/business/production/src/route-production-order/` reloads and locks
the current routing context, recomputes the exact proposal, and commits one
transaction that:

1. releases the source membership and unfinished source attempts;
2. creates one target membership and the required target attempts;
3. updates source and target weights and versions;
4. updates the order version and run queue version;
5. invalidates stale overtime acceptance; and
6. appends exactly one order-routing `work_event`.

Database uniqueness and affected-row checks preserve one active membership
and one active attempt per order/stage. `SOURCE_BATCH_WOULD_BE_EMPTY` remains
an explicit v1 rejection because empty-batch compensation is not yet modeled.

## T2 — Server-Paginated Home and History

### Home

- `GET /production/locations/:locationId/order-control` returns a bounded
  keyset page ordered by due time and stable order ID.
- Server filters cover attention/active/all, search, order status, due window,
  run, batch, current stage, priority, and movability.
- Each row includes server-derived current placement, next required stage,
  route history, attention, and available actions.
- The Processor root uses this projection and opens one order detail surface
  for previewed move, leave-behind, and rework commands.

### History

The authenticated read-only surface provides bounded server projections for:

```text
GET /production/locations/:locationId/history/runs
GET /production/locations/:locationId/history/runs/:productionRunId
GET /production/locations/:locationId/history/activity
GET /production/locations/:locationId/history/plans
```

Runs, activity, and plans use filter-bound descending keyset cursors. Run
detail includes batches, canonical stage progress, every historical order-
membership episode, schedule lineage, and at most 100 newest activity records
with `hasMore`. Typed public activity details exclude raw `work_event`
payloads and private idempotency data.

## V1 — Verification

### Static and unit proof

```text
@pressly/production-policy typecheck
  -> exited zero

@pressly/production-policy test
  -> 10 files, 61 tests passed

@pressly/contracts typecheck
  -> exited zero

@pressly/contracts test
  -> 7 files, 63 tests passed

@pressly/production typecheck
  -> exited zero after rebuilding the changed contracts package

@pressly/production test
  -> 22 files, 101 tests passed

@pressly/processor typecheck
  -> exited zero after rebuilding the changed contracts package

@pressly/processor test
  -> 25 files, 135 tests passed

@pressly/db typecheck
  -> exited zero

@pressly/db test
  -> 2 files, 16 tests passed
```

The contracts rebuild was an expected workspace declaration refresh after
concurrent contract additions; it did not require a product-code workaround.

### Postgres integration proof

```text
@pressly/production test:integration
  -> 10 files, 18 tests passed

pnpm --filter @pressly/production exec vitest run
  test/list-production-history/list-production-history.repo.int.test.ts
  test/place-production-order/place-production-order.repo.int.test.ts
  --no-file-parallelism
  -> 2 files, 7 tests passed

PRESSLY_TEST_MIGRATION_DATABASE_URL=<isolated-test-database>
  pnpm --filter @pressly/db exec vitest run
  test/lpms-order-routing-migration.int.test.ts
  --no-file-parallelism
  -> 1 file, 3 tests passed

tooling/scripts/run-integration-tests.sh db-security
  -> migrations applied successfully
  -> @pressly/db: 7 files, 45 tests passed
```

The focused routing-migration proof covers deterministic backfill and
constraints plus both ambiguity abort cases. Migration never guesses which
execution history to keep.

The first direct database-package invocation omitted the required isolated
test database environment and stopped on its environment guard; two
environment-independent files (16 tests) passed before that stop. The proof
was rerun through the repository integration harness, which configured roles,
applied migrations, and passed all seven database integration files. A first
harness attempt also lacked the NVM Node path in the Codex shell; rerunning
with the repository's `.nvmrc` Node 24.15.0 path produced the result above.
These were invocation repairs, not behavioral test failures.

### Repository-wide and LPMS end-to-end proof

```text
pnpm typecheck
  -> 43 tasks passed

pnpm lint
  -> 24 tasks passed

pnpm exec turbo test
  -> 44 tasks passed

TMPDIR=/tmp pnpm exec vitest run
  tooling/test/four-image-deployment.test.mjs
  -> 1 file, 19 tests passed

pnpm build
  -> 24 tasks passed

TMPDIR=/tmp pnpm test:lpms:int
  -> migrations applied successfully
  -> database: 7 files, 45 tests passed
  -> webhook ingestion: 4 files, 11 tests passed
  -> worker: 6 files, 23 tests passed
  -> production integration: 10 files, 18 tests passed
  -> production unit: 22 files, 101 tests passed
  -> integration harness tooling: 1 file, 6 tests passed

TMPDIR=/tmp pnpm test:lpms:e2e
  -> API Cents and LPMS path: 3 files, 42 tests passed
  -> Processor: 25 files, 135 tests passed
```

The default Codex shell inherited Windows `%TEMP%` through `/mnt/c`. That
filesystem cannot reliably represent the Unix socket and mode-600 semantics
exercised by the deployment and Stateworks tooling. The package test graph
itself passed 44/44 tasks; the affected tooling was then rerun unchanged with
Linux `TMPDIR=/tmp` and passed 19/19. Stateworks was validated with the same
Linux temporary directory. This is a WSL test-fixture location constraint,
not an implementation failure.

### Small compile-surface repair

The new server date filters require Drizzle's parameterized `gte` operator.
`packages/db/src/query.ts` and `packages/db/src/index.ts` now re-export it
through the existing safe query facade. Rebuilding `@pressly/db` and the
downstream production typecheck passed.

## T3 — Memory Application

The verified delta was accepted and applied exactly once:

```text
Stateworks memory delta applied:
  memdelta-2026-07-15-order-control-history

laundry-production memory:
  v8 -> v9

stateworks:memory:context laundry-production
  -> context-pack.md regenerated
```

Final Stateworks, formatting, and scoped diff validators are recorded in the
final report after closure.

## Final Closure Validators

The completed package passed:

```text
pnpm stateworks:validate
  stateworks/work/done/lpms-order-control-history/network.yaml
  -> valid, 5 tasks

pnpm stateworks:memory:validate
  stateworks/memory/domains/laundry-production/memory.yaml
  -> valid, laundry-production v9

pnpm stateworks:memory:validate
  stateworks/memory/domains/laundry-production/deltas/
    2026-07-15-order-control-history.memory-delta.yaml
  -> valid applied delta

pnpm stateworks:memory:context laundry-production
  -> context-pack.md regenerated

pnpm stateworks:verify
  stateworks/work/done/lpms-order-control-history/network.yaml
  --state stateworks/work/done/lpms-order-control-history/state.yaml
  -> done: yes; stop reasons: none; next ready tasks: 0

pnpm exec prettier --check <scoped documentation and memory paths>
  -> all matched files use Prettier style

git diff --check -- <scoped implementation, documentation, and memory paths>
  -> exited zero
```
