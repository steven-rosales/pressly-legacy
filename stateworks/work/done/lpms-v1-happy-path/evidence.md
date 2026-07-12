# LPMS V1 Happy Path Evidence

## Work

- Work ID: `lpms-v1-happy-path`
- Network: `stateworks/work/done/lpms-v1-happy-path/network.yaml`
- Canonical design: `docs/plan/lpms.md`
- Domain memory: `stateworks/memory/domains/laundry-production/`
- Product references: `docs/agents/10/`
- Started: `2026-07-10`
- Finished: `2026-07-10T18:03:00-04:00`

The existing `stateworks/work/` lifecycle was reused. No second work root was created.

## Baseline Preservation

The initial dirty worktree contained related architecture, kernel state-machine, laundry-production memory, and design-reference changes. They were treated as inputs and were not discarded. The current implementation remains uncommitted in the worktree; no Git commit or push was authorized by this implementation turn. Branch head remains the pre-existing `ea823aa` (`docs: refine LPMS pulse scheduling plan`).

## Implemented Proofs

### T0-T5 Architecture, Contracts, Persistence, Policy, And Scheduling

Status: committed

- Module source imports and workspace dependencies are isolated; only apps compose module public surfaces.
- Business, policy, and computation filename rails are executable architecture tests.
- The kernel process-machine factory has eight state, transition, guard, invariant, replay-safe result, and definition tests.
- Production/Cents runtime contracts cover commands, immutable plan hashes, warnings, board reads, actions, and source-version envelopes.
- LPMS migrations add durable inbox, CRM projection, immutable planning, production execution, optimistic version, idempotency, active-stage, and machine-overlap constraints.
- Production policy is pure and headless; scheduling is pure, deterministic, and I/O-free.
- The exact 800 lb fixture packs as 224, 224, 224, and 128 lb with 5, 6, 5, and 3 bags, a 392-minute makespan, and 16:32 completion.

### T3A, T6-T10 Authorization, Business Workflows, API, And Worker

Status: committed

- Production authorization denies unauthenticated, missing-scope, and unknown-role access by default.
- Raw Cents bytes are verified before parsing, receipt is durable before acknowledgement, projections serialize by external order, and source versions—not arrival order—choose current state.
- Live Cents verification remains fail-closed until its authoritative vendor contract is configured; verifier failures are classified as unavailable without exposing their cause.
- Schedule acceptance pins the output hash and acknowledged warnings and replays the same idempotency key.
- Stage actions require an accepted and started run, server-authorized actions, optimistic versions, and pulse-boundary timing.
- Worker claims use `FOR UPDATE SKIP LOCKED`, expiring leases, bounded retry/backoff, inspectable dead letters, backlog measurements, reconciliation lag, and drift counters.
- Reconciliation routes recovered snapshots through the same receipt and projection use cases; unsupported vendor reads are explicit.

### T11-T14 Processor

Status: committed

- The processor uses a typed gateway, opaque bearer session, normalized failures, and no client-side recreation of scheduler or transition policy.
- Scheduling exposes configuration, stage-fit assertions, priorities, horizon, capacity, batch contents, timeline, makespan, completion, overflow acknowledgement, and hash-pinned acceptance.
- The production board renders server-supplied allowed actions, timings, orders, weights, machines, statuses, and versions.
- Desktop and mobile captures exist for design foundation, scheduling, and the production board.
- `apps/processor/design-qa.md` records the reference comparison and `final result: passed`.
- Browser verification exercised keyboard acceptance, schedule-to-board navigation, run start, a stage start, mobile navigation, page-width containment, live-region output, and zero console/page errors.

Visual evidence:

- `artifacts/design-foundation-desktop.png`
- `artifacts/design-foundation-mobile.png`
- `artifacts/scheduling-desktop.png`
- `artifacts/scheduling-mobile.png`
- `artifacts/production-board-desktop.png`
- `artifacts/production-board-mobile.png`
- `artifacts/design-qa-desktop-comparison.png`
- `artifacts/design-qa-mobile-comparison.png`

### T15 And V1 Runtime Proof

Status: committed

```text
command: pnpm test:lpms:int
exit: 0
time: 2026-07-10T17:58:00-04:00
summary: A clean migrated test database passed 15 DB tests, two concurrent/lease worker integration tests, six worker unit tests, and six production tests.
```

```text
command: pnpm test:lpms:e2e
exit: 0
time: 2026-07-10T17:58:00-04:00
summary: One app-composed test moved seven synthetic Cents orders and 800 lb through receipt, projection, schedule acceptance, all fixed-pulse boundaries, and finished production; it also proves overflow acknowledgement, acceptance replay, run-start gating, and 1 ms early-completion rejection.
```

```text
command: pnpm build
exit: 0
time: 2026-07-10T17:57:00-04:00
summary: All 23 build tasks passed, including API, worker, processor, modules, packages, and the existing Next.js web app.
```

```text
command: docker compose config --quiet && pnpm docker:lpms:build
exit: 0
time: 2026-07-10T17:59:00-04:00
summary: Compose is valid and API, worker, and processor images build successfully.
```

```text
command: local Playwright 1.51.1 Chromium verification
exit: 0
time: 2026-07-10T17:53:00-04:00
summary: Six required screenshots captured at 1440x900 and 390x844; primary schedule/board interactions pass with no document overflow and zero browser errors.
```

## Final Quality Gate

Status: committed

```text
command: pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
exit: 0
time: 2026-07-10T18:02:00-04:00
summary: Formatting passed; 23 lint tasks, 41 typecheck tasks, 42 workspace test tasks, and 49 repository tooling/architecture tests passed. LPMS-focused counts include 9 contracts, 11 production-policy, 6 scheduling, 21 access-control, 6 production, 41 API, 6 worker, and 17 processor tests.
```

```text
command: rg applied delta; memory validate/context; network validate/verify; git diff --check
exit: 0
time: 2026-07-10T18:03:00-04:00
summary: The LPMS memory delta is applied, memory v4 is valid, the context pack regenerated, the 19-task network is valid with T16 as the only ready task, and the diff has no whitespace errors.
```

After those checks, T16 was committed in the Stateworks lifecycle. A final lifecycle verification records `done: yes` below.

```text
command: artifact existence checks; design QA pass check; stateworks validate/verify; format check; git diff --check
exit: 0
time: 2026-07-10T18:04:00-04:00
summary: All six required screenshots exist, design QA passes, the network is valid, lifecycle verification reports done: yes with zero stop reasons and zero ready tasks, formatting passes, and the diff has no whitespace errors.
```

## Durable Memory

- Delta: `stateworks/memory/domains/laundry-production/deltas/lpms-v1-implementation.memory-delta.yaml`
- Delta status: `applied`
- Memory version: 4
- Context pack regenerated from validated memory.

## Residual External Risk And Deferred Scope

- The exact live Cents authentication and pull/reconciliation contract still requires authoritative vendor documentation and operator credentials. The current adapters fail closed and do not claim a live-vendor guarantee.
- Exception workflows and UX—manual hold, cancellation with hard confirmation, rework, breakdowns, late work, and reassignment—remain intentionally deferred until the happy path is observed on the floor.
- Hardware integration, advanced optimization, distributed scheduling, and production deployment are outside this work item.

## Decisions

- Modules remain isolated peers; API and worker are composition roots.
- Policy decides pure eligibility, acceptance, assignment, and transition validity; production owns state, transactions, idempotency, and work events.
- Computation returns deterministic proposals and never owns execution state.
- The processor renders backend operational truth and sends commands; it does not infer policy.
- Local fixture integration is the v1 proof because production deployment and live credentials are external operator state.
