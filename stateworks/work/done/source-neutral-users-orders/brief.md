# Source-Neutral Users and Orders

## Status

Complete local architecture and implementation work. The known
`lpms-order-control-correctness-hardening` gaps remain a separate queued scope;
this work must not modify its routing or History ownership surfaces or claim
that those gaps are closed.

This package records the complete implementation shape. It does not authorize a
production migration, webhook replay, or deployment by itself.

## Task Shape

This is a cross-module business workflow with external input, personally
identifiable information, source ordering, optimistic concurrency,
transactions, retries, and a downstream execution boundary. It deserves a
small hexagonal shape: pure decisions at each domain center, transactional use
cases around them, persistence ports, and Cents/HTTP/Postgres at the edges.

It does not justify microservices, a broker, event sourcing, or a generic merge
platform.

## Observable Outcome

- Every documented Cents customer, marketing-consent, and order event is
  normalized and processed rather than customer and marketing events being
  ignored.
- Pressly owns canonical User and Order records independent of Cents.
- A Cents order displays `orderCode`; Cents `order.id` remains only its external
  identity.
- Customer name and phone are available on Processor order views through the
  canonical User linked to the Order.
- Every valid source Order is retained even when customer identity is absent.
  A known exact source customer identity creates or resolves a skeletal User;
  a nullable canonical customer link is permitted only with an explicit
  missingness reason that can be reconciled later.
- Direct Pressly commands and source observations share the same User and Order
  use cases and concurrency rules.
- Orders emits source-neutral fulfillment demand through a transactional outbox.
- Production no longer stores or interprets Cents lifecycle codes as business
  authority.
- Pre-release work remains forecast-only; released wash-and-fold fulfillment
  still requires positive weight, physical bag intake, and explicit shift
  selection before executable scheduling.
- Source-completed work that is unfinished in LPMS is shown for comparison and
  never auto-finishes the floor.

## System Shape

```text
Cents HTTPS -> webhook inbox -> Cents observation adapter --+
                                                         |
Pressly API/dashboard -> typed commands -----------------+--> Users
                                                         `--> Orders
                                                               |
                                                     same transaction
                                                               v
                                                        order outbox
                                                               |
                                                    idempotent Worker
                                                               v
                                                          Production

Auth -- optional explicit user_id link --> Users

Users + Orders + Production --> API-owned composed read model --> Processor
```

## Module Ownership

### `modules/business/users`

Owns:

- canonical profile identity and version;
- name and phone for the first slice;
- exact external identity links;
- permanent latest normalized source snapshots;
- per-field source versus Pressly authority;
- append-only marketing consent observations; and
- possible-duplicate signals without automatic merge.

Does not own credentials, sessions, roles, orders, or production execution.

### `modules/business/orders`

Owns:

- canonical commercial Order identity and minimal lifecycle;
- customer User reference as an opaque ID;
- human-facing order number;
- generic order items, money, due time, and fulfillment records;
- exact external identity links and latest normalized source snapshots;
- versioned direct and source-driven mutations; and
- an Order-local transactional outbox.

It accepts a User ID but cannot import the Users module. It represents
wash-and-fold as a fulfillment type code, not as the shape of the Order
aggregate.

### `modules/business/auth`

Continues to own authentication identities, credentials, MFA, sessions, and
roles. `auth_identities.user_id` is nullable and explicitly assigned. Email or
phone never creates that link implicitly.

### `modules/business/production`

Owns only laundry demand admission and physical execution. Replace the current
vendor-shaped `ApplyOrderDemand` boundary with `ApplyFulfillmentDemand`, keyed by
canonical `fulfillmentId` and carrying a source-neutral release state.

### Application composition

- API owns HTTP parsing, authentication, authorization, and cross-module read
  composition.
- Worker owns the Cents process manager and the Order-outbox projector.
- Peer business modules do not import one another. Existing architecture tests
  continue to enforce this.

## Declarative Core and `@pressly/kernel`

Use the existing kernel deliberately:

- `Result` for expected validation, conflict, stale-source, duplicate, and
  persistence failures;
- `Spec` for composable command and transition guards;
- `stateMachine` for the small Order and fulfillment lifecycles when its graph
  makes allowed transitions clearer;
- `pipe` plus `result.collect` for pure Cents field and service normalization;
  and
- `workflow` only when an application-level sequence remains clearer as named
  steps and does not obscure one required database transaction.

Each domain operation follows the same visible data flow:

```text
parse at boundary
-> load current aggregate and authority
-> pure decide(current, command)
-> Result<next state + effects, expected error>
-> persist state + outbox in one transaction
-> map result at the application edge
```

Do not put `User`, `Order`, Cents, database, HTTP, or outbox types in the kernel.
Add a new kernel primitive only if at least two independent modules need the
same algebra and tests prove the abstraction. The present plan can use the
existing primitives without inventing a framework.

## Canonical Commands

Every mutation carries an envelope with:

- `idempotencyKey`;
- `origin` such as `cents`, `pressly_dashboard`, or `customer_account`;
- an actor or system principal;
- `expectedVersion` for direct canonical mutations; and
- source identity, source revision time, payload hash, and adapter schema
  version for source observations.

Initial User commands:

- `ObserveUserSource`;
- `CreateUser`;
- `UpdateUser`;
- `FollowUserSourceField`; and
- `RecordUserConsent`.

Initial Order commands:

- `ObserveOrderSource`;
- `CreateOrder`;
- `UpdateOrder`;
- `ReleaseFulfillment`; and
- `WithdrawFulfillment`.

Production receives only `ApplyFulfillmentDemand` from the outbox projector.

## Data Model

### Users

- `users`: canonical profile, version, name, phone, timestamps, active state.
- `user_source_links`: unique `(source, external_user_id)` to `user_id`.
- `user_source_snapshots`: one latest normalized JSON snapshot, revision,
  adapter version, and hash per source link.
- `user_field_authorities`: field-level `source` or `pressly` authority without
  duplicating field values into generic JSON.
- `user_consents`: append-only marketing consent observations with source and
  observed time.
- `user_duplicate_candidates`: inspectable possible matches with resolution
  status; no merge behavior in this slice.

Phone and email indexes are non-unique. Exact source links, not contacts, own
deduplication.

### Orders

- `orders`: canonical ID, optional customer User ID, display number, minimal
  `open | completed | canceled` commercial state, due time, currency, totals,
  version, and timestamps.
- `order_items`: generic service/product code, description, quantity, unit,
  unit price, total, and source metadata.
- `order_fulfillments`: fulfillment type code and source-neutral
  `unreleased | released | withdrawn` state.
- `order_source_links`: unique `(source, external_order_id)` to `order_id`.
- `order_source_snapshots`: permanent latest normalized source representation,
  revision, adapter version, and hash.
- `order_field_authorities`: explicit source versus Pressly authority for
  mutable canonical fields.
- `order_outbox_events`: versioned payload, attempts, lease, completion, and
  failure metadata for idempotent downstream projection.

### Auth and Production links

- Add nullable `auth_identities.user_id -> users.id` without uniqueness so one
  User may later have more than one authentication method.
- Add a unique canonical `fulfillment_id` to the Production demand projection.
- Replace Production's vendor-derived phase with
  `unreleased | released | withdrawn` admission state.
- Retain legacy source columns during the compatibility release; remove them
  only in a later cleanup migration after production evidence proves the new
  path.

## Cents Mapping

- Normalize all six documented event kinds into a discriminated observation
  union at `apps/api/src/vendors/cents`.
- Preserve unknown documented fields in the latest normalized source snapshot;
  promote only queryable business fields into typed columns.
- Customer events update Users.
- Marketing opt-in events append consent history.
- Order events resolve the embedded or referenced Cents customer first, then
  update Orders and its fulfillment.
- `orderCode` becomes the display number; `order.id` remains the source link.
- Before `IN_PROGRESS`: fulfillment is unreleased and forecast-only.
- `IN_PROGRESS` and later non-canceled states: fulfillment is released.
- Canceled: fulfillment is withdrawn.
- Later/completed source states remain available to the composed read model for
  source-versus-floor comparison and never complete Production.

The webhook inbox stores the normalized payload required for retry. Permanent
latest snapshots live in Users and Orders. The existing encrypted quarantine
continues to retain exact raw receipts only for its bounded retention window.

## Consistency Model

- Lock by exact source link before source revision comparison.
- Older revision: record an ignored outcome.
- Same revision and same hash: idempotent replay.
- Same revision and different hash: durable conflict; do not overwrite.
- Newer revision: apply only fields whose current authority permits the source.
- Direct command: compare `expectedVersion`; stale clients receive a typed
  conflict and current version.
- User source processing commits before Order processing. A retry reuses the
  exact User source link.
- Order state and Order outbox event commit atomically.
- Production consumes each outbox event by event ID and returns the original
  committed result on replay.
- A failed downstream projection leaves the outbox event retryable without
  rolling back the canonical Order.

## Processor Read Model

Create an API-owned, read-only `ProcessorOrderView` that composes:

- User: name and phone;
- Order: display number, commercial state, due time, items, and fulfillment;
- Production: intake, release readiness, selection, batch, stage, and floor
  status; and
- source comparison: latest source status and disagreement reason.

Primary UI language stays source-neutral. Cents values appear only as secondary
source metadata. Existing Processor routes can be enriched without giving the
browser cross-module write authority.

Manual User and Order command routes are included and manager-authorized, but a
full back-office editing UI is intentionally a separate product slice.

## Migration and Cutover

Use expand, backfill, switch, then contract:

1. Add all new tables, indexes, foreign keys, and nullable compatibility links.
2. Backfill one canonical Order and fulfillment for each existing Production
   demand. Preserve the current display reference as `legacy_external_id` when
   no historical `orderCode` exists; never invent customer data.
3. Deploy the new Cents observation path and Order outbox projector. The old
   schema remains readable during rollout.
4. Switch new webhook processing to Users and Orders, with one and only one
   downstream Production projection path.
5. Verify source-link uniqueness, row-count parity, outbox drain, idempotent
   replay, and Processor read composition.
6. Leave destructive legacy-column removal for a later verified cleanup work
   item.

Existing orders may lack customer or `orderCode` until a fresh Cents revision or
an authorized reconciliation supplies it. Backfill records that absence; it
does not decrypt historical quarantine or guess.

## Planned File Shape

```text
modules/business/users/
  src/{main,public}.ts
  src/observe-user-source/*.{port,policy,usecase,repo}.ts
  src/create-user/*.{port,policy,usecase,repo,route}.ts
  src/update-user/*.{port,policy,usecase,repo,route}.ts
  src/follow-user-source-field/*.{port,policy,usecase,repo,route}.ts
  src/record-user-consent/*.{port,policy,usecase,repo}.ts
  test/...

modules/business/orders/
  src/{main,public}.ts
  src/observe-order-source/*.{port,policy,usecase,repo}.ts
  src/create-order/*.{port,policy,usecase,repo,route}.ts
  src/update-order/*.{port,policy,usecase,repo,route}.ts
  src/change-fulfillment-release/*.{port,policy,usecase,repo}.ts
  src/claim-order-outbox/*.{port,usecase,repo}.ts
  test/...

packages/db/src/schema/{users,orders}.schema.ts
packages/db/src/migrations/0024_source-neutral-users-orders.sql
packages/db/src/migrations/0025_source-neutral-production-demand.sql

packages/contracts/src/{users,orders,cents}/...

apps/api/src/vendors/cents/...
apps/api/src/read-models/processor-orders/...
apps/worker/src/vendors/cents/...
apps/worker/src/order-outbox/...

modules/business/production/src/apply-fulfillment-demand/...
apps/processor/src/{ports,adapters,features}/...
```

Exact filenames must retain the repository's closed role vocabulary. The tree
is a boundary map, not permission to create empty abstractions.

## Verification

- Pure tests for field authority, source ordering, exact replay, divergent same
  revision, no silent contact merge, commercial lifecycle, and fulfillment
  release.
- Module use-case tests with fake ports and no database or framework imports.
- Postgres integration tests for unique source links, optimistic versions,
  transaction rollback, outbox atomicity, claims, retries, and concurrent
  identical events.
- Cents contract fixtures for all documented event kinds, `orderCode`, embedded
  customer, customer updates, marketing opt-in, extra fields, and malformed
  boundaries.
- Crash-window proof: Order commit followed by Worker failure still projects
  exactly once after retry.
- Production tests proving vendor strings are absent, pre-release intake remains
  unschedulable, cancellation preserves committed work, and completion never
  advances floor truth.
- API authorization and composed-read tests.
- Processor tests for customer display, source-neutral labels, comparison state,
  and missing-customer fallbacks.
- Architecture tests for peer-module isolation, app-owned composition, closed
  filenames, Docker manifest coverage, and forbidden Cents vocabulary in
  Production.
- Migration tests on an empty database and a representative pre-migration
  snapshot, then full formatting, lint, typecheck, unit, integration, and Docker
  topology checks.

## Intentional Omissions

- No automatic User merge.
- No generic conflict-resolution engine.
- No full event sourcing.
- No Kafka, SNS/SQS, or new service boundary.
- No dry-cleaning production state machine.
- No broad back-office User/Order UI in this work.
- No destructive removal of legacy Production demand columns in the first
  release.

## Done Means

- The source-neutral write path is the only path for new Cents business events.
- Customer and marketing events are processed and inspectable.
- Orders display `orderCode` when supplied and resolve customers through exact
  source links.
- Direct and webhook mutations obey the same authority, concurrency, and
  idempotency rules.
- Order mutation plus outbox is atomic; Production projection is retryable and
  exactly-once in effect.
- Production contains no Cents lifecycle or source-key authority.
- Processor reads include name and phone and clearly distinguish commercial,
  source, and floor state.
- Backfill and compatibility behavior are proven without invented data.
- Stateworks evidence distinguishes local implementation proof from deployment,
  migration, webhook replay, and production verification.
