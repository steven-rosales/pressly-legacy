# Pressly Cents Submitted Candidate Lifecycle Evidence

## Evidence Boundaries

- Repository evidence describes the current uncommitted implementation and
  local verification only.
- Live evidence below is a read-only aggregate inspection captured before this
  work. It contains no customer payload, credential, secret, or private token.
- No deployment, webhook replay, or production-data mutation is authorized by
  this work.

## T0 - Reconcile the superseded pickup baseline

status: committed

### Live aggregate evidence

Read-only inspection of the production webhook inbox on 2026-07-29 found:

- 219 distinct Cents Orders across the inspected persisted receipts;
- zero `PICKED_UP` observations;
- zero `IN_PROGRESS` observations;
- observed statuses were `SUBMITTED`, `READY_FOR_PICKUP`, `COMPLETED`, and
  `CANCELED`;
- first-observed status was `SUBMITTED` for 145 Orders,
  `READY_FOR_PICKUP` for 52, and `COMPLETED` for 22; and
- observed changed edges were predominantly `SUBMITTED -> COMPLETED`,
  `READY_FOR_PICKUP -> COMPLETED`, `SUBMITTED -> READY_FOR_PICKUP`, and
  `SUBMITTED -> CANCELED`.

This proves that exact `PICKED_UP` cannot be the operational proposal trigger
for this Cents installation. It does not prove that Cents lifecycle is complete
or reliable.

### Repository baseline

- `apps/api/src/http/webhooks/cents/cents-webhook.normalizer.ts` emits process
  work only for exact `PICKED_UP` and minimizes all other statuses to ignored
  receipts.
- `apps/worker/src/jobs/process-webhook-inbox/cents/cents-order.handler.ts`
  drains every non-`PICKED_UP` receipt and submits a proposal only for pickup.
- `modules/business/orders/src/incoming-order-proposal.policy.ts` owns the
  current `pending -> accepted | rejected` graph.
- The proposal repository exact-locks `(source, externalOrderId)`, preserves an
  immutable snapshot, and suppresses exact canonical links.
- Acceptance currently creates an open canonical Order with a released
  fulfillment. That is invalid for `SUBMITTED`, which proves neither custody
  nor physical intake.
- Production already owns an orthogonal
  `open <-> resolved_without_production` graph and a guard that blocks
  operationally participating work and identifies facts requiring explicit
  review.
- Processor already separates pending Incoming candidates from canonical
  Current orders.

### Retained infrastructure

- signed and bounded webhook ingress;
- durable idempotent inbox and Worker claiming;
- exact source identity locking;
- immutable normalized source snapshots;
- authoritative kernel lifecycle graphs;
- command receipts and optimistic versions;
- canonical Orders transactional outbox;
- source-neutral Production projection;
- Production resolution and execution guards; and
- server-owned Processor action availability.

### Superseded policy and code

- exact `PICKED_UP` wire gating;
- pickup-specific proposal and UI terminology;
- ignoring `SUBMITTED`, `COMPLETED`, and `CANCELED` without exact subject
  correlation;
- the two-edge candidate graph without source closure or restore;
- released-on-acceptance behavior; and
- tests and runbooks that assert pickup-only ingestion.

### Work overlap

The active `lpms-production-readiness` gate remains invalidated and stopped.
The queued `lpms-order-control-correctness-hardening` package owns separate
routing and History cursor repairs. This work must not modify those algorithms
or claim readiness, deployment, or pilot completion.

## T1 - Define and persist the submitted candidate graph

status: committed

### Repository evidence

- `modules/business/orders/src/incoming-order-proposal.policy.ts` defines the
  six permitted edges:
  `pending -> accepted | rejected | source_closed`,
  `source_closed -> restored_pending`, and
  `restored_pending -> accepted | rejected`.
- `modules/business/orders/src/incoming-order-proposal/` owns exact-identity
  locking, candidate validation, tombstone suppression, versioned Accept,
  Reject, Restore, and source-close commands, and open plus unreleased
  canonical acceptance.
- `packages/db/src/schema/orders.schema.ts` and migration
  `0037_submitted_candidate_lifecycle.sql` add current candidate state,
  append-only transitions, exact-identity terminal tombstones, immutable
  snapshots, and accepted or rejected transition backfill. The migration
  retains historical `pickup` rows but the public proposal command accepts
  only `submitted_order`.
- `packages/contracts/src/orders/orders.contracts.ts` exposes explicit
  candidate states, source-closed review, source closure, and Restore without
  exposing a caller-selected target state.

### Verification

- `pnpm --filter @pressly/orders test -- --runInBand`
  - exit 0;
  - 4 files and 30 tests passed;
  - covers every allowed and denied graph edge, terminal-before-submitted
    tombstones, pending close, restored-pending source-close immunity,
    close-before-Accept denial, decision replay, Restore, Reject, and
    open plus unreleased acceptance.
- `pnpm --filter @pressly/contracts test -- --runInBand`
  - exit 0;
  - 12 files and 111 tests passed.
- `pnpm --filter @pressly/db test -- --runInBand`
  - exit 0;
  - 7 files and 37 tests passed.
- Orders, Contracts, and DB package type checks passed.
- Scoped changed-test lint, full Contracts lint, full DB lint, and
  `git diff --check` passed.
- The first direct `pnpm --filter @pressly/orders test:integration` attempt
  could not connect to the disposable Postgres endpoint. After the test
  database was started, `pnpm test:lpms:int` exited 0:
  - migration through `0037_submitted_candidate_lifecycle.sql` passed;
  - Orders repository integration passed 15 tests; and
  - the complete Orders unit suite passed again.

The repaired disposable-database run proves immutable snapshots, append-only
transitions, terminal tombstones, restored-pending behavior, exact-identity
concurrency, and migration backfill against real Postgres.

## T2 - Cut Cents ingress over to submitted and terminal observations

status: committed

### Repository evidence

- `apps/api/src/http/webhooks/cents/cents-webhook.normalizer.ts` classifies
  exact `SUBMITTED` as candidate, exact `COMPLETED` or `CANCELED` as terminal,
  and every other state as ignored.
- `packages/contracts/src/cents/` carries strict, bounded candidate, terminal,
  and ignored decisions with the external Order identity and relevant source
  revision.
- `apps/worker/src/jobs/process-webhook-inbox/cents/cents-order.handler.ts`
  translates candidate and terminal decisions into source-neutral Orders
  commands. It drains ignored states and does not import Production state
  transitions.

### Verification

- `pnpm --filter @pressly/api test -- --runInBand`
  - exit 0;
  - 20 files and 154 tests passed, including 33 Cents adapter tests and the
    incoming-candidate manager routes.
- `pnpm --filter @pressly/worker test -- --runInBand`
  - exit 0;
  - 7 files and 45 tests passed, including 20 Cents Order-handler tests and the
    legacy ignored-event drain.
- The focused adapter and Worker tests enumerate `SUBMITTED`, `COMPLETED`,
  `CANCELED`, `READY_FOR_PICKUP`, ignored known states, unknown states,
  malformed payloads, duplicate outcomes, and command failures.
- `pnpm test:lpms:int` exited 0 across webhook-ingestion integration and unit
  suites, Worker tests, Orders integration, and the Cents webhook asset tests.
- Orders integration explicitly covers terminal-before-submitted suppression,
  pending source closure, Restore, and later-source-close immunity; Worker
  tests prove the bounded translation and retry behavior on both sides of that
  transactional boundary.

## T3 - Correct canonical acceptance and guarded cleanup

status: committed

### Repository evidence

- Candidate Accept supplies `{ state: open, releaseState: unreleased }` to the
  canonical Orders transaction and retains source link, command receipt,
  decision transition, and outbox boundaries.
- `modules/business/production/src/change-production-order-resolution/`
  contains the source-neutral source-closed fulfillment policy and use case.
  Production's existing resolution graph and operational guard decide
  resolve, review, or no-op.
- Worker composition may request guarded resolution only after Orders returns
  an exact accepted canonical fulfillment. Cents status never maps to
  canonical complete, cancel, release, withdraw, intake, admission, schedule,
  batch, stage, run, or finished transitions.

### Verification

- `pnpm --filter @pressly/production test -- --runInBand`
  - exit 0;
  - 39 files and 186 tests passed;
  - includes source-closed resolution policy and use-case coverage for clean
    unreleased work, review-required facts, operational participation, replay,
    and no-op outcomes.
- Orders unit evidence above proves unreleased canonical acceptance and later
  source-close denial for restored or decided candidates.
- Worker unit evidence covers resolved, review-required, audit-only, existing
  canonical, malformed, and ignored terminal outcomes.
- `pnpm test:lpms:int` exited 0 with Orders integration at 15 tests and
  Production integration at 35 tests, followed by their complete unit suites.
- The rebuilt local API, Worker, and Processor containers started healthy from
  the current source. No production container, database, or customer data was
  touched.

## T4 - Update manager APIs and Processor projections

status: committed

### Repository evidence

- The manager API exposes location-scoped list views plus versioned Accept,
  Reject, and Restore commands.
- Processor keeps Incoming candidates separate from canonical Current orders,
  pages both active and source-closed review, and renders server-owned action
  availability.
- Incoming copy uses candidate and source-report language rather than vendor
  lifecycle control language.

### Verification

- The API unit suite above includes 7 incoming-proposal route tests covering
  location scope, authorization, versioned commands, and Restore.
- `pnpm --filter @pressly/processor test -- --runInBand`
  - exit 0;
  - 40 files and 254 tests passed;
  - includes 13 Incoming-order tests for identity, Accept, Reject,
    source-closed review, Restore, paging, loading, and settled-content
    behavior.
- Two pre-existing generic Sheet tests emitted non-fatal Radix dialog
  description warnings. The test command still exited 0; these warnings are
  not treated as browser-console proof.
- The current local API, Worker, and Processor images were rebuilt and only
  those local services were restarted. All three became healthy.
- A synthetic local `SUBMITTED` event produced one recognizable candidate in
  the real Processor. Rendered Chrome verification proved:
  - desktop table and 390 by 844 mobile card layouts without horizontal
    overflow;
  - accurate forecast-only acceptance copy and an accepted Current-order row
    with `Forecast only`, `Not assigned`, and `Bags not counted`;
  - source-closed review, Restore, audited Reject, and resulting notices;
  - mobile navigation, page scrolling, and a 569-pixel scrollable order sheet
    with actions and customer identity reachable;
  - decision-dialog and navigation focus restoration after their close
    animations; and
  - zero browser console warnings or errors during the pass.
- The first rendered acceptance dialog exposed stale released-on-acceptance
  copy. English, Spanish, and the focused test were corrected; the Processor
  image was rebuilt and the final dialog copy was reverified in Chrome.

## V1 - Submitted candidate vertical-slice verification

status: committed

### Proven repository gates

- Orders, Contracts, DB, API, Worker, Production, and Processor unit suites
  listed above passed.
- `pnpm test:lpms:int` exited 0 after disposable migration through `0037`,
  including DB, Users, Orders, webhook-ingestion, Worker, Production, and Cents
  asset gates.
- `pnpm typecheck` passed 47 of 47 tasks.
- `pnpm lint` passed 26 of 26 tasks.
- `pnpm build` passed 26 of 26 tasks.
- `pnpm format:check` passed after formatting the 11 reported files.
- Focused architecture and topology assertions passed 78 of 78 tests.
- `git diff --check` passed.
- The two proposed memory deltas validate structurally:
  - `memdelta-2026-07-29-cents-submitted-candidate-lifecycle`;
  - `memdelta-2026-07-29-cents-submitted-candidate-production-boundary`.

### Rendered and local-runtime gate

- The real local chain `webhook -> durable inbox -> Worker -> Orders -> API ->
Processor` produced, closed, restored, accepted, and rejected synthetic
  candidates.
- Acceptance created an open, forecast-only canonical Order rather than
  silently releasing it. Source closure created reviewable evidence without a
  canonical Order. Restore returned that work to Needs review, and Reject
  closed it with a required reason.
- Desktop and 390 by 844 mobile layouts, internal scrolling, navigation,
  dialog focus restoration, and browser console passed as detailed in
  `design-qa.md`.
- Stateworks network and lifecycle verification passed before closeout with no
  stop reason. A final done-path verification is required after T5 moves the
  package.

No deployment, production webhook replay, production-data change, or pilot
readiness is claimed.

## T5 - Apply durable memory and close the work

status: committed

- Source-backed deltas were created, validated, applied exactly once, and
  marked `applied` at:
  - `stateworks/memory/domains/order-management/deltas/2026-07-29-cents-submitted-candidate-lifecycle.memory-delta.yaml`;
  - `stateworks/memory/domains/laundry-production/deltas/2026-07-29-cents-submitted-candidate-production-boundary.memory-delta.yaml`.
- Order Management advanced to memory version 7. Laundry Production advanced
  to memory version 21.
- Both domain memories and both applied deltas validate.
- Both generated context packs reproduced byte-for-byte across two consecutive
  generations. Their final SHA-256 hashes are:
  - Order Management:
    `85c22b91797f8f8457801f30949037004df1a935a8f067f10ad9f78405a4c352`;
  - Laundry Production:
    `24d6e95c01ad8f6b213f332030fea1d33c13b3c41307783d5c63aa0d63a9012d`.
- The active `lpms-production-readiness` brief now carries a dated submitted
  candidate rebaseline while preserving its open H1 gate and making no
  deployment or pilot-readiness claim.
- The work lifecycle is complete. Its final verifier is run once before and
  once after moving the package to
  `stateworks/work/done/pressly-cents-submitted-candidate-lifecycle/`.
