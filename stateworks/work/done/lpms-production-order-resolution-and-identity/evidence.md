# LPMS Production-Order Resolution and Row Identity Evidence

## Work

- Work ID: `lpms-production-order-resolution-and-identity`
- Network:
  `stateworks/work/done/lpms-production-order-resolution-and-identity/network.yaml`
- Domain memory: `order-management` and `laundry-production`
- Started: `2026-07-26T23:35:44-04:00`

## Baseline Preservation

The work started from the intentionally dirty implementation tree produced by
the completed operational-authority package and unrelated pre-existing user
changes. No existing change was reset, discarded, or rewritten as cleanup.

The completed predecessor network verifies with `done: yes` and no stop
reasons. `lpms-order-control-correctness-hardening` was freshly rebaselined
against that implementation and remains queued with four known route and
History gaps. This package does not execute it concurrently and does not claim
those gaps are repaired.

## T0 - Rebaseline Backlog, Lifecycle, and Identity Evidence

Status: committed.

No production data was mutated. The aggregate database audit ran in a
read-only transaction and emitted no identifiers, customer data, or payloads.

### Backlog shape

- The local development database contains 17 Production orders at one
  location: 15 finished and 2 scheduled; none are unassigned.
- All 17 have physical intake evidence. Five have a manual admission override,
  13 appear in the current persisted shift selection, 16 have membership
  history, 16 have stage-attempt history, and none has pending placement.
- The two non-historical orders are currently committed to a started run; the
  15 remaining orders are already historical. The current safe, review, and
  age-bucket resolution candidate sets are therefore all zero.
- The fixture proves only that a bounded synchronous transaction is trivial
  for this dataset. It does not prove a production backlog bound, so bulk
  preview and commit retain an explicit maximum.

### Lifecycle and writer inventory

- `production-order-execution-lifecycle.policy.ts` remains the sole execution
  graph owner for `unassigned -> scheduled -> finished`.
- `production-order-operational-status.policy.ts` remains a derived readiness
  projection, not another lifecycle.
- The complete runtime writer set is demand application, intake, manual
  admission, priority, Start, live placement, routing, and terminal batch
  completion. No ordinary resolution or deletion writer existed.
- Relational batch-membership and stage-attempt rows retain authoritative
  historical participation. Route evidence is retained through membership
  provenance, attempts, and sanitized route work events; there is no separate
  route table.
- Current shift-selection rows are replacement-owned and therefore prove only
  current selection. Historical plan participation lives in immutable schedule
  snapshots and work events. Implementation must not mislabel the current-row
  predicate as historical evidence.
- Source demand application is the only resurrection boundary. It must still
  retain valid newer demand observations while preserving a resolved
  Production order until an explicit restore graph event occurs.

### Identity surface inventory

- Intake and Home desktop already render the approved order-number-primary,
  customer-name-secondary hierarchy.
- Home mobile, Schedule selection and live placement, all Forecast groups, and
  History run memberships omit customer identity.
- The existing API Order Control composer already resolves a bounded page in
  batched joins without browser per-row requests. The same API-owned
  composition pattern can cover the missing surfaces by production-order or
  demand identifiers.
- Customer identity remains outside Production tables and Production-owned
  contracts. Production batch summaries remain outside this individual-row
  task.

### Rebaseline conclusion

The predecessor authority package is complete, correctness hardening remains
queued and non-concurrent, and no changed domain assumption requires a replan.
The one storage nuance is explicit: immutable schedule snapshots/work events,
not current selection rows, are the source of historical-selection evidence.

## T1 - Define the Production-Order Resolution Lifecycle Graph

Status: committed.

Implementation:

- Added one kernel-defined, aggregate-owned graph:
  `open --resolve_without_production--> resolved_without_production` and
  `resolved_without_production --restore--> open`.
- Kept execution unchanged and exported typed states, events, decisions,
  rejections, allowed events, and the exact graph.
- Added one pure cross-lifecycle guard that blocks committed or historical
  Production participation and identifies intake, manual-admission, priority,
  and pending-placement facts requiring explicit review. The guard does not
  persist or transition state.
- Updated the transition catalog to distinguish persistent resolution,
  execution, orthogonal facts, derived operational status, and the read-only
  Archive presentation.

Verification:

```text
command: pnpm --filter @pressly/production-policy test
exit: 0
summary: Production Policy passed, 15 files and 144 tests, including the exhaustive resolution state-event matrix and cross-lifecycle guard cases.
```

## T2 - Persist Resolution and Implement Single-Order Commands

Status: committed.

Implementation:

- Added additive `production_orders.resolution_state` and coherent resolved
  actor, timestamp, reason, optional note, and optional bulk-operation
  metadata. Existing rows default to `open`; execution and operational status
  are not rewritten.
- Added the bounded
  `(location_id, resolution_state, due_at, id)` index and forward migration
  `0033`.
- Added one owner/admin-only resolve-or-restore route. The command is
  location-locked, version-bound, idempotent, actor-audited, and invokes only
  the authoritative resolution graph.
- The repository locks the order and obtains current selection, immutable
  schedule-snapshot participation, membership, attempt, route, intake,
  admission, priority, and pending-placement facts in one server-owned read.
- Committed or historical Production participation is blocked. Intake,
  manual-admission, priority, and pending-placement facts require explicit
  review; only an otherwise-uncommitted pending placement may be cleared
  atomically.
- Restore clears resolution metadata and re-derives operational readiness from
  current demand, admission, override, and intake facts. It never infers a
  completed or scheduled state.
- Demand application now retains newer source truth while forcing a preserve
  mutation for `resolved_without_production`; only the restore graph event can
  reopen Production work.

Verification:

```text
command: @pressly/db lint, typecheck, unit tests, focused 0033 migration integration tests, Drizzle drift check, and Prettier
exit: 0
summary: Additive schema, coherence constraints, index, migration, and generated metadata all passed.
```

```text
command: pnpm --filter @pressly/contracts test && pnpm --filter @pressly/contracts typecheck
exit: 0
summary: Contracts passed 9 files and 81 tests; strict resolve and restore commands and sanitized results are covered.
```

```text
command: pnpm --filter @pressly/production typecheck && pnpm --filter @pressly/production test
exit: 0
summary: Production typecheck passed; 32 files and 143 non-integration tests passed, including guards, source non-resurrection, HTTP validation, and single-order commands.
```

```text
command: pnpm db:test:migrate && focused production-order-resolution Postgres workflow
exit: 0
summary: Migration applied to the test database and the graph-governed resolve, restore, coherent row metadata, and work-event audit workflow passed.
```

## T3 - Build the Bounded Backlog Preview and Bulk Commit

Status: committed.

Implementation:

- Added a server-owned preview bounded to 250 orders and partitioned every
  reviewed item into Ready to archive, Review individually, Kept for safety,
  or Already historical.
- Bound the preview to a canonical SHA-256 hash covering location, cutoff,
  filter, reason, every candidate version, resolution state, and every guard
  fact used by classification.
- Added an owner/admin-only all-or-nothing commit. It reacquires the location
  scheduling lock, locks the exact order rows, recomputes the snapshot, rejects
  drift, invokes the resolution graph for every transition, and rolls the
  entire transaction back on any conflict.
- Used one bulk-operation UUID while retaining one sanitized, idempotent
  per-order event plus a summary event. Source age and terminal source states
  remain recommendation filters and never become transitions.
- Exposed strict preview and commit routes and composed the repository and
  use cases with the same UUID port used by the audit boundary.

Verification:

```text
command: focused backlog contracts, use-case, HTTP, and Postgres integration tests
exit: 0
summary: 4 contract tests, 7 use-case tests, 4 HTTP authorization and validation tests, and 1 transactional Postgres integration test passed.
```

```text
command: pnpm --filter @pressly/production typecheck && pnpm --filter @pressly/production test
exit: 0
summary: Production typecheck passed and the composed non-integration suite passed 34 files and 158 tests at the T3 checkpoint.
```

## T4 - Enforce Resolution Across Operational Reads and Writes

Status: superseded by the committed T4 proof below.

Implemented and verified so far:

- Central operational access policy now rejects resolved orders before intake,
  manual admission, priority, routing, stage advancement, and batch
  reconciliation. Repository reads and compare-and-swap writes also require
  `resolution_state = open` as a corruption defense.
- Selection, schedule creation, Start, live placement, terminal completion,
  active-board reads, Intake, Home Order Control, workspace, and remaining-day
  Forecast exclude resolved work. Home's operational third tab is presented as
  Open rather than All; finished work remains excluded.
- Demand application retains valid newer source observations but preserves
  resolved Production state, preventing external replay from resurrecting
  work.
- History now recognizes sanitized single resolution, restoration, and bulk
  per-order resolution events without exposing manager notes, review facts, or
  idempotency payloads. The read model exposes Restore only while the current
  order is still resolved and accepts a typed archived/restored filter.

Verification completed at this checkpoint:

```text
command: focused resolved-order command tests
exit: 0
summary: Routing, stage advancement, reconciliation, intake, admission, and priority all reject resolved work before mutation.
```

```text
command: focused Order Control, remaining-day Forecast, and History Postgres tests
exit: 0
summary: Resolved work is absent from operational counts and forecast demand; sanitized archived History remains visible and Restore availability follows current resolution state.
```

T4 remains running until the manager-readable History filter and restore action
are composed in Processor and their API/contract presentation tests pass.

## T4 - Enforce Resolution Across Operational Reads and Writes

Status: committed.

Final implementation:

- All operational command and read paths use the centralized resolution-access
  policy and persisted `resolution_state = open` defense. Home, Intake,
  Schedule, Forecast, Production, and forward counts exclude resolved work.
- History exposes only sanitized resolution/restoration details and server-owned
  Restore availability while retaining immutable audit evidence.
- Restore locks the order and reapplies current source due date, positive
  weight and provenance, commercial state, demand phase, and admission facts
  before deriving the reopened operational state.
- Identical concurrent single and bulk commands recheck idempotency after the
  location scheduling lock.
- Contracts, HTTP boundaries, and database constraints all require a nonblank
  note for reason `other`.

Verification:

```text
command: pnpm --filter @pressly/production test
exit: 0
summary: 35 files and 167 tests passed, including source non-resurrection, fresh-source restore, post-lock replay, guard, and operational-access coverage.
```

```text
command: pnpm --filter @pressly/production test:integration
exit: 0
summary: 15 files and 33 Postgres tests passed, including resolution, historical scheduling evidence, audit, and concurrency.
```

## T5 - Build the Processor Old-Order Review Experience

Status: committed.

- Added the manager-only Home entry point and shared archive explanation.
- Added one bounded desktop sheet and mobile bottom workspace with scope,
  shadcn Calendar cutoff, reason, note, four server-owned groups, exact
  confirmation, empty, loading, error, drift, replay, success, and continuation
  states.
- Preview and commit pagination use opaque server cursors; a zero-ready page
  can advance without first performing a mutation.
- History exposes archived/restored filters and a manager-only restore
  confirmation. No Delete or trash action exists.

Verification:

```text
command: pnpm --filter @pressly/processor test
exit: 0
summary: 37 files and 230 tests passed; order-resolution sheet, container, cutoff, app authorization, History restore, focus, localization, and responsive cases are included.
```

## T6 - Standardize Customer Identity on Operational Rows

Status: committed.

- Added one Processor-specific identity contract with display order number and
  customer display name.
- The API composes canonical Order and User identity for each bounded page in
  batched reads with business-name, personal-name, and unavailable precedence.
- One shared Processor component now renders the same primary/secondary
  hierarchy across Home, Schedule, Forecast, History, and Intake-compatible
  rows without adding customer fields to Production persistence.
- Cursor-page API tests prove identity composition beyond the first page.

Verification:

```text
command: pnpm --filter @pressly/contracts test
exit: 0
summary: 11 files and 92 tests passed, including resolution, backlog cursor, History, and operational-identity contracts.
```

```text
command: pnpm --filter @pressly/api test
exit: 0
summary: 19 files and 135 tests passed, including batched identity composition and cursor-page backlog routes.
```

## V1 - Full Lifecycle, Persistence, Contract, and Concurrency Proof

Status: committed.

```text
command: pnpm --filter @pressly/production-policy test
exit: 0
summary: 15 files and 146 tests passed.
```

```text
command: pnpm --filter @pressly/db test
exit: 0
summary: 5 files and 30 tests passed.
```

```text
command: pnpm test:lpms:int
exit: 0
summary: Full database, Users, Orders, webhook, Worker, Production integration, Production unit, and Cents asset chain passed with configured test roles and migrations.
```

```text
command: pnpm test:lpms:e2e
exit: 0
summary: Cents/API end-to-end passed 5 files and 49 tests; Processor passed 37 files and 230 tests.
```

```text
command: pnpm typecheck
exit: 0
summary: 47 workspace tasks passed.
```

```text
command: pnpm lint
exit: 0
summary: 26 workspace tasks passed.
```

```text
command: pnpm build
exit: 0
summary: 26 workspace tasks passed, including the production Processor bundle.
```

```text
command: pnpm exec vitest run tooling/test/architecture-boundaries.test.mjs
exit: 0
summary: 68 architecture-boundary tests passed.
```

```text
command: git diff --check
exit: 0
summary: No whitespace errors.
```

`pnpm format:check` is clean for this package and all implementation paths. The
repository-wide command reports only the unrelated, pre-existing
`stateworks/work/active/lpms-production-readiness/evidence.md`.

## V2 - Product Design, Accessibility, and Responsive Proof

Status: committed.

- Rebuilt the local API and Processor images. Postgres, API, Processor, and
  Worker were healthy; `GET /health/ready` and Processor `/health` succeeded.
- Chrome review used 1900 by 950 desktop and 390 by 844 mobile viewports.
- Rendered Home manager entry, review workspace, shadcn Calendar, truthful empty
  preview, Schedule summary, Forecast identities, History archived/restored
  filters, and Intake hierarchy were inspected in Spanish.
- Mobile page, dialog, and calendar scroll widths matched their client widths.
- Closing review restored focus to the trigger.
- Forecast proved personal-name and localized unavailable-customer fallbacks;
  History activity proved the shared accessible identity hierarchy.
- Browser console warnings and errors: zero.
- Populated ready, review, blocked, confirmation, drift, replay, success, and
  restore states are covered by the focused Processor component tests without
  mutating local data.

Detailed review:
`stateworks/work/done/lpms-production-order-resolution-and-identity/design-qa.md`.

## T7 - Durable Memory Assessment

Status: committed.

The confirmed durable domain learning belongs only in `laundry-production`:
the orthogonal Production resolution lifecycle, non-destructive operational
archive meaning, source non-resurrection, and exclusion of resolved work from
forward operations. Customer-row presentation remains implementation evidence
and is not promoted into durable domain memory.

Applied memory:

```text
command: pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/deltas/2026-07-27-production-order-resolution.memory-delta.yaml
exit: 0
summary: The source-backed delta validated before application.
```

```text
command: pnpm stateworks:memory:apply stateworks/memory/domains/laundry-production/deltas/2026-07-27-production-order-resolution.memory-delta.yaml
exit: 0
summary: The accepted delta was applied to laundry-production memory version 16.
```

```text
command: pnpm stateworks:memory:context laundry-production
exit: 0
summary: The laundry-production context pack was regenerated from memory version 16.
```

```text
command: pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/memory.yaml
exit: 0
summary: The applied domain memory validated at version 16.
```

No order-management or collaboration memory was changed. The completed package
is retained at
`stateworks/work/done/lpms-production-order-resolution-and-identity`.

```text
command: pnpm stateworks:validate stateworks/work/done/lpms-production-order-resolution-and-identity/network.yaml
exit: 0
summary: The completed network validated with 10 tasks.
```

```text
command: pnpm stateworks:verify stateworks/work/done/lpms-production-order-resolution-and-identity/network.yaml --state stateworks/work/done/lpms-production-order-resolution-and-identity/state.yaml
exit: 0
summary: done yes, no stop reasons, and zero next-ready tasks.
```
