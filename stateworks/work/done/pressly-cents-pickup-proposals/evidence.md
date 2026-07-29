# Pressly Cents Pickup Proposals Evidence

## Evidence Boundary

Repository and local-runtime evidence belong here. This work does not claim a
production deployment, production-data migration, or live Cents cutover.

## T0 — Reconcile the pickup-proposal baseline

Status: committed.

Characterized 2026-07-28 against the dirty
`codex/authoritative-production-workflows` worktree. Existing uncommitted
authority, order-management, Processor, documentation, and Stateworks changes
were treated as the baseline and were not reset.

### Current source-to-canonical mutation path

- `apps/api/src/http/webhooks/cents/cents-webhook.normalizer.ts` classifies
  every recognized Cents Order status as a processable order payload.
- `apps/worker/src/bootstrap/worker-jobs.composition.ts` routes every
  `cents:order` event to `cents-order.handler.ts`.
- `cents-order.handler.ts` resolves the location and customer for every status
  and calls `Orders.observeSource`.
- `observe-order-source.usecase.ts` calls
  `canonicalOrderForNewSource`/`mayCreateCanonicalOrderFromSource` when no
  source link exists and calls `decideOrderSourceUpdate` for later revisions.
- `observe-order-source.repo.ts` can create canonical Orders, fulfillments,
  source links, customer refs, snapshots, field authority, observation
  decisions, and outbox events or update canonical descriptive fields.
- `cents-customer.handler.ts` and `cents-marketing.handler.ts` independently
  call `Users.observeSource`; the customer handler also triggers
  `Orders.resolvePendingSourceCustomer`.
- The Orders outbox remains the only source-neutral path from committed
  fulfillment demand to Production. Cents lifecycle does not directly release
  fulfillment or advance Production.

### Source proof of the agreed gap

- `cents-order.handler.ts` has no `PICKED_UP` gate and forwards `order.status`
  only as lifecycle evidence after already performing location and customer
  work.
- `source-authority.policy.ts` gives Cents `auto_adopt` ceilings for the
  descriptive claims required by
  `mayCreateCanonicalOrderFromSource`, so non-pickup observations can create a
  canonical prospective Order.
- `decideOrderSourceUpdate` applies later descriptive Cents values to fields
  that continue following source.
- No persistent incoming proposal aggregate or pending-to-accepted/rejected
  graph exists.
- Existing `order_source_links(source, external_order_id)` is the exact
  canonical identity constraint but requires a canonical Order, so it cannot
  represent a pre-canonical proposal.

### Retained infrastructure

- Cents HTTP verification, normalization boundary, encrypted quarantine, and
  durable webhook inbox.
- Inbox payload hashes, idempotent claim/lease/retry/dead-letter behavior, and
  source-location binding.
- Exact `order_source_links` for already-canonical historical records.
- Canonical User, Order, fulfillment-release, Production, and Production
  resolution graphs.
- Canonical command receipts, optimistic versions, transactional Orders
  outbox, and source-neutral Production projection.

### Replaced or deleted runtime policy

- all-status Cents order projection;
- Cents-driven prospective canonical User and Order creation;
- later Cents descriptive-field adoption;
- source-following, source-capability configuration, source reconciliation,
  and pending-source-customer orchestration that becomes unreachable;
- Processor source-posture, field-authority, and lifecycle-divergence controls
  that no longer correspond to operator actions.

Migration `0035_order-source-authority-evidence.sql` is retained as historical
forward-only evidence because its application outside this worktree has not
been disproved. The pickup-proposal schema will use a new additive migration
and no historical backfill.

File overlap check:

- `lpms-production-readiness` remains active but owns readiness evidence and
  live verification rather than these implementation paths.
- `lpms-order-control-correctness-hardening` owns routing and History cursor
  repairs. This work will not change its route or History implementations.
- Existing unrelated deleted SEO and untracked marketing/image files remain
  untouched.

## T1 — Define the minimal incoming-proposal domain

Status: committed.

- `modules/business/orders/src/incoming-order-proposal.policy.ts` is the single
  graph definition for `pending --accept--> accepted` and
  `pending --reject--> rejected`; accepted and rejected are terminal.
- `modules/business/orders/src/incoming-order-proposal/` owns source-neutral
  proposal, list, Accept, and Reject application ports and use cases. Worker,
  API, repositories, and Processor do not carry a second transition table.
- `packages/contracts/src/orders/orders.contracts.ts` owns the strict,
  versioned location/list/decision boundary and server-owned available actions.
- Unit coverage proves the complete allowed/denied graph, exact linked-Order
  suppression, Accept, Reject-without-canonical-work, strict proposal effects,
  and opaque cursor failure.
- The Cents wire gate remains outside Orders under
  `apps/api/src/http/webhooks/cents`; Orders accepts only the source-neutral
  `pickup` proposal kind.

## T2 — Persist source records and immutable proposals

Status: committed.

- `packages/db/src/migrations/0036_incoming-order-proposals.sql` is additive:
  it creates immutable proposal and terminal-resolution tables, exact
  `(source, external_order_id)` uniqueness, version/effect checks, actor/reason
  evidence, foreign keys, and update/delete rejection triggers. It performs no
  backfill and does not modify migration 0035.
- `modules/business/orders/src/incoming-order-proposal/incoming-order-proposal.repo.ts`
  serializes exact source identity, expected proposal version, canonical Order
  creation, optional exact-source User creation, released fulfillment,
  command receipt, accepted source evidence, outbox effect, and resolution in
  one transaction.
- Postgres integration coverage proves immutable proposal and resolution rows,
  duplicate concurrent pickup submission, concurrent Accept with one effect,
  Reject with zero User/Order/fulfillment/outbox effect, terminal decision
  denial, command replay, and an exact canonical source-link winner without a
  duplicate Order.
- The schema and repository retain existing canonical source links and create
  no historical proposal rows.

## T3 — Cut Cents over to pickup-only proposal ingestion

Status: committed.

- `apps/api/src/http/webhooks/cents/cents-webhook.normalizer.ts` emits a
  processable payload only for a recognized Order event whose raw status is
  exactly `PICKED_UP`. Known pre/post-pickup values, future values, malformed
  non-pickup Orders, customer events, and marketing events become minimized
  ignored receipts.
- Vendor-only fields stay in the encrypted bounded quarantine receipt. The
  processable pickup payload contains only proposal data; the Worker writes a
  minimal normalized evidence record instead of retaining the raw envelope.
- `apps/worker/.../cents-order.handler.ts` receives only the narrow
  `OrdersWorkerApplication.proposeIncomingOrder` capability. It imports neither
  Users nor canonical lifecycle/release commands. Previously queued
  non-pickup values, including both CANCELED spellings, are acknowledged
  without resolving a location or calling Orders.
- `cents-customer.handler.ts`, `cents-marketing.handler.ts`, and their
  source-driven orchestration were deleted. A dependency-free ignored-event
  consumer drains older queued customer/marketing receipts.
- Focused green evidence currently includes 11 Cents contract tests, 30 API
  adapter tests, and 15 Worker Cents-order tests inside the green Contracts
  (105), API (150), and Worker (40) suites.

## T4 — Add incoming-order commands and API composition

Status: committed.

- `apps/api/src/http/order-management/orders/incoming-order-proposal.route.ts`
  exposes authenticated, authorized, location-scoped cursor listing and
  reasoned/versioned Accept and Reject commands.
- Route handlers map actor and location context only; proposal transitions,
  duplicate policy, customer creation, release, receipts, and outbox effects
  remain in Orders.
- Six focused route tests prove location/cursor serialization, invalid query
  rejection, actor-attributed Accept, reasoned Reject without canonical IDs,
  authorization denial, and typed stale-version conflict.
- The API happy-path test explicitly proposes and accepts pickup work before
  canonical Intake/Production use, while rejected proposal integration tests
  prove no downstream work.
- Obsolete API source-follow/configuration/reconciliation routes and CLI
  commands were deleted rather than redirected.

## T5 — Add Incoming to the Processor Orders workspace

Status: committed.

- `/orders` is the single order-management destination. `Incoming` is the
  default view, `Current orders` is secondary, and archive review remains
  nested under Current.
- Incoming uses the order-management port and server-bounded cursor paging. It
  renders recognizable Order/customer identity, contact detail, pickup, due,
  estimated demand, and provenance without vendor lifecycle semantics.
- Server-owned `availableActions` and `acceptBlockedReason` shape the action
  surface. Accept is primary, Reject is reasoned and secondary, and an exact
  existing canonical identity remains Reject-only.
- The model handles loading, empty, error, permission denial, typed stale,
  already-decided, and exact-identity conflicts. Deciding the final item on a
  later page returns to the preceding page.
- Reject-reason validation is separate from command failure. Changing the
  reason clears only validation; network/authorization failures remain command
  errors.
- The Incoming region uses a real heading ID and `aria-busy`. Controlled
  decision dialogs explicitly restore focus to the originating row action on
  Escape or Cancel.
- Focused Processor tests pass 12/12, including actions, paging, loading,
  errors, typed conflicts, capabilities, Enter/Escape, and focus restoration.
- Rendered desktop and 390 x 844 mobile verification is recorded in
  `design-qa.md`; no clipping or scroll lock was found, and the browser console
  returned no warnings or errors.

## V1 — Verify the pickup-proposal vertical slice

Status: committed.

### Repository gates

- Sequential full monorepo tests: 48/48 package tasks passed. Key current
  counts include Processor 253/253, API 150/150, Worker 40/40, Orders 23/23,
  and Production 174/174.
- Tooling and architecture tests: 178/178, including 71/71 architecture
  boundaries.
- `pnpm typecheck`: 47/47 tasks.
- `pnpm lint`: 26/26 tasks.
- `pnpm build`: 26/26 tasks.
- `pnpm format:check`: all matched files.
- `git diff --check`: clean.
- The first maximally parallel monorepo run timed out in two unrelated
  pre-existing Processor UI tests. The identical Processor suite passed
  253/253 in isolation and the complete monorepo passed with sequential package
  scheduling; this was resource contention, not a product failure.

### Integration gates

- `pnpm test:lpms:int` passed the disposable integration harness, including
  19/19 database migration files and the Orders/Production Postgres suites.
- Orders Postgres proposal coverage passed 13/13: concurrent proposal, exact
  identity, accept, reject, replay, terminality, canonical effects, and outbox.
- Local Docker rebuilt and ran healthy API, Worker, Processor, and Postgres
  services. API `/health/ready` and Processor `/health` both passed.
- Local synthetic webhook proof covered exact pickup, ignored `IN_PROGRESS`,
  accept, reject, pickup replay, and later `COMPLETED`/`IN_PROGRESS` events.
  Immutable proposal identity, customer, demand, version, and terminal
  resolutions remained unchanged after replays.
- Runtime source scans found no obsolete follow-source, field-authority,
  observation-decision, source-control, or reconciliation code in application
  paths. Orders and Users contain no Cents-specific domain coupling.

### Environment boundary

All runtime evidence is local and synthetic. No production deployment,
production database mutation, live Cents delivery, or operational cutover was
performed.

## T6 — Apply durable memory and close the work

Status: committed.

- Applied
  `memdelta-2026-07-28-cents-pickup-proposal-implementation` to Order
  Management memory version 6.
- Applied
  `memdelta-2026-07-28-cents-pickup-proposal-production-boundary` to Laundry
  Production memory version 20.
- The deltas explicitly deprecate the prior Cents capability-profile,
  source-following, reconciliation, observation-decision, and prospective
  canonical-creation model.
- The durable replacement records exact pickup-only proposal ingress, the
  terminal proposal graph, exact-identity suppression, transactional Accept,
  effect-free Reject, first-party canonical commands, and the boundary that
  keeps pending and rejected proposals outside Production.
- Both domain memories and both applied deltas validate.
- Both generated context packs were rebuilt from validated memory.
- The final report separates repository, local runtime, deployment, and
  operational evidence and claims no production deployment or live cutover.
