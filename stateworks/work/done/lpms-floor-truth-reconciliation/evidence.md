# LPMS Floor Truth Reconciliation Evidence

Status: verified; V1 complete and memory acceptance recorded

## Evidence Boundary

Verification ran on branch `codex/lpms-floor-truth-reconciliation`, based on
Git commit `97f614259a276a432b7841686511f6acde04b54a`, plus the complete feature
worktree recorded by this package. Tests used the isolated Postgres test
service on port 55434. They did not reset or write the local development
database on port 55433.

The coordinated Docker gate built new API, Worker, and Processor images. It
did not recreate the user's running development containers or claim a
deployment. The separate production-readiness human gate and its historical
evidence remain unchanged.

## T0 — Baseline and Documentation

Recorded sources:

- `docs/plan/lpms.md` now distinguishes planned reservations from actual floor
  boundaries, documents early-start confirmation and forward recovery, adds
  boundary provenance and the reconciliation API/event, and explicitly
  separates recovery after reconnect from offline-first command execution.
- `stateworks/memory/domains/laundry-production/sessions/2026-07-15-floor-truth-reconciliation.md`
  records the inspected implementation and deferral boundary.
- `stateworks/memory/domains/laundry-production/deltas/2026-07-15-floor-truth-reconciliation.memory-delta.yaml`
  proposes the v7-to-v8 durable-memory change and remains `proposed`.
- This active work package records V1 and memory application as pending.

Documentation and Stateworks validators are recorded after they run at the end
of this evidence file. Their success does not substitute for V1 application
proof.

## T1 — Early Start and Boundary Provenance

### Contract and policy

- `packages/contracts/src/production/production.contracts.ts`
  - exposes `PLANNED_START_NOT_REACHED` as a confirmation-required start
    outcome;
  - exposes planned/observed/remaining timing to the client;
  - exposes actual boundary provenance on stage projections; and
  - validates null boundaries against `not_recorded` provenance.
- `modules/policy/production/src/stage-transition/stage-transition.policy.ts`
  - runs ordinary run, predecessor, stage-kind, assignment, and machine guards
    first;
  - requests confirmation only when an otherwise-valid start is before its
    planned boundary; and
  - preserves planned stage windows.

### Confirmation and persistence

- `modules/business/production/src/advance-production-stage/stage-start-confirmation.policy.ts`
  binds the confirmation to the location, stage, actor, expected stage
  version, planned timing, and observation time.
- `modules/business/production/src/advance-production-stage/advance-production-stage.usecase.ts`
  revalidates the proof under the versioned command path and includes
  early-start facts in the ordinary stage-start audit.
- `modules/business/production/src/advance-production-stage/advance-production-stage.repo.ts`
  writes live actual boundaries with `live_observed` provenance.
- `packages/db/src/migrations/0018_stage_boundary_provenance.sql` and
  `packages/db/src/schema/laundry-production.schema.ts` add paired actual
  boundary provenance with null/not-recorded consistency checks and a
  deterministic legacy backfill.

### Processor

- `apps/processor/src/features/production-board/early-stage-start-dialog.view.tsx`
  renders planned time, remaining duration, plan-preservation language, and
  explicit cancel/start choices.
- `apps/processor/src/features/production-board/production-board.model.ts`
  retains and returns the server confirmation rather than recreating timing
  policy in the browser.

### Candidate focused proof

- `modules/policy/production/test/stage-transition/stage-transition.policy.test.ts`
- `modules/business/production/test/advance-production-stage/advance-production-stage.usecase.test.ts`
- `modules/business/production/test/happy-path/production-postgres.repo.int.test.ts`
- `packages/contracts/test/production.contracts.test.ts`
- `packages/db/test/lpms-schema.test.ts`
- `apps/processor/test/features/production-board/early-stage-start-dialog.test.tsx`
- `apps/processor/test/features/production-board/production-board.test.tsx`

These paths exist, were inspected, and passed under V1.

## T2 — Forward Reconciliation Transaction

### Public command

- `modules/business/production/src/reconcile-production-batch-progress/reconcile-production-batch-progress.route.ts`
  registers the location-, run-, and batch-scoped progress-reconciliation
  endpoint.
- `packages/contracts/src/production/production.contracts.ts` validates exact
  run queue, batch, and four-stage versions; canonical forward milestones;
  reason/note; active-stage machines; confirmation hash; and idempotency key.
- The same contract exposes preview effects, `confirmation_required`, and
  committed `reconciled` results as a discriminated union.

### Pure policy and confirmation identity

- `modules/policy/production/src/progress-reconciliation/progress-reconciliation.policy.ts`
  validates the canonical four-stage graph, coherent completed-prefix/current
  projection, strictly forward target, and same-kind active-stage exclusion.
- `modules/business/production/src/reconcile-production-batch-progress/progress-reconciliation-confirmation.policy.ts`
  binds the proposal hash to actor, scope, current and target state, reason,
  note, machine choice, exact versions, and effects.
- Active washing or drying also invokes the existing machine-assignment policy,
  preserving compatibility, active-machine, non-overlap, and effective-capacity
  constraints.

### Atomic persistence and audit

- `modules/business/production/src/reconcile-production-batch-progress/reconcile-production-batch-progress.usecase.ts`
  previews without mutation, revalidates the exact proposal under lock, and
  appends one `batch_progress_reconciled` work event after one atomic
  projection update.
- `modules/business/production/src/reconcile-production-batch-progress/reconcile-production-batch-progress.repo.ts`
  locks run, batch, and stages in canonical order; preserves null skipped
  boundaries with `not_recorded` provenance; freezes membership as necessary;
  and does not invent historical machine assignments. A planned machine
  assignment for a skipped stage is removed from the mutable execution
  projection while the immutable schedule and stage window retain the plan; a
  known active assignment is retained when its stage becomes completed.
- The same repository sets `production_batches.started_at` when reconciliation
  first moves a queued batch forward. The value is the reconciliation commit
  time and an LPMS lifecycle anchor, not a reconstructed physical stage start.
- `packages/db/src/migrations/0019_production-batch-lifecycle-timestamps.sql`
  backfills only a missing non-queued lifecycle anchor from the already
  recorded membership-freeze/update time, aborts on ambiguous contradictions,
  and adds a database lifecycle check.
- `modules/business/production/src/persistence/complete-production-batch.ts` is
  shared by live final completion and recovery to `finished`, preserving
  terminalization parity for assignments, orders, bags, active memberships,
  run, and shift.
- Migration `0017_production_live_revisions` advances one revision per work
  event. One recovery event therefore creates one SSE invalidation, followed by
  an authoritative HTTP projection reload.

### Candidate focused proof

- `modules/policy/production/test/progress-reconciliation/`
- `modules/business/production/test/reconcile-production-batch-progress/`
- `modules/business/production/test/concurrency/production-concurrency.repo.int.test.ts`
- `modules/business/production/test/happy-path/production-postgres.repo.int.test.ts`
- `packages/contracts/test/production.contracts.test.ts`
- `packages/db/test/lpms-batch-lifecycle-migration.int.test.ts`
- `packages/db/test/lpms-schema.test.ts`

These paths exist, were inspected, and passed under V1.

### Review repair proof

The batch-start and skipped-assignment review repairs passed these focused
gates on 2026-07-15:

```text
@pressly/production reconciliation Postgres test
  -> 1 file, 2 tests passed

@pressly/production test:integration
  -> 9 files, 15 tests passed

@pressly/db LPMS schema test
  -> 1 file, 10 tests passed

@pressly/db batch-lifecycle migration test
  -> 1 file, 2 tests passed

@pressly/db test:integration
  -> 6 files, 40 tests passed

@pressly/production typecheck and lint
  -> exited zero

@pressly/db typecheck and lint
  -> exited zero
```

This focused evidence is supplemented by the complete V1 matrix below.

## T3 — Processor Recovery Experience

- `apps/processor/src/features/production-board/floor-progress-reconciliation.view.tsx`
  renders a responsive **Record floor progress** sheet with progressively
  relevant milestone, reason, note, and machine controls.
- `apps/processor/src/features/production-board/floor-progress.presenter.ts`
  derives allowed later milestones and human-readable projected effects.
- `apps/processor/src/features/production-board/production-board.model.ts`
  performs preview then exact confirmation, refreshes authoritative state, and
  handles stale/conflicting outcomes without local policy reconstruction.
- The sheet states that planned times remain unchanged and missed times remain
  unrecorded. It does not claim offline success or queue commands for replay.

Candidate focused proof:

- `apps/processor/test/features/production-board/floor-progress-reconciliation.test.tsx`
- `apps/processor/test/features/production-board/floor-progress.presenter.test.ts`
- `apps/processor/test/features/production-board/production-board.test.tsx`
- `apps/processor/test/adapters/production/api-production.adapter.test.ts`

These paths exist, were inspected, and passed under V1.

## V1 — Full Verification

Status: committed on 2026-07-15.

The final matrix passed:

```text
pnpm format:check
  -> all matched files use Prettier style

pnpm lint
  -> 24 tasks passed

pnpm typecheck
  -> 43 tasks passed

TMPDIR=/tmp pnpm test
  -> 44 package tasks passed
  -> tooling: 11 files, 159 tests passed

pnpm build
  -> 24 tasks passed

TMPDIR=/tmp pnpm exec vitest run tooling/test/architecture-boundaries.test.mjs
  -> 1 file, 55 tests passed

pnpm test:int
  -> database: 6 files, 41 tests passed
  -> auth: 6 files, 31 tests passed
  -> pricing: 2 files, 6 tests passed

pnpm test:lpms:int
  -> database: 6 files, 41 tests passed
  -> webhook ingestion integration: 1 file, 3 tests passed
  -> webhook ingestion unit: 3 files, 8 tests passed
  -> Worker: 6 files, 23 tests passed
  -> production Postgres integration: 9 files, 15 tests passed
  -> production unit: 18 files, 88 tests passed
  -> Cents webhook assets: 1 file, 6 tests passed

pnpm test:lpms:e2e
  -> API-composed Cents and LPMS flows: 3 files, 42 tests passed
  -> Processor workflows: 21 files, 125 tests passed

pnpm docker:lpms:build
  -> pressly-api:local built
  -> pressly-worker:local built
  -> pressly-processor:local built

git diff --check
  -> exited zero before final Stateworks bookkeeping
```

The proof boundary is deliberate: Postgres integration proves atomic recovery
through finished terminalization; API composition proves the Cents-to-finished
happy path; Processor tests prove preview, confirmation, conflict recovery, and
authoritative refresh; and the Docker gate proves all coordinated service
images build. No live deployment or production-database migration is claimed.

### Repairs surfaced by verification

- The first root architecture pass found a route importing a repository type;
  the route now imports through its feature use-case boundary.
- The first root behavior pass expected early-start confirmation before a hard
  predecessor invariant. The test was corrected to preserve the domain order:
  hard invariants are evaluated before timing confirmation.
- The initial formatting pass identified the new files and they were formatted
  under their owning package configurations.
- A final database lint pass found direct Drizzle introspection in a schema
  test. A safe read-only `getTableConfig` export now preserves the database
  package boundary.
- The first final integration pass reached the new lifecycle check before the
  older membership-freeze check. The test now supplies a valid lifecycle
  anchor and proves the freeze invariant directly; runtime behavior did not
  need weakening.
- Stateworks commands initially inherited a Windows-mounted temporary
  directory whose Unix socket is unsupported in WSL. Re-running with
  `TMPDIR=/tmp` passed; this was an execution-environment issue, not a
  repository failure.

## T4 — Memory Acceptance and Closure

Status: committed after V1.

The accepted delta was applied exactly once, advancing laundry-production
memory from v7 to v8. `context-pack.md` was regenerated from v8, the delta was
marked `applied`, and the completed package was moved to
`stateworks/work/done/lpms-floor-truth-reconciliation`.

## Documentation Validator Results

The following documentation-only gates exited zero on 2026-07-15:

```text
TMPDIR=/tmp pnpm stateworks:validate stateworks/work/done/lpms-floor-truth-reconciliation/network.yaml
  -> valid; 6 tasks

TMPDIR=/tmp pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/memory.yaml
  -> valid laundry-production memory v8

TMPDIR=/tmp pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/deltas/2026-07-15-floor-truth-reconciliation.memory-delta.yaml
  -> valid applied delta for laundry-production

TMPDIR=/tmp pnpm stateworks:verify stateworks/work/done/lpms-floor-truth-reconciliation/network.yaml --state stateworks/work/done/lpms-floor-truth-reconciliation/state.yaml
  -> done: yes; stop_reasons: none; next_ready_tasks: 0

pnpm exec prettier --check docs/plan/lpms.md stateworks/work/done/lpms-floor-truth-reconciliation stateworks/memory/domains/laundry-production
  -> all matched files use Prettier style

git diff --check -- docs/plan/lpms.md stateworks/work/done/lpms-floor-truth-reconciliation stateworks/memory/domains/laundry-production
  -> exited zero
```

These validators ran after memory application and work-package closure. They
prove structural consistency; the implementation behavior is backed by V1.
