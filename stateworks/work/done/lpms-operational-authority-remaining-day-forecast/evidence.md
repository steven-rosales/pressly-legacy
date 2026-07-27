# LPMS Operational Authority and Remaining-Day Forecast Evidence

## Work

- Work ID: `lpms-operational-authority-remaining-day-forecast`
- Network:
  `stateworks/work/done/lpms-operational-authority-remaining-day-forecast/network.yaml`
- Started: 2026-07-26T14:08:14-04:00
- Finished: active
- Starting branch: `main`
- Starting commit: `87badbaaf57d6df3812575f3460d6ad1f7ff050e`

## Authorization

- Steven explicitly authorized implementation on 2026-07-26.
- The queued package was promoted without changing its goal, invariants, task
  graph, or verification obligations.

## T0 - Rebaseline Authority and Transition Ownership

Status: committed.

Baseline preservation:

- Existing Intake implementation changes under
  `apps/processor/src/features/intake`, its app composition, localization, and
  tests predate this package and remain in place.
- Existing migration `0031`, local fixture, Stateworks memory, marketing asset,
  design QA, agent-image, and documentation changes were inventoried before
  implementation and will not be reset.
- Empty residual directories for already completed
  `source-neutral-users-orders` and `lpms-intake-admission` work exist under
  `stateworks/work/active`; their canonical evidence remains under
  `stateworks/work/done` and this package does not repurpose them.

Deterministic pre-change package proof:

```text
command: pnpm -r --filter @pressly/orders --filter @pressly/worker --filter @pressly/production-policy --filter @pressly/production-scheduling --filter @pressly/production test
exit: 0
time: 2026-07-26T14:09:53-04:00
summary: Orders 9/9, Worker 31/31, Production policy 83/83, Production scheduling 16/16, and Production 116/116 tests passed.
```

```text
command: pnpm --filter @pressly/processor test
exit: 0
time: 2026-07-26T14:10:27-04:00
summary: Processor 170/170 tests passed. Two existing Sheet tests emitted Radix DialogContent description warnings; no test failed.
```

Transition catalog:

- `docs/plan/lpms-state-transitions.md` records the authority boundary,
  classification rule, every persistent Orders and Production lifecycle field,
  current writers, locks/versions, terminal semantics, target graph owner, and
  explicit edges.
- Source revision, field authority, readiness, attention, between-stage
  milestones, forecast groups, queue identity, freeze, provenance, and job
  status are explicitly kept outside aggregate lifecycle graphs.
- The catalog records only the official Cents lifecycle values and explicitly
  treats delivery ordering as unknown.
- The non-concurrent correctness-hardening boundary and production-readiness
  rebaseline are explicit.

Verification:

```text
command: pnpm exec prettier --check docs/plan/lpms-state-transitions.md stateworks/work/done/lpms-operational-authority-remaining-day-forecast/{brief.md,network.yaml,state.yaml,evidence.md,human-actions.md,final-report.md}
exit: 0 after formatting the new catalog
time: 2026-07-26T14:16:00-04:00
summary: Catalog and active Stateworks package conform to repository formatting.
```

T0 is complete. No application, database, API, Worker, contract, or Processor
source was changed by the task.

## T1 - Separate Orders Source Observation from Canonical Adoption

Status: committed.

Implementation:

- Orders now makes two typed decisions for a valid newer source message:
  retain the source observation, then either adopt canonical fields or record an
  `observed_only` outcome.
- A source can create prospective demand, cancel and withdraw it before
  handoff, or cross the one-way fulfillment handoff once. Source completion
  never canonically completes a Pressly Order.
- After handoff, source lifecycle changes are retained without reopening,
  completing, canceling, or withdrawing canonical Pressly state.
- Source-owned non-lifecycle fields continue to adopt independently under the
  existing revision and field-authority rules.
- Observation-only outcomes do not increment canonical Order or Fulfillment
  versions and do not emit a fulfillment-demand outbox event.
- Created, applied, observed-only, replayed, stale, and equal-revision conflict
  outcomes are explicit. Expected post-handoff lifecycle differences no longer
  use `ORDER_SOURCE_TRANSITION_INVALID`.
- The latest source snapshot row and existing transaction locks are sufficient;
  no Orders schema or migration change was required.

Verification:

```text
command: pnpm --filter @pressly/orders test
exit: 0
summary: Orders unit and use-case suites passed, 2 files and 21 tests.
```

```text
command: pnpm docker:test-db:up && pnpm db:test:migrate && pnpm --filter @pressly/orders test:integration
exit: 0
summary: Orders Postgres integration suite passed, 1 file and 8 tests, including post-handoff observation retention, no version or outbox churn, independent non-lifecycle adoption, and pre-handoff cancellation.
```

```text
command: pnpm --filter @pressly/orders typecheck
exit: 0
summary: Orders TypeScript verification passed.
```

```text
command: pnpm --filter @pressly/orders lint
exit: 0
summary: Orders lint verification passed.
```

```text
command: pnpm exec prettier --check <T1 touched files> && git diff --check
exit: 0
summary: T1 formatting and whitespace verification passed.
```

T1 is complete. T2 may now align the Cents adapter and webhook delivery
outcomes with this committed authority boundary.

## T2 - Align the Cents Adapter and Webhook Delivery Outcomes

Status: committed.

Implementation:

- The Cents adapter has one exhaustive normalized status map:
  `SUBMITTED`, `READY_FOR_PICKUP`, and `PICKED_UP` propose open/unreleased;
  `IN_PROGRESS`, `READY_FOR_RETURN`, `OUT_FOR_DELIVERY`, and `COMPLETED`
  propose open/released; `CANCELED` proposes canceled/withdrawn.
- Cents completion therefore remains an observation and never proposes
  canonical commercial completion.
- Existing ingress normalization continues to map wire `CANCELLED` to
  `CANCELED`, and existing API and contract tests already cover every
  documented order status and order event.
- An Orders `observed_only` outcome is successful webhook delivery. Real
  5xx persistence failures remain retryable and deterministic 409 source
  conflicts remain permanent.
- No authentication, quarantine, source-location mapping, lease, retry,
  replay, or dead-letter behavior was weakened.

Verification:

```text
command: pnpm --filter @pressly/worker test
exit: 0
summary: Worker suite passed, 7 files and 42 tests.
```

```text
command: pnpm --filter @pressly/api test -- cents-webhook.adapter.test.ts
exit: 0
summary: Focused Cents API adapter suite passed, 1 file and 27 tests.
```

```text
command: pnpm --filter @pressly/contracts test -- cents.contracts.test.ts
exit: 0
summary: Focused Cents contracts suite passed, 1 file and 10 tests.
```

```text
command: Worker, API, and contracts typecheck and lint; touched-file Prettier; git diff --check
exit: 0
summary: All T2 static and formatting gates passed.
```

The existing API LPMS end-to-end fixture bypasses the Worker and Orders
source-observation seam. Expanding that topology solely for this assertion
would be broad fixture churn, so bounded integration proof is the real Orders
Postgres observation/adoption coverage in T1 plus the Worker observed-only
delivery test in T2.

## T3 - Consolidate Planning and Run Lifecycle Graphs

Status: committed.

Implementation:

- Production Policy now owns explicit graphs for Production Shift
  open-to-closed, Schedule Revision draft/accepted/superseded/rejected, and
  Production Run started-to-completed lifecycle.
- Creation, acceptance, supersession, Start initialization, and terminal
  completion use the graph initial states or exact returned transition
  decisions.
- Repositories compare the graph decision's persisted from-state and apply its
  to-state while preserving location locks, row locks, versions, idempotency,
  immutable schedule snapshots, final-batch predicates, and sibling-run
  predicates.
- Schedule acceptance and current-plan guards no longer contain duplicate
  lifecycle transition tables; they retain only hash, warning, selection,
  freshness, and actionability rules.
- Allowed events are exposed from the same graphs for future server read-model
  use.

Verification:

```text
command: pnpm --filter @pressly/production-policy test
exit: 0
summary: Production Policy passed, 13 files and 99 tests, including 17 exhaustive lifecycle tests.
```

```text
command: pnpm --filter @pressly/production test
exit: 0
summary: Production business suite passed, 27 files and 117 tests.
```

```text
command: Production Policy and Production typecheck and lint; Worker typecheck; touched-file Prettier; git diff --check
exit: 0
summary: All T3 static, composition, formatting, and whitespace gates passed. Only existing line-ending notices were emitted.
```

T2 and T3 are complete. T4 may now consolidate execution lifecycle graphs and
perform the additive production-order readiness/execution split. The existing
user-owned `0031` repair migration and metadata remain outside T4 ownership;
the next migration must be reserved separately and applied after `0031`.

## T4 - Consolidate Execution Lifecycle Graphs

Status: committed.

Implementation:

- Production Policy now owns explicit graphs for batch execution,
  production-order execution, stage execution including reconciliation events,
  and production-order stage attempts.
- Start, live placement, stage advance, floor reconciliation, routing, and
  terminal completion evaluate graph transitions before persistence. Their
  repositories apply the exact returned decisions under the existing
  location, run, version, queue, membership, and capacity locks.
- Scheduling mutation envelopes are compile-time specific:
  `unassigned -> scheduled`; terminal order mutations are
  `scheduled -> finished`. Use cases explicitly narrow graph results, without
  casts, before sending them to repositories.
- Production-order operational readiness is a pure projection of execution,
  canonical admission, manual admission, positive demand, and physical intake.
  Demand, intake, and manual-admission writers use that one derivation path.
- The physical `status` column remains the mixed-version compatibility
  operational cache and is exposed in Drizzle as `operationalStatus`.
  Authoritative execution is stored separately in additive
  `execution_status`.
- Migration `0032` deterministically backfills legacy `scheduled` and
  `finished` rows, defaults all other rows to `unassigned`, and adds a
  constrained execution index. Mixed-version resolution takes the monotonic
  maximum of legacy and new execution truth while compare-and-swap retains the
  raw persisted execution value.
- Accept and Start no longer expose incompatible repository operations under
  one name. Accept retains `lockAndValidateScheduleInput`; Start uses
  `lockAndLoadStartOrders`.
- Existing migration `0031`, its snapshot, test, and journal position were
  preserved byte-for-byte. It remains journal entry 31; `0032` is entry 32.

Verification:

```text
command: pnpm --filter @pressly/production-policy test
exit: 0
summary: Production Policy passed 14 files and 139 tests, including exhaustive batch, order-execution, stage-attempt, readiness, and invalid-state matrices.
```

```text
command: pnpm --filter @pressly/production test
exit: 0
summary: Production business unit suite passed 27 files and 117 tests.
```

```text
command: pnpm --filter @pressly/production test:integration
exit: 0
summary: Production Postgres integration suite passed 12 files and 21 tests, including placement races, hard-capacity membership, floor reconciliation, terminalization, and location isolation.
```

```text
command: pnpm --filter @pressly/api exec vitest run test/lpms/lpms-happy-path.e2e.test.ts
exit: 0
summary: App-composed LPMS happy path passed with graph-owned placement attempts and terminal execution.
```

```text
command: pnpm --filter @pressly/db exec vitest run test/production-order-execution-state-migration.int.test.ts --no-file-parallelism
exit: 0
summary: Migration 0032 forward backfill, defaults, constraint, old-writer compatibility, and raw-CAS convergence passed.
```

```text
command: Existing 0031 repair integration; db:test:migrate; Production Policy, Production, DB, API, Worker, and CLI typechecks; package lints; focused Prettier; git diff --check
exit: 0
summary: Migration chain, downstream composition, architecture boundaries, formatting, and whitespace gates passed. The existing 0031 SQL, snapshot, and test hashes remain unchanged.
```

T4 is complete. T5 may now remove source comparison from floor work without
changing source observation durability or restoring source transition
authority.

## T5 - Remove Source Comparison from Floor Work

Status: committed.

Implementation:

- Removed the standalone source-versus-floor computation package and all API,
  Docker, workspace-lock, and architecture references to it.
- Removed comparison and demand-reconciliation fields from Production Policy,
  Production business ports, contracts, API read composition, Home Order
  Control, Intake, and the legacy demand-outlook presentation.
- Retained the latest typed source snapshot as read-only audit context. It no
  longer creates an operator task, changes Pressly state, or controls action
  availability.
- Production Order Control attention now represents only actionable Pressly
  work: physical intake, placement, placement conflicts, and real floor-route
  conditions.
- Preserved the separate, real
  `reconcile-production-batch-progress` workflow for operator-confirmed
  physical progress.
- Added Postgres proof that completed, canceled, or otherwise different source
  lifecycle observations do not appear as floor attention while intake and
  placement work still do.

Verification:

```text
command: Targeted Contracts, Production Policy, Production, API, and Processor typecheck/build
exit: 0
summary: Turbo completed 25 of 25 tasks, including test TypeScript configurations and dependencies.
```

```text
command: Targeted Contracts, Production Policy, Production, API, and Processor tests
exit: 0
summary: Turbo completed 25 of 25 tasks; Processor 170, API 126, Production 117, Contracts 68, and Production Policy 135 tests passed.
```

```text
command: Focused Production Postgres Order Control integration
exit: 0
summary: Two integration tests passed, including source-difference exclusion and real intake/placement attention.
```

```text
command: Package lint; architecture boundaries; frozen lockfile install; Prettier; scoped git diff --check
exit: 0
summary: Five package lints, 68 architecture-boundary tests, dependency removal, formatting, and whitespace gates passed.
```

T5 is complete. The T6 preflight found that a required scheduler capability
must be wired through scheduling public/main exports and Production's required
port, with the concrete shared test scheduler updated. Those four paths were
added to T6's validated write scope before implementation; making the
capability optional or duplicating the algorithm would violate the
architecture.

The same preflight removed V1's read and verifier references to the deleted
comparison package. Keeping a verifier for intentionally deleted work would
make Stateworks encode an impossible completion condition.

## T6 - Build the Remaining-Day Forecast Read Model and Endpoint

Status: committed.

Implementation:

- Added a strict location-and-local-service-day production contract with an
  `asOf` instant, explicit assumptions, configured shifts, exact summaries,
  capacity risk, server-owned actionability, and distinct `inProduction`,
  `readyToPlace`, `expectedLater`, and `needsShift` groups.
- Added a deterministic scheduling projection that evaluates ready work
  sequentially through the exact online stable-insertion placement function.
  Accepted projections are merged only into an ephemeral snapshot; rejected
  and overtime proposals remain uncommitted decisions.
- Added a bounded, read-only, repeatable-read Production repository. It uses
  timezone-correct local-day bounds, includes overdue unfinished demand and
  unfinished work already in the selected day's active run, and excludes later
  uncommitted work.
- The Production use case resolves mixed-version execution truth through the
  authoritative policy, derives readiness from canonical facts, excludes
  finished work, and delegates appendability to the scheduling computation.
- No Users, Orders, or vendor lifecycle code enters Production. The response
  does not invent a shift, batch, bag count, overtime duration, physical
  progress timestamp, or finish time.
- The new endpoint is
  `GET /production/locations/:locationId/forecast?serviceDay=YYYY-MM-DD`.
  The narrow projection capability is required only at the Postgres/HTTP
  composition root, leaving the core business application test seam unchanged.

Verification:

```text
command: Contracts, Production Scheduling, and Production typecheck
exit: 0
summary: All three packages and their test TypeScript configurations passed.
```

```text
command: Contracts, Production Scheduling, and Production unit/HTTP tests
exit: 0
summary: Contracts 77/77, Scheduling 21/21, and Production 126/126 tests passed.
```

```text
command: Focused remaining-day Production Postgres integration
exit: 0
summary: Two tests passed, covering DST service-day boundaries, overdue/today/later inclusion, and exact active-run placement facts beyond the due window.
```

```text
command: Contracts, Scheduling, Production, and API lint/typecheck; architecture boundaries; scoped Prettier and git diff checks
exit: 0
summary: Static composition, 68 architecture-boundary tests, formatting, and whitespace checks passed. Existing line-ending notices were nonblocking.
```

T6 is complete. V1 is running the full backend authority, lifecycle, forecast,
database, API, Worker, integration, and end-to-end verification network before
Processor implementation begins.

## V1 - Prove Backend Authority, Lifecycle, and Forecast Correctness

Status: committed.

Verification:

```text
command: Orders, Production Policy, Production Scheduling, Contracts, and Worker tests
exit: 0
summary: 36 files and 296 tests passed: Orders 21, Production Policy 135, Scheduling 21, Contracts 77, and Worker 42.
```

```text
command: Production and API unit/HTTP tests
exit: 0
summary: 45 files and 251 tests passed: Production 126 and API 125.
```

```text
command: Orders and Production Postgres integration
exit: 0
summary: Orders 8/8 and Production 24/24 tests passed, including source observation/adoption, outbox, concurrency, exact placement, lifecycle, floor comparison removal, and remaining-day forecast reads.
```

```text
command: Database unit and role-configured integration verification
exit: 0
summary: Database unit 27/27 and integration 60/60 tests passed across 13 integration files, including migrations 0031 and 0032 and runtime/migration/backup role boundaries.
note: A first bare package invocation correctly refused to run without its required test-role environment. The repository's official db-security runner configured the isolated test roles and passed the same package suite.
```

```text
command: pnpm test:lpms:int
exit: 0
summary: The repository LPMS integration runner configured isolated test roles, migrated the test database, and passed DB, Users, Orders, Webhook Ingestion, Worker, Production, and Cents asset gates.
```

```text
command: pnpm test:lpms:e2e
exit: 0
summary: API Cents and LPMS application-composition coverage passed 49/49 tests; the existing Processor suite passed 170/170 tests. Two pre-existing Radix Sheet description warnings remained nonblocking.
```

```text
command: Typecheck and lint for Orders, Production Policy, Production Scheduling, Production, Contracts, DB, API, and Worker
exit: 0
summary: All changed backend packages and test TypeScript configurations passed; lint completed with zero warnings or errors.
```

V1 is complete. T7 may now implement the Processor information architecture
against a verified server-owned forecast contract without duplicating
lifecycle, readiness, placement, or action policy in the browser.

## T7 - Implement the Processor Forecast Workspace

Status: committed.

Implementation:

- Added a dedicated `/forecast` workspace and navigation destination. The
  selected service day is derived in the production location timezone and is
  sent to the dedicated forecast endpoint without client-side lifecycle,
  readiness, placement, capacity, or action reclassification.
- Added request sequencing and abort handling that invalidates an old request
  synchronously when its service day changes. Initial, manual, revision-driven,
  failed, stale, and empty states retain the last confirmed response where
  appropriate and never promote it to current data after a failed refresh.
- Added a detailed remaining-day view for the server's exact four groups,
  actual configured shifts, capacity risk, known-versus-missing weight facts,
  server-owned destination actions, and explicit forecast assumptions. No
  synthetic shift, batch, finish time, or raw internal identifier is shown.
- Replaced the oversized legacy demand-outlook surface with a compact Home
  summary and a bounded Schedule context slot. Forecast failure remains local
  and does not block Order Control or Scheduling.
- Removed the legacy DemandOutlook view, tests, and English/Spanish catalogs.
- Rebalanced Intake's fixed desktop table, moved it to the wider breakpoint,
  removed the redundant switch-state words, and aligned the Next action header,
  buttons, and status text to one normal left edge.
- Added English and Spanish copy, semantic section headings, labelled controls,
  44-pixel interactive controls, and regression coverage for routing, request
  races, settled stale data, known weight, action destinations, responsive
  Intake structure, and failure isolation.

Verification:

```text
command: pnpm --filter @pressly/processor test
exit: 0
summary: Processor passed 31 files and 189 tests. Two pre-existing Radix Sheet description warnings remained nonblocking.
```

```text
command: Processor typecheck, lint, Prettier check, and production build
exit: 0
summary: Application and test TypeScript, ESLint, all Processor formatting, and the 7,776-module Vite production build passed. The existing large-chunk advisory remained nonblocking.
```

```text
command: Architecture boundaries and scoped git diff check
exit: 0
summary: All 68 architecture-boundary tests and the Processor whitespace check passed.
```

T7 is complete. V2 is running the repository and rendered browser verification
before Stateworks closeout.

## V2 - Prove Processor Behavior and Visual Quality

Status: running.

Verified:

```text
command: pnpm --filter @pressly/processor test
exit: 0
summary: Processor passed 31 files and 189 tests. Two pre-existing Radix Sheet description warnings remained nonblocking.
```

```text
command: pnpm --filter @pressly/contracts test
exit: 0
summary: Contracts passed 9 files and 77 tests, including all 9 remaining-day forecast contract tests.
```

```text
command: pnpm typecheck; pnpm lint; pnpm build; git diff --check
exit: 0
summary: All 47 repository typecheck tasks, 26 lint tasks, 26 production build tasks, and the repository whitespace check passed. A first typecheck exposed root-owned generated forecast dist files from the local container workflow; ownership was restored to the repository user and the unchanged typecheck then passed.
```

```text
command: docker compose build processor; docker compose up -d --no-deps processor
exit: 0
summary: The current Processor production image was rebuilt and recreated at http://localhost:4173.
```

Rendered desktop verification:

- Home:
  `C:\Users\junni\AppData\Local\Temp\pressly-home-remaining-day-1900x950.png`
- Schedule:
  `C:\Users\junni\AppData\Local\Temp\pressly-schedule-remaining-day-1900x950.png`
- Forecast:
  `C:\Users\junni\AppData\Local\Temp\pressly-forecast-1900x950.png`
- Intake:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-final-1900x950.png`
- Same-input source comparisons:
  `C:\Users\junni\AppData\Local\Temp\pressly-home-before-after-composite.png`,
  `C:\Users\junni\AppData\Local\Temp\pressly-schedule-before-after-composite.png`,
  and
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-before-after-composite.png`.
- Home, Schedule, Forecast, and Intake matched the intended information
  hierarchy with no P0, P1, or P2 desktop finding.
- Forecast's assumptions disclosure expanded correctly. One Open Intake and
  one Open Schedule action navigated to their exact destinations.
- The browser console contained no warnings or errors.

Outstanding verification:

```text
command: pnpm format:check
exit: 1
summary: Root formatting is blocked only by three preserved pre-existing dirty files outside V2's write scope: packages/db/src/migrations/meta/0031_snapshot.json and the applied laundry-production and order-management memory.yaml files. Processor-scoped formatting passed.
```

```text
command: Chrome 390 x 844 viewport review
exit: blocked
summary: Chrome's viewport capability returned without changing the document from 1905 CSS pixels. Computer control then stopped at its URL-verification safety gate before resizing the Chrome window. No attempted desktop-width capture is accepted as mobile evidence.
```

At this checkpoint V2 remained running and could not be committed until a
fresh mobile visual pass and the preserved root formatting gate were resolved.
The later replan below supersedes that execution state without rewriting this
point-in-time evidence.

## 2026-07-26 - Post-Start Live-Placement Replan

Status: authorized replan applied before product implementation.

Steven authorized moving the Pending arrivals placement workflow from
Production to Schedule while keeping Production focused on live physical
execution. The supplied current-state review surface is:

```text
C:\Users\junni\AppData\Local\Temp\codex-clipboard-a97660bc-20c6-426b-a377-ce4f52a9ecc7.png
```

The authorization also requires Schedule date selection to use the shared
shadcn Calendar and Popover rather than native browser calendar controls.

This change refines the active package's existing Processor information
architecture and shares its dirty write surface. A separate work package would
conflict with the running V2 verification and with the queued
`lpms-order-control-correctness-hardening` package. The affected subgraph was
therefore replanned in this package:

```text
T4 + T6 + T7 -> T7A -> T7B -> V2 -> T8
```

- `T7A` adds a deterministic, explicit-run, server-owned live-placement read
  projection and reuses the existing online-stable-insertion authority.
- `T7B` moves placement review and mutation orchestration into a live Schedule
  context, removes the large Production placement surface, and retains a
  compact Production-to-Schedule handoff.
- `V2` was reset from running to pending because its Processor inputs are
  changing. Its existing desktop screenshots, interaction checks, console
  result, mobile blocker, and formatting blocker remain valid point-in-time
  pre-change evidence but are not final proof for the replanned surface.
- `T8` remains pending and will rebaseline correctness hardening and affected
  production-readiness proof only after final V2 verification.

The replan deliberately does not mark V2 invalidated: Stateworks treats an
invalidated task as an invariant-violation stop. Resetting the uncommitted
running verification to pending preserves its evidence while allowing the
replacement subgraph to execute.

Dirty-tree ownership was checked before the replan. The active package already
owns overlapping changes in Processor application composition, Schedule,
translations, fixtures, Production workspace reads, placement use cases, and
Production contracts. Production Board source is currently unchanged and
becomes part of T7B's explicit write scope. Unrelated Web marketing,
documentation, migration-snapshot, and memory files remain outside T7A and
T7B and must be preserved.

No product code, persistent state, memory, deployment, live Cents
configuration, or pilot state was changed by this replan.

## Stateworks Commands

```text
command: pnpm stateworks:validate stateworks/work/done/lpms-operational-authority-remaining-day-forecast/network.yaml
exit: 0
time: 2026-07-26T14:08:00-04:00
summary: Active network valid with 11 tasks.
```

```text
command: pnpm stateworks:verify stateworks/work/done/lpms-operational-authority-remaining-day-forecast/network.yaml --state stateworks/work/done/lpms-operational-authority-remaining-day-forecast/state.yaml
exit: 0
time: 2026-07-26T14:08:00-04:00
summary: Work incomplete, no stop reason, and no next task while T0 is running.
```

## External State

- Official Cents documentation is treated only as evidence for documented
  webhook event names and lifecycle status values.
- Cents delivery ordering is not documented and remains an external unknown.
- No production deployment, live webhook mutation, or pilot action is
  authorized or claimed by this package.

## Decisions

- Execute this package before
  `lpms-order-control-correctness-hardening`; the two packages must not run
  concurrently.
- Keep `lpms-production-readiness` stopped at its existing human gate and
  revalidate affected repository proof after this package.

## Open Risks

- The checkout contains pre-existing product, migration, documentation, and
  fixture changes. This package will preserve them and record overlapping
  ownership before editing.

## T7A - Server-Owned Live-Placement Read Projection

Status: committed.

Implementation:

- Added a deterministic, read-only live-placement projection to the
  authoritative Production workspace for the explicitly selected started run.
  The read returns ready unplaced orders, durable placement outcomes, one
  server recommendation, and only server-authorized exact mutable-batch
  targets.
- Reused the online stable-insertion scheduler for both the read projection and
  placement commits. Capacity before and after placement, projected finish,
  overtime, queue version, batch version, and zero automatic recourse therefore
  come from the same backend authority.
- Kept the read transactional and non-mutating. It does not create a run,
  recompute an accepted schedule, move existing work, fabricate another shift,
  or write queue, batch, membership, schedule, placement, or event state.
- Added explicit no-run, wrong-run, frozen, non-queued, missing,
  capacity-invalid, deterministic-ordering, and read-only Postgres proof.

Verification:

```text
command: focused Production live-placement tests
exit: 0
summary: 13 of 13 tests passed.
```

```text
command: scheduling online-placement tests
exit: 0
summary: 12 of 12 tests passed, including deterministic target ordering and hard-capacity behavior.
```

```text
command: Postgres live-placement read-only integration proof
exit: 0
summary: The workspace read changed no queue versions, schedule revisions or hashes, batches, memberships, pending placement, order versions, or work events.
```

T7A is complete.

## T7B - Move Post-Start Placement to Schedule

Status: committed.

Implementation:

- Added an explicit live Schedule context for a started shift and its existing
  production run. The view identifies the local shift window, run status,
  ready-order count, pulse capacity, planned finish, and a compact remaining-day
  Forecast link.
- Added the Ready to add to this run workspace. Automatic placement uses the
  server recommendation; exact placement uses the shared shadcn Sheet and
  Select, starts without a selection, and exposes only server-authorized
  targets with exact capacity and finish consequences.
- Preserved manager confirmation, queue and batch version fencing, overtime
  confirmation, authoritative refresh, settled content, and permission and
  conflict errors. The browser does not infer capacity, eligibility, lifecycle,
  target choice, or placement policy.
- Removed the large Pending arrivals placement surface and its mutation state
  from Production. Production now provides one compact count and Review in
  Schedule handoff while leaving queue membership and stage progress primary.
- Replaced the Forecast native date control with the shared shadcn Popover and
  Calendar. No native date, datetime-local, or time input remains under
  `apps/processor/src`.
- Added English and Spanish copy and focused coverage for route identity,
  automatic and exact placement, overtime, permission denial, stale queue and
  batch versions, loading, empty, error, responsive structure, focus
  restoration, and shadcn calendar behavior.

Verification:

```text
command: pnpm --filter @pressly/processor test
exit: 0
summary: 32 files and 200 tests passed. Two existing generic Sheet test description warnings remained nonblocking; the live placement sheet has its own accessible description.
```

```text
command: pnpm --filter @pressly/contracts test
exit: 0
summary: 9 files and 78 tests passed.
```

```text
command: scoped Prettier check for live Schedule, Forecast, Production handoff, contracts, and backend projection source
exit: 0
summary: All scoped files matched repository formatting.
```

T7B is complete.

## V2 - Final Verification After the Live-Placement Replan

Status: running.

Repository verification:

```text
command: pnpm typecheck
exit: 0
summary: All 47 tasks passed.
```

```text
command: pnpm lint
exit: 0
summary: All 26 tasks passed.
```

```text
command: pnpm build
exit: 0
summary: All 26 tasks passed. Existing Sentry instrumentation guidance and the Processor large-chunk advisory remained nonblocking.
```

```text
command: git diff --check
exit: 0
summary: No whitespace violations; Git emitted working-copy line-ending warnings only.
```

```text
command: pnpm format:check
exit: 1
summary: The repository-wide gate remains blocked only by three preserved pre-existing dirty files outside T7A and T7B: packages/db/src/migrations/meta/0031_snapshot.json, stateworks/memory/domains/laundry-production/memory.yaml, and stateworks/memory/domains/order-management/memory.yaml.
```

Local production runtime:

```text
command: pnpm --filter @pressly/processor build; docker compose build processor; docker compose up -d --no-deps --force-recreate processor
exit: 0
summary: The final Processor production bundle and local container were rebuilt and served at http://localhost:4173.
```

Rendered proof:

- Live Schedule:
  `C:\Users\junni\AppData\Local\Temp\pressly-live-schedule-desktop-final-2026-07-26.jpg`
- Desktop exact-placement sheet:
  `C:\Users\junni\AppData\Local\Temp\pressly-live-schedule-sheet-desktop-final-2026-07-26.jpg`
- Mobile 390 x 844 exact-placement sheet:
  `C:\Users\junni\AppData\Local\Temp\pressly-live-schedule-sheet-mobile-final-390x844-2026-07-26.jpg`
- Compact Production handoff:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-handoff-desktop-final-2026-07-26.jpg`
- Detailed findings:
  `design-qa.md`

The final browser read showed the authoritative placement for
TEST-INTAKE-004 as Batch 3, 101 to 194 of 224 lb, finishing at 11:06 PM. The
exact-placement sheet offered no implicit target, kept Add to selected batch
disabled, and restored focus to the triggering order after close. The Forecast
service-day control opened a dialog with a labelled July 2026 calendar grid;
the rendered document contained zero native date, datetime-local, or time
inputs. Schedule and the mobile sheet had no horizontal overflow, and the
browser console contained no warning or error.

V2 remains running only because its declared repository-wide formatting
verifier is blocked by the three preserved out-of-scope files above. T8 cannot
start until that gate is resolved; no deployment or pilot proof is claimed.

### Sidebar hierarchy polish

- Kept Home as a standalone first destination, then grouped the shared desktop
  and mobile Processor navigation into Daily work, Planning & review, and
  System while preserving existing routes, icons, active states, and actions.
- Reordered the operational workspaces to Intake, Schedule, Production inside
  Daily work so the grouped workflow follows the physical sequence.
- Added matching English and Spanish section labels and focused structural and
  mobile-drawer regression coverage.
- Processor navigation and application tests passed 34 of 34; Processor
  typecheck, lint, scoped formatting, production Docker build, and repository
  whitespace checks passed.
- Fresh desktop and 390 x 844 screenshots are recorded in `design-qa.md`; the
  browser console was clean and the mobile document had no horizontal
  overflow.

## V2 Closure

Status: committed.

The three preserved files named above were formatted without changing their
domain content. The repository-wide formatting gate then passed:

```text
command: pnpm format:check
exit: 0
summary: All repository files matched Prettier formatting.
```

The previously recorded typecheck, lint, build, whitespace, focused test,
production Docker, desktop, mobile, interaction, accessibility, and browser
console evidence remains the final local verification boundary for this
package. V2 is complete.

## T8 - Close Evidence and Rebaseline Dependent Work

Status: committed.

- Rebaselined `lpms-order-control-correctness-hardening` against the current
  explicit lifecycle graphs, source-handoff behavior, Order Control contracts,
  remaining-day forecast, and Processor information architecture. Its four
  recorded correctness gaps remain queued for fresh reproduction.
- Invalidated only the old production-readiness repository proof affected by
  the changed implementation baseline. Live Cents confirmation, deployment,
  and pilot gates remain stopped and were not rewritten.
- Reviewed the applied 2026-07-26 Order Management and Laundry Production
  memory deltas. They already contain the durable authority, lifecycle-graph,
  forecast, and Processor-boundary beliefs proven here, so no additional
  memory delta was warranted.
- Kept the separately queued production-order resolution work behind the
  correctness-hardening baseline so overlapping Production, History, contract,
  database, and Processor changes do not execute concurrently.

This package contains repository and local-runtime proof only. It makes no
deployment, live-vendor, production-data, retention-policy, or pilot claim.
