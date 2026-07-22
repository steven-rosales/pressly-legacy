# Source-Neutral Users and Orders Evidence

Implementation evidence is recorded by task. Repository proof is kept separate
from deployment, production migration, webhook replay, and live Cents proof.

## T0 — Baseline and cutover contract

Status: committed.

### Confirmed repository facts

- Baseline branch: `codex/lpms-floor-truth-planning` at `06f8fb5`.
- The Drizzle journal ends at migration
  `0023_lpms-shift-order-selection.sql`; `0024` and `0025` are available for
  additive expansion and Production cutover.
- Canonical Users and Orders modules and tables do not yet exist. Current peer
  business modules are Auth, Pricing, Production, and Webhook Ingestion.
- Cents ingress authenticates or explicitly accepts unsigned raw JSON, then
  records one normalized inbox event. The current adapter processes Order
  events and deliberately ignores Customer and Marketing events.
- The current Worker maps Cents lifecycle and source identity directly into
  Production `ApplyOrderDemand`. Production persistence still owns
  `demand_key`, `source_status_code`, and source revision fields.
- The live Cents help article returned HTTP 200 on 2026-07-21. It still lists
  six supported events: customer created/updated, order created/updated/
  completed, and customer marketing opt-in. Its Order example contains
  `order.id`, `orderCode`, lifecycle, services, an embedded customer, customer
  metrics, and attribution fields. Customer and Marketing examples do not
  document a source revision timestamp.
- `lpms-order-control-correctness-hardening` remains queued. This work excludes
  its route-capacity, between-stage routing, route-idempotency, and History
  cursor files and does not claim those separate gaps are closed.

### Accepted decisions now carried into implementation

- Every valid source Order becomes exactly one canonical Order whether or not
  a customer can be resolved.
- A known exact external customer identity resolves or creates a skeletal User
  before the Order commits. Contact values never select or merge a User.
- A missing canonical customer link is accompanied by an explicit reason;
  ambiguous nullable customer state is forbidden.
- Auth identity, User profile, commercial Order, fulfillment release, and
  Production floor execution remain separate facts.
- Order mutation and its outbox event commit atomically. Cross-module User then
  Order processing is monotonic and retry-safe rather than one distributed
  transaction.

### Expand, backfill, switch, contract sequence

1. Migration `0024` adds canonical Users, Orders, source links/snapshots,
   field authority, consent, duplicate candidates, fulfillments, and Order
   outbox tables, plus the nullable explicit Auth-to-User link.
2. Users and Orders modules are introduced behind pure command decisions and
   Postgres ports. Existing runtime behavior remains intact.
3. Cents adapters begin recording every supported observation. Exact customer
   resolution precedes canonical Order mutation.
4. Migration `0025` adds canonical fulfillment identity and source-neutral
   admission to Production demand, backfills legacy demand without inventing
   customer data or `orderCode`, and keeps legacy columns readable for one
   compatibility release.
5. One Worker path projects durable Order outbox events into Production.
   The direct Cents-to-Production path is removed so dual writes cannot occur.
6. API-owned reads compose User, Order, source, and Production facts. A later
   cleanup migration may remove compatibility columns only after separate
   production evidence.

### External unknowns and limits

- Cents does not document a stable delivery event ID in the referenced page;
  Pressly continues to deduplicate from event kind, source identity, source
  revision when supplied, and payload hash.
- Customer and Marketing observations without a vendor revision use the
  immutable inbox receipt time as their ordering coordinate. Equal coordinates
  with different hashes remain conflicts.
- No production database, deployment, webhook replay, Cents configuration, or
  customer payload was changed by T0.

## T1 — Architecture boundary

Status: committed.

- Added first-class `@pressly/users` and `@pressly/orders` workspace packages
  and included both manifests in API and Worker container dependency layers.
- Extended architecture tests so Users and Orders cannot import one another.
  Existing application-owned composition and closed filename rules remain in
  force.
- The existing kernel already supplies the required Result, Spec,
  StateMachine, Pipe, and Workflow primitives, so no new generic abstraction
  was introduced.
- Verification passed locally on 2026-07-21:
  `@pressly/kernel` 8 tests, kernel typecheck, and 60 architecture-boundary
  tests.

## T2 — Additive database expansion

Status: committed.

- Generated `0024_source-neutral-users-orders.sql` after migration `0023`.
  It adds canonical Users, Orders, generic items, fulfillments, exact source
  links, permanent latest snapshots, field authority, consent history,
  duplicate candidates, command receipts, and the Order outbox.
- Added a nullable explicit `auth_identities.user_id` foreign key. Phone and
  email remain non-unique lookup indexes; exact source identities are unique.
- Database checks require a resolved Order to carry a User ID and every null
  User ID to carry an explicit resolution reason. Outbox leases are also
  structurally constrained.
- The generated SQL contains no `DROP`, `DELETE`, or `TRUNCATE` statement and
  does not rewrite any pre-existing business row.
- Verification passed locally on 2026-07-21: 22 database unit/schema tests and
  database source/test typechecks.
- Rollback before use is removal of this additive migration from an unreleased
  build. After any environment applies it, rollback must be a forward
  compensating migration; existing canonical data must not be deleted.

## T3 — Canonical Users

Status: committed.

- Added `@pressly/users` as a first-class business module with pure source
  ordering policy and Postgres-backed use cases for source observation, direct
  create/update, source-following field authority, and append-only consent.
- Exact `(source, external_user_id)` links are the only automatic identity
  resolution mechanism. Name, phone, and email never select, merge, or attach a
  User. Potential contact matches remain inspectable duplicate candidates.
- Source snapshots retain the latest normalized representation and adapter
  version. Older revisions are ignored, exact replays are idempotent, and equal
  revisions with different hashes are conflicts.
- Direct and source mutations persist an idempotency receipt with trusted
  origin and actor context. The source adapter cannot impersonate an
  authenticated Pressly principal.
- Verification passed locally on 2026-07-21: 6 Users unit tests, 3 Users
  Postgres integration tests, package lint, and package typecheck.

## T4 — Canonical Orders and transactional outbox

Status: committed.

- Added `@pressly/orders` with source-neutral commercial Orders, generic line
  items, opaque optional User references, and extensible fulfillment type and
  admission state.
- Every valid source Order is persisted. Resolved customers require a User ID;
  absent customer identity is represented by a null User ID plus an explicit
  `not_provided` resolution reason.
- Order mutation, items, fulfillment, normalized source snapshot, command
  receipt, and `fulfillment_demand_changed` outbox event commit in one database
  transaction. A failed transaction leaves neither a partial Order nor an
  orphaned event.
- Outbox claims are leased, owner-fenced, retryable, and completion-safe. The
  same event ID produces the same Production idempotency key after a crash
  between downstream commit and acknowledgement.
- Verification passed locally on 2026-07-21: 7 Orders unit tests, 4 Orders
  Postgres integration tests, package lint, and package typecheck.

## T5 — Complete supported Cents observation path

Status: committed.

- Extended the typed Cents contract and API normalization to customer created,
  customer updated, order created, order updated, order completed, and customer
  marketing opt-in observations. Unsupported future event types remain ignored
  deliberately; malformed supported payloads remain diagnosable.
- `orderCode` is now the canonical display number. Cents `order.id` remains the
  exact external source identity. Embedded customer, services, money, due time,
  lifecycle, store, source revision, and additional documented fields are
  retained in normalized source snapshots.
- The Worker resolves or creates an exact skeletal User before observing the
  Order, records marketing consent separately, and resumes monotonically on a
  retry after partial success.
- Updated the checked-in Postman proof collection so customer and marketing
  examples expect queued processing rather than the removed ignore behavior.
- Verification passed locally on 2026-07-21: 6 Cents proof-asset tests, 27 API
  adapter assertions, 22 HTTP ingress assertions, and 30 Worker tests covering
  User-before-Order, missing customer, stale revision, exact replay, and retry
  behavior.

## T6 — Fulfillment-keyed Production projection

Status: committed.

- Replaced the vendor-shaped `ApplyOrderDemand` boundary with
  `ApplyFulfillmentDemand`. New Production demand is keyed by canonical
  fulfillment ID, version, and projection hash and contains source-neutral
  admission and commercial states.
- Removed the direct Cents-to-Production projection. The Worker now drains the
  durable Orders outbox through one idempotent projector, preventing dual
  writes.
- Migration `0025_source-neutral-production-demand.sql` expands and backfills
  canonical Order/fulfillment links for legacy demand without inventing
  `orderCode` or customer data. Existing compatibility columns remain readable
  and no destructive cleanup is included.
- Migration `0026_source-neutral-command-context.sql` safely adds and backfills
  trusted origin and actor data on existing command receipts before enforcing
  non-null constraints.
- Source-completed work remains a comparison fact. It cannot complete LPMS
  physical work. Unreleased demand remains forecast-only, and existing
  physical-intake and explicit-selection rules remain authoritative.
- Verification passed locally on 2026-07-21: 110 Production unit tests and 20
  Production Postgres integration tests, including source ordering, committed
  work preservation, release gating, and replay.

## T7 — Canonical commands and composed Processor reads

Status: committed.

- Added versioned User and Order contracts and manager-authorized API command
  routes. The API derives actor identity and origin from the authenticated
  principal; mutation payloads cannot choose their own trust context.
- Added an API-owned `ProcessorOrderView` composition over Users, Orders, and
  Production. Business modules remain isolated and Production does not copy or
  own customer PII.
- The read model exposes bounded canonical customer, display number,
  commercial state, fulfillment admission, and source-versus-floor comparison
  alongside the existing Production control row.
- Full API verification passed locally on 2026-07-21 with 133 tests, plus lint
  and typecheck.

## T8 — Processor operator experience

Status: committed.

- Enriched the existing ElevenLabs-derived, shadcn-based Order Control table
  and detail sheet with customer name and phone, canonical order number,
  commercial state, admission state, and precise source-versus-floor
  comparison language.
- Pre-release rows remain read-only and forecast-only. Action availability
  continues to come from the server-owned Production projection rather than
  browser inference.
- Legacy or unresolved data has explicit fallbacks instead of fabricated
  customer or order information. English and Spanish message catalogs were
  updated together.
- Processor verification passed locally on 2026-07-21 with 159 model,
  interaction, accessibility, adapter, and localization tests, plus lint,
  typecheck, and a successful production-stage container build. No manual
  browser screenshot is claimed as evidence.

## T9 — Complete local verification

Status: committed.

The following repository checks passed on 2026-07-21:

- `pnpm format:check` and `git diff --check`.
- `pnpm lint`: all 26 workspace package tasks passed.
- `pnpm typecheck`: all 47 workspace tasks passed.
- `pnpm test`: all 48 Turbo tasks plus 164 repository tooling tests passed.
- `pnpm test:lpms:int`: database, Users, Orders, webhook-ingestion, Worker,
  Production, Cents proof-asset, migration, and persistence integration suites
  passed against the local test database.
- `pnpm test:lpms:e2e`: 49 API/Cents/LPMS happy-path assertions and all 159
  Processor assertions passed.
- `pnpm exec vitest run tooling/test/architecture-boundaries.test.mjs`: all 60
  architecture checks passed.
- `pnpm docker:lpms:build`: local API, Worker, and Processor images built
  successfully.
- Both changed memory domains and both applied deltas validate. Regenerated
  `order-management` and `laundry-production` context-pack output is byte-for-
  byte identical to the checked-in context packs.

The local path is proven as a composition of bounded tests: documented Cents
wire normalization, User-before-Order processing, transactional Order/outbox
persistence, idempotent Production projection, API read composition, and
Processor rendering. The 800 lb application happy path also proves fixed-pulse
floor execution. A live running-stack Cents delivery is not claimed by these
tests.

No production database was migrated, no webhook was replayed, no Cents setting
was changed, and no application was deployed. Deployment must apply migrations
`0024`, `0025`, and `0026` in journal order before starting the new API and
Worker release.
