# Source-Neutral Architecture Hardening Evidence

## 2026-07-21 — T0 baseline

Confirmed repository facts:

- All 60 architecture-boundary tests passed before repair, proving the current
  import graph and closed-role vocabulary while not proving semantic ownership.
- Root lint and typecheck passed before repair.
- Canonical Order update and Fulfillment release authorize a route location but
  load the mutated aggregate by UUID without comparing its location.
- Canonical User routes borrow Production location authorization even though
  User profiles are global canonical entities.
- The Orders outbox producer and Worker independently define the event shape;
  the durable port exposes an unversioned string and unknown payload.
- The Orders outbox has no terminal failure state and the projector has no
  maximum-attempt decision.
- User and Order module-wide Postgres repositories currently own source
  ordering, authority, lifecycle, next-state, and effect decisions that the
  accepted direct-mutation workflow assigns to use cases.
- The API read model probes opaque source JSON for lifecycle status and owns
  source-versus-floor comparison classification.
- The Processor Order Control view owns presentation, local state, network
  orchestration, and rendering in one file.
- `docs/architecture.md` still describes the retired direct vendor-to-Production
  projector.

Unaffected and preserved:

- Exact source identity and no silent User merge.
- Source revision monotonicity and explicit field authority.
- Atomic Order mutation plus outbox insertion.
- Source-neutral fulfillment admission and Production's lack of Cents lifecycle
  authority.
- Release-gated scheduling and operator-confirmed floor truth.
- The separate queued order-routing and History correctness gaps.

No production state, database, webhook delivery, secret, or customer payload
was inspected or changed for this baseline.

## 2026-07-21 — T1 authorization and HTTP boundaries

- Added dedicated global User-management and location-scoped Order-management
  authorization actions, resources, policies, and guards.
- Canonical Order and Fulfillment mutations now carry the route location into
  the command and verify it against the locked aggregate before mutation.
- Canonical command routes use `/order-management/...` ownership and the common
  success envelope.
- Access-control tests passed: 26. API tests passed: 131, including canonical
  authorization, location mismatch, and response-envelope coverage.

## 2026-07-21 — T2 versioned and bounded Order delivery

- `packages/contracts` owns the schema-versioned fulfillment-demand event
  consumed by Orders and Worker.
- Order outbox rows now support a durable `dead` terminal state, terminal
  timestamp, lease-fenced completion, and bounded retries.
- Worker classifies invalid, permanent, transient, and exhausted delivery
  outcomes without logging customer payloads.
- Contract tests passed: 68. Worker tests passed: 33. Database schema tests
  passed: 27. The isolated database accepted migrations 0027 and 0028.

## 2026-07-21 — T3 capability-owned decisions

- Removed module-wide Users and Orders repositories.
- Create, update, source-following, source-resolution, release, and every outbox
  operation now own narrow transactional ports and adapters.
- Source ordering, authority, lifecycle transitions, versions, idempotency,
  and effect selection remain in use cases and pure policies. The explicit
  `persistence/` foundations contain only reusable PostgreSQL mechanisms.
- Users lint, typecheck, and 8 unit tests passed. Orders lint, typecheck, and 9
  unit tests passed. Their database integration suites also passed.

## 2026-07-21 — T4 typed reads and Processor roles

- Persisted typed source lifecycle metadata rather than inferring it from
  opaque vendor JSON in the read path.
- Moved source-versus-floor comparison into the pure
  `@pressly/order-control-projection` computation module.
- Split Processor Order Control into a pure presenter, orchestration model, and
  declarative view while retaining the existing interaction and localization
  contracts.
- Projection tests passed: 2. Processor tests passed: 159. API, Processor, and
  database type checks passed.

## 2026-07-21 — T5 documentation and enforcement

- Updated `docs/architecture.md` to describe the source-neutral
  Cents-to-inbox-to-Users/Orders-to-outbox-to-Production path and typed read
  composition.
- Extended architecture checks for resource scope, event ownership, typed
  source reads, Processor role separation, and the absence of module-wide
  Users and Orders repositories.
- Repository lint passed across 27 tasks. All 64 architecture-boundary tests
  passed.

## 2026-07-21 — T6 verification

All verification used local source and an isolated disposable test database:

- `pnpm format:check`: passed.
- `pnpm lint`: 27 tasks passed.
- `pnpm typecheck`: 49 tasks passed.
- `pnpm test`: 50 workspace tasks passed; 168 tooling tests passed.
- `pnpm test:lpms:int`: migrations and DB, Users, Orders, Webhook Ingestion,
  Worker, and Production suites passed.
- `pnpm build`: 27 tasks passed after removing Docker-owned ignored API and
  Processor build output; both directories were recreated by successful builds.
- The disposable `postgres-test` container was stopped after verification.

Non-blocking build notices remain unchanged: the Processor reports a large
JavaScript chunk and the marketing Web build reports optional Sentry navigation
instrumentation. Neither notice failed a verifier or belongs to this bounded
architecture repair.

No production migration, deployment, webhook replay, or live data mutation was
performed.
