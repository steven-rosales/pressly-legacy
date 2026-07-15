# LPMS Operator Workspace and Live Sync Evidence

## Work

- Work ID: `lpms-operator-workspace-live-sync`
- Network:
  `stateworks/work/done/lpms-operator-workspace-live-sync/network.yaml`
- Started: `2026-07-15`
- Status: complete checkpoint

## Evidence Boundary

This file records the scoped route and documentation correction, implementation
verification, Stateworks validation, and a read-only local-runtime aggregate.

It does not claim a completed production run, live Cents compatibility,
deployment, alert routing, or pilot readiness.

## T0 — Checkpoint and Memory Baseline

Status: committed.

### Preserved state

- Laundry-production memory remains v6 in
  `stateworks/memory/domains/laundry-production/memory.yaml`.
- This checkpoint did not edit its current context pack.
- `lpms-run-centered-online-scheduling` remains completed with its historical
  evidence intact.
- `lpms-production-readiness` remains active at `H1`; no task or evidence in
  that work was advanced or rewritten.
- The new v7 delta is proposed only.

### Implementation checkpoint inspected

The following behavior exists in the shared worktree and is covered by the
focused and repository proof recorded below:

- `modules/policy/production/src/shift-planning-window/` rejects expired
  Compute/Accept/Start and rejects Start before the shift begins.
- `modules/business/production/src/manage-production-shift/` persists
  versioned start/end/folder changes, supersedes a material current plan, and
  rejects updates after a run exists.
- `modules/business/production/src/load-production-workspace/` treats a
  schedule as actionable only for an open, unexpired shift when the schedule is
  not production-run provenance.
- `modules/business/production/src/advance-production-stage/` implements
  version- and timing-bound early-completion confirmation and atomically closes
  the final run and shift.
- `packages/db/src/migrations/0017_production_live_revisions.sql` advances a
  location revision and publishes a PostgreSQL notification after work-event
  insertion.
- `apps/api/src/common/live/` and
  `apps/api/src/routes/production-change.routes.ts` expose authenticated,
  location-scoped SSE invalidation.
- `apps/processor/src/app/production-sync.coordinator.ts` coalesces SSE and
  post-command refreshes without a production-state polling timer.
- `apps/processor/src/app/app.navigation.ts` uses resource paths rather than
  query-owned workspace navigation.
- `apps/processor/src/features/scheduling/schedule-history.view.tsx` presents
  run-owned, completed, closed, or expired shifts as history.
- `apps/worker/src/lpms/runtime.ts` still polls the durable inbox on a bounded
  interval by design.
- `apps/worker/src/lpms/processor.ts` emits pending count and oldest age from
  one slower backlog sample; those two measurements are not a second claim
  poll.

### Documentation baseline

At the T0 baseline, memory v6 still said SSE was deferred and that the Processor
polled every ten seconds. Those statements stayed active until the delta was
verified and applied under T4; they were not silently edited in place.

The living LPMS, Processor, security, migration, observability, design, and
local-run documentation was reconciled inside T3. Historical Stateworks
evidence and dated plans remain unchanged.

### Read-only local aggregate

Read-only SQL against the native WSL Compose database recorded:

- location `pressly-one` has 15 orders in `scheduled` status;
- those scheduled orders total exactly 800.000 pounds;
- those scheduled orders declare exactly 34 bags; and
- one separate prior finished order totals 10.000 pounds and 2 bags.

No order, bag, shift, schedule, run, batch, stage, assignment, work event, or
live revision was created or changed to collect these facts. The 15 scheduled
orders are current runtime context, not evidence of a completed production run.

## T1 — Shift and Stage Lifecycle

Status: committed.

- Production Policy: 8 files and 46 tests passed.
- Production application: 17 files and 83 non-integration tests passed.
- Contracts: 5 files and 51 tests passed.
- The isolated LPMS integration workflow applied all migrations to the test
  database, then passed 5 database files/36 tests, 1 webhook-ingestion
  integration file/3 tests, 8 Production integration files/13 tests, and its
  remaining unit and webhook-asset checks.
- The verified behavior includes operating-window checks, versioned pre-start
  shift and folder changes, schedule supersession, run-provenance-aware
  history, version- and timing-bound early completion, fixed downstream pulse
  boundaries, and atomic final run/shift closure.

## T2 — Live Synchronization and Worker Distinction

Status: committed.

- API: 14 files and 117 tests passed, including production-change feed and
  route authorization tests.
- Processor: 18 files and 111 tests passed, including connection lifecycle,
  coalesced authoritative refresh, request fencing, and the absence of a
  production-state polling timer.
- Worker: 6 files and 23 tests passed, including durable claim-loop behavior
  and throttled backlog sampling.
- Migration 0017 passed the isolated migration suite and Drizzle consistency
  check. The live read-only migration journal reports migration IDs 16 and 17.

## T3 — Routes and Living Documentation

Status: committed.

- The Processor uses `/schedule`, `/schedule/:shiftId`, `/production`,
  `/production/:runId`, and `/configuration` as resource routes.
- Root, legacy-query, malformed, and unknown paths now render a bounded
  not-found state. They do not redirect automatically; **Open scheduling** is
  an explicit operator action.
- The route correction is covered by the 111-test Processor suite.
- `docs/README.md`, `docs/plan/README.md`, and `docs/agents/README.md` now map
  authority and lifecycle instead of making every Markdown file compete as
  current truth.
- Living LPMS, Processor, security, migration, observability, design, webhook,
  and local production-run references match the implemented contracts.
- The local runbook does not reset the shared WSL database and does not force a
  six-batch result when the current immutable configuration yields another
  valid layout.
- Processor design authority is `apps/processor/DESIGN.md`; dated screenshots
  remain historical evidence only.

## V1 — Focused and Repository Verification

Status: committed on HEAD `876fd8c2c57d1cdc555b479c059bfdd1ce6efc35`
plus the recorded dirty working tree.

The final commands passed:

```text
pnpm --filter @pressly/production-policy test  -> 8 files, 46 tests
pnpm --filter @pressly/production test         -> 17 files, 83 tests
pnpm --filter @pressly/contracts test          -> 5 files, 51 tests
pnpm --filter @pressly/api test                -> 14 files, 117 tests
pnpm --filter @pressly/processor test          -> 18 files, 111 tests
pnpm --filter @pressly/worker test             -> 6 files, 23 tests
pnpm test:lpms:int                             -> pass on isolated test DB
pnpm test:lpms:e2e                             -> 3 API files/42 tests and Processor 18 files/111 tests
pnpm format:check                              -> pass
pnpm lint                                      -> 24 tasks
pnpm typecheck                                 -> 43 tasks
TMPDIR=/tmp pnpm test                          -> 44 package tasks and 11 tooling files/158 tests
TMPDIR=/tmp pnpm build                         -> 24 tasks
pnpm --filter @pressly/db exec drizzle-kit check --config drizzle.config.ts -> pass
```

The first format check found three live-sync files with mechanical Prettier
drift; those exact files were formatted and the complete check passed.

The first root typecheck exposed stale root-owned workspace dependency links
left by a prior Docker bind-mount install. No source was changed: a frozen pnpm
install rebuilt the links as the WSL user, after which all 43 typecheck tasks
passed.

The first root tooling-test invocation inherited a Windows-mounted temporary
directory and failed eleven mode-600 fixture assertions. The identical command
with `TMPDIR=/tmp`, where Unix permission semantics are real, passed all 158
tooling tests. This environment requirement is also used by the Stateworks
validators.

## V2 — Read-Only Local Runtime Snapshot

Status: committed at `2026-07-15T11:38:45-04:00`.

- API, PostgreSQL, test PostgreSQL, Processor, Web, and Worker containers were
  running; API, PostgreSQL, Processor, Worker, and test PostgreSQL reported
  healthy where health checks are defined.
- API `/health/live`, API `/health/ready`, and Processor `/health` returned
  HTTP 200.
- The production-change route returned HTTP 401 without a session, confirming
  that the stream is present and not anonymously readable. Authenticated stream
  behavior is covered by API tests rather than a synthetic live login.
- Read-only SQL reported live revision 113, one started run on an open shift,
  queue version 4, three current batches, and fifteen active run orders totaling
  exactly 800.000 pounds and 34 declared bags.
- The same location had zero eligible orders; all fifteen run orders remained
  scheduled. No stage or production command was issued.
- Worker logs showed pending count and oldest pending age at zero. The paired
  gauges share one timestamp per roughly one-minute sample; they are two
  measurements from one sample, not two claim polls.

## T4 — Durable Memory v7

Status: committed.

- The verified delta was advanced from `proposed` to `accepted`, applied through
  `stateworks:memory:apply`, and marked `applied`.
- Laundry-production memory advanced from v6 to v7.
- The context pack was regenerated from v7 and a fresh `--stdout` render matched
  the tracked pack byte-for-byte.
- The obsolete SSE-deferral and Processor ten-second-polling decisions are
  deprecated in memory and absent from the active context pack.
- The SSE invalidation, pre-start shift revision, early-completion,
  final-closure, run-provenance history, live-revision, and intentional Worker
  polling facts are active in v7.
- Memory, delta, network, and completion validators passed after application.

## Commands

The T0 checkpoint validators passed on `2026-07-15T11:24:17-04:00`:

```text
PATH=/home/steven/.nvm/versions/node/v22.22.2/bin:$PATH TMPDIR=/tmp \
  pnpm stateworks:validate stateworks/work/active/lpms-operator-workspace-live-sync/network.yaml
Result: pass; 7 tasks.

PATH=/home/steven/.nvm/versions/node/v22.22.2/bin:$PATH TMPDIR=/tmp \
  pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/deltas/2026-07-15-operator-workspace-live-sync.memory-delta.yaml
Result: pass; proposed delta is structurally valid.

PATH=/home/steven/.nvm/versions/node/v22.22.2/bin:$PATH TMPDIR=/tmp \
  pnpm stateworks:verify stateworks/work/active/lpms-operator-workspace-live-sync/network.yaml \
  --state stateworks/work/active/lpms-operator-workspace-live-sync/state.yaml
Result: pass; work remains active and incomplete.

git diff --check -- <this package, session, and proposed delta>
Result: pass.
```

The explicit NVM path and `TMPDIR=/tmp` are shell-environment requirements in
this WSL-hosted Codex session. They do not change application behavior.

The terminal checks passed after moving this package to `work/done`:

```text
pnpm stateworks:validate stateworks/work/done/lpms-operator-workspace-live-sync/network.yaml
Result: pass; 7 tasks.

pnpm stateworks:verify stateworks/work/done/lpms-operator-workspace-live-sync/network.yaml \
  --state stateworks/work/done/lpms-operator-workspace-live-sync/state.yaml
Result: pass; done yes, no stop reasons, zero next tasks.

pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/memory.yaml
Result: pass; version 7.

pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/deltas/2026-07-15-operator-workspace-live-sync.memory-delta.yaml
Result: pass; delta status applied.

fresh context-pack --stdout render versus context-pack.md
Result: exact match.

pnpm format:check
Result: pass.
```

## Open Risks

- Risk: the implementation is present in a large dirty shared worktree rather
  than a committed release artifact.
  Owner: human/agent.
  Next step: review and commit intentionally before deployment.

- Risk: the current Processor container predates the final route fallback
  source correction; source build proof passed, but this checkpoint did not
  recreate the user's live container while a run is active.
  Owner: human/agent.
  Next step: rebuild through the normal local stack workflow after preserving
  the current run context.

- Risk: live Cents retry, store, reconciliation, and optional source-IP facts
  remain unconfirmed.
  Owner: human through `lpms-production-readiness/H1`.
  Next step: follow the existing H1 instructions; do not promote local proof.
