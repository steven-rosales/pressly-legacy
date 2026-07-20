# LPMS Demand Lifecycle and Outlook Evidence

## T0 - Lifecycle Policy and Baseline

Status: committed.

Authorization:

- On 2026-07-18 Steven explicitly closed intake, authorized implementation,
  required Stateworks to be written first, and authorized continuous execution
  without another approval stop.

Confirmed policy:

- The forecast horizon is tied to the production shift's service day.
- Physical intake and bag count can admit an order despite a lagging source
  status.
- Cents and Pressly are independent systems connected only by the webhook;
  downstream Cents statuses are comparison signals and LPMS requires operator
  confirmation before changing floor truth.

Current-source observations:

- The Worker currently maps only `IN_PROGRESS` to ready demand and all other
  Cents statuses to not-ready demand.
- Production currently stores only ready/not-ready demand state and rejects a
  newer source revision after a production order becomes scheduled or finished.
- Expected demand without a Production order is absent from the current Home
  and Schedule projections.
- Executable scheduling correctly reads eligible Production orders with known
  bag counts; that path must remain unchanged.
- The Processor already contains the shadcn primitives and ElevenLabs-derived
  Home, Schedule, tabs, badges, cards, loading, and empty-state patterns needed
  for this slice.

Architecture decision:

- Cents lifecycle strings terminate in a Worker adapter mapper.
- Pure Production policy decides safe projection and reconciliation state.
- Production application use cases serialize revisions and persistence effects.
- The existing Production workspace is extended with the advisory outlook so
  authorization, refresh, and event invalidation are not duplicated.
- Advisory forecasting remains a headless, deterministic computation that has
  no command, acceptance, or persistence path.

Validation:

- The Stateworks network validated with six tasks.
- The Stateworks verifier reported no stop condition and no ready task while T0
  was running.
- `git diff --check` passed for the recorded work package.

Worktree boundary:

- The checkout already contains unrelated deletions under `docs/agents/10`,
  new agent-doc directories, and modifications under Lightsail/test-database
  scripts. This package will not edit or revert those paths.

## T1 - Canonical Lifecycle and Safe Projection

Status: committed.

Implemented boundary:

- The Worker adapter normalizes every supported Cents status into one canonical
  Production phase: expected, inbound, production released, post-production,
  or withdrawn. `CANCELLED` is normalized by the API adapter to the canonical
  `CANCELED` value before the Worker mapping.
- Production policy now decides source projection, physical-intake admission,
  committed-work preservation, and source-versus-floor reconciliation without
  importing Cents or webhook vocabulary.
- Strictly newer source revisions persist even after scheduling or completion;
  they never rewrite LPMS batch or stage truth.
- Physical bag intake can admit expected or inbound demand when the weight and
  bag-count invariants hold. A downstream or canceled source status preserves
  physically received or committed work and creates reconciliation attention.
- Migration `0021_lpms-demand-lifecycle-outlook.sql` replaces binary demand
  readiness with canonical phase and source-status facts, moves weight and its
  provenance onto demand, permits legacy missing estimates, and makes
  `production_orders.eligible_at` nullable until admission.

Verification:

- Production policy: 73 of 73 tests passed.
- Worker: 31 of 31 tests passed, including the complete canonical phase table.
- Database unit tests: 17 of 17 passed.
- The migration applied successfully against the disposable LPMS integration
  database; the database integration suite passed 46 of 46 tests.
- Production unit tests passed 103 of 103, including a newer downstream source
  revision that preserves already scheduled floor work.
- A focused Postgres integration proof passed 2 of 2 tests and established that
  expected demand without intake stays out of Order control, production-
  released demand awaiting intake is actionable, and physical intake makes
  expected demand floor-visible.

## T2 - Shift-Scoped Advisory Outlook

Status: committed.

Implemented boundary:

- Fixed-pulse packing primitives are shared by executable scheduling and a new
  pure weight-only advisory forecast without changing the executable scheduler
  contract.
- The existing location-authorized Production workspace now projects demand
  through the end of the local service day containing the shift end, including
  overdue demand and excluding later demand.
- The read model reports known, awaiting-intake, ready, in-production, and
  reconciliation totals. Legacy rows with no estimate remain visible and are
  explicitly excluded from weight totals.
- Forecast batches never fabricate bag counts and expose no accept, start,
  command, or persistence path. Forecasting is suppressed after production has
  started or when the scheduling configuration is unavailable.

Verification:

- Scheduling computation tests passed 16 of 16, including deterministic
  ordering, whole-order hard-capacity exclusion, and advisory makespan.
- Scheduling, Production, contracts, database, Worker, and Processor targeted
  typechecks passed before the final evidence close.
- Production workspace and demand-outlook unit tests passed as part of the 103
  Production tests.
- Contracts passed 63 of 63 tests; the final positive advisory-outlook fixture
  exercises only the already typechecked strict schema and was added after that
  run.

## T3 - ElevenLabs-Style Operator Experience

Status: committed.

Implemented boundary:

- Home gains a compact Demand outlook above the floor-focused Order control.
  Schedule gains the detailed advisory forecast and order comparison while a
  shift is still in planning.
- The surface composes the Processor's existing shadcn Card, Badge, Alert,
  Tabs, Item, Empty, and semantic token patterns. It introduces no new palette,
  typography system, raw icon drawing, or policy branch in the browser.
- Copy explicitly distinguishes Cents source state, physical bag intake,
  executable LPMS work, and operator-confirmed reconciliation. No internal UUID
  is rendered.
- English and Spanish catalogs cover metrics, forecast states, source statuses,
  readiness, mismatches, missing estimates, and hard-capacity exclusions.

Verification:

- Processor tests passed 155 of 155 and Processor typecheck passed.
- UTF-8 source inspection confirmed the English punctuation and Spanish accents
  are stored correctly.
- Browser visual comparison was not performed because the Product Design
  browser boundary requires explicit permission to use the user's browser.

## V1 - Proportional Verification

Status: committed with an environment boundary recorded.

Repository proof:

- The canonical `pnpm test:lpms:int` command passed end to end: migrations and
  46 database tests, 3 webhook-ingestion integration tests, 8 ingestion unit
  tests, 31 Worker tests, 18 Production integration tests, 103 Production unit
  tests, and 6 webhook-asset tests.
- Focused package suites passed for policy, scheduling, contracts, database,
  Worker, Production, and Processor; all touched package typechecks passed.
- The architecture-boundary source was re-read after implementation. The one
  invalid business filename discovered by that audit was corrected to the
  permitted `.mapper.ts` role. A final source scan found no Cents, webhook,
  receipt, lease, or CRM vocabulary under Production business source.
- `git diff --check` passed. Non-Processor touched files were formatted with the
  repository Prettier version; Processor source follows its existing formatting
  and passed its full test and typecheck suites.

Environment boundary:

- After the successful package and integration runs, Windows could still read
  the WSL filesystem but WSL stopped accepting new command sessions. Existing
  user terminals and VS Code WSL sessions were deliberately left running rather
  than restarting the subsystem and risking unrelated unsaved work.
- Consequently the aggregate root `pnpm lint`, `pnpm build`, and Vitest
  architecture command were not rerun after final formatting. This does not
  replace or weaken the successful focused typechecks, full Processor suite,
  migration proof, or canonical LPMS integration run; it is recorded so the
  repository evidence does not overstate what was executed.

Deployment boundary:

- No production deployment, live-vendor replay, or existing-row reprojection
  was performed. The migration and application changes are ready for the normal
  release workflow.

## T4 - Stateworks and Durable Memory

Status: committed.

- The implementation-backed memory delta was validated, accepted, and applied
  exactly once, advancing laundry-production memory from v9 to v10.
- The bounded laundry-production context pack was regenerated from v10.
- Memory, delta, network, and final task-state validation passed. The Stateworks
  verifier reports the complete six-task network with no stop reason.
- The package was closed under `stateworks/work/done` without changing the
  separate production-readiness gate.

## 2026-07-19 - Local Docker Startup Repair

Observed failure:

- `pnpm docker:up` migrated and seeded successfully, then the API exited during
  bootstrap compilation because the scheduling computation returned immutable
  forecast arrays while `ProductionSchedulerPort` exposed the mutable Zod read-
  model type directly.

Repair:

- Production now owns an immutable `DemandForecastOutput` at its scheduler port,
  consistent with the existing scheduling proposal boundary.
- The demand-outlook mapper explicitly materializes mutable API-contract arrays
  at the read-model boundary instead of weakening computation immutability or
  importing the peer computation module.
- The previously unexecuted positive contract fixture now uses the canonical
  `not_admitted` readiness for expected demand with no Production order.

Verification:

- Production scheduling and Production typechecks passed.
- Production unit tests passed 103 of 103; contracts passed 64 of 64.
- The exact `pnpm docker:up` command rebuilt the API, Web, Worker, and Processor,
  completed bootstrap, and reported the full local stack running.
- API, Postgres, Processor, and Worker reported healthy; API readiness,
  Processor health, and Web health endpoints all returned successful responses.

## 2026-07-19 - Forward-Demand and Due-Date Correctness Repair

Observed failures:

- Finished LPMS orders with a lagging legacy source status remained valid
  reconciliation items, but their historical weight and order count also
  inflated the forward-looking Known demand metric.
- The duplicated due-bucket projection collapsed every past calendar date into
  `today`, so finished orders from Jul 14 and Jul 16 were labeled Today.

Repair:

- Forward demand totals and missing-estimate counts now exclude LPMS-finished
  work while retaining those rows for explicit source-versus-floor review.
- One pure due-bucket policy in the Production persistence foundation now
  distinguishes `overdue`, `today`, `tomorrow`, and `later` across every
  production read projection.
- Processor presents unfinished overdue work as Past due and finished work as
  Finished, retains the exact due timestamp, exposes an overdue filter, and
  localizes due labels in English and Spanish.
- The demand detail tab labels its complete contents as Demand & review when it
  contains reconciliation rows, rather than presenting the forward-demand
  count as the number of rendered records.

Verification:

- Contracts passed 64 of 64 tests; Production passed 106 of 106 unit tests;
  Processor passed 156 of 156 tests; architecture boundaries passed 58 of 58.
- Contracts, Production, and Processor typechecks and lints passed, as did
  `git diff --check` apart from existing line-ending warnings.
- The local API and Processor images rebuilt and both health endpoints returned 200. A read-only projection check reported 5 forward-demand orders, 165 lb,
  and 0 reconciliation reviews for the current service-day horizon.

Local data boundary:

- Exactly 46 local `LEGACY_IN_PROGRESS` fixtures whose LPMS orders were already
  finished were corrected to `post_production` / `COMPLETED` after an exact
  pre-update count. No current 15-order fixture, real Cents row, production
  database, webhook, or deployment was changed.
