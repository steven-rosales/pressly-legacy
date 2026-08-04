# Evidence

## Work

- Work ID: `scalable-functional-module-architecture`
- Started: 2026-08-03
- Branch: `agent/module-architecture-refactor`
- Starting commit: `9e95d04`
- Starting worktree: the uncommitted, locally verified
  `module-architecture-refactor` result plus user-owned unrelated changes.

## T0 - Baseline behavior and migration inventory

### Verified starting topology

The transitional compiler registers nine peer modules:

| Current authority            | Target authority                             | Migration decision                                                                                      |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `business/auth`              | `security/identity`                          | Rename the authority; keep authentication, session, MFA, and workforce identity together.               |
| `business/orders`            | `business/orders`                            | Retain authority; reorganize application features and aggregate language.                               |
| `business/pricing`           | `business/pricing`                           | Retain authority and use it as the grammar pilot.                                                       |
| `business/production`        | `business/production`                        | Retain authority; absorb intrinsic Production policy and scheduling.                                    |
| `business/users`             | `business/users`                             | Retain authority; separate user language from persistence mechanics.                                    |
| `business/webhook-ingestion` | `integration/webhook-ingestion`              | Move to integration authority because it owns a durable protocol-neutral inbox, not business lifecycle. |
| `policy/access-control`      | `security/authorization`                     | Retain independent authority but remove Express and contract parsing.                                   |
| `policy/production`          | `business/production/foundations/language`   | Eliminate the false peer module; these invariants belong to Production.                                 |
| `computation/scheduling`     | `business/production/foundations/algorithms` | Eliminate the false peer module; preserve version selection through an approved algorithm registry.     |

Current modules expose 117 top-level source areas: 90 named capabilities and
27 foundations. The transitional layout puts both directly under `src`, so an
engineer must consult the central registry to know which is executable. The v2
grammar makes that distinction physical: `src/features` versus
`src/foundations/{language,algorithms,ports,adapters}`.

The existing root compiler is a 249-line centralized registry over a 650-line
factory. ESLint imports that registry directly and currently rejects
`modules/*/*/src/features` and `src/adapters`; the v2 compiler must therefore
land before the first module move.

Current module package dependencies confirm the authority leaks:

- Identity depends directly on Express and HTTP contracts.
- Pricing and Production depend directly on Express.
- Authorization depends on Express and Pricing contracts.
- Production Policy and Scheduling are separately injectable peer packages
  despite having no independent state or business authority.

The repository contained 241 direct `new Error(...)` sites across runtime and
test source at baseline. That count is not itself a defect: unexpected
programming failures and test sentinels may throw. T7 classifies call sites by
expected failure, unexpected mechanism failure, and edge presentation instead
of applying a blind textual replacement.

The full source inventory contains 56,678 lines across the current nine
modules. The target has seven authorities: Orders, Pricing, Production, Users,
Identity, Authorization, and Webhook Ingestion. Policy and Computation cease to
be top-level authority families. Control and Processor experience modules are
added later by T6 because their cross-domain application behavior currently
lives inside API.

The migration map freezes the exact Production routing, stage-transition,
machine-assignment, command-idempotency, locking, and History-cursor files
named by the queued correctness work until their red/green work can remain
reproducible. Unaffected Production features may move before that work; the
frozen slices may not.

### Baseline verification

On 2026-08-03 the transitional architecture baseline passed:

```text
pnpm typecheck:architecture
VITEST_MAX_WORKERS=2 pnpm exec vitest run \
  tooling/test/module-architecture.factory.test.mjs \
  tooling/test/architecture-boundaries.test.mjs

2 files, 121 tests passed
```

### Behavioral guard

The queued `lpms-order-control-correctness-hardening` package remains the
authority for four unsolved gaps: routing capacity invalidation, between-stage
routing eligibility, route idempotency under locking, and History cursor
timestamp precision. This architecture work does not treat file movement or
characterization as a fix.

## T1 - Compile Architecture Compiler v2

### Implemented

- Per-module `module.architecture.ts` manifests are discovered from a
  repository-root anchor derived from `import.meta.url`, not `process.cwd()`.
- The pure compiler supports arbitrary namespace depth, explicit feature to
  foundation edges, directed foundation dependencies, typed feature profiles,
  language/algorithm/port/adapter foundation profiles, qualified mapper roles,
  and restricted foundation factories.
- The filesystem checker rejects undeclared or empty leaves, illegal source
  zones, missing profile anchors, role drift, and tests outside mirrored
  feature/foundation, integration, or support zones.
- V2 ESLint rules reject sibling-feature imports, undeclared foundation edges,
  bare mappers, feature-local factories, ambient effects in pure roles, and
  runtime values in port files.
- Root main/public exposure is narrow, and current legacy modules remain on an
  isolated compatibility path until each manifest migrates. The old central
  module inventory is no longer the discovery authority.
- The previous package-local lint bug is closed: module discovery no longer
  becomes empty when Turbo invokes ESLint from a workspace package directory.

### Verification

On 2026-08-03:

```text
pnpm typecheck:architecture
VITEST_MAX_WORKERS=2 pnpm exec vitest run \
  tooling/test/module-architecture.factory.test.mjs \
  tooling/test/architecture-compiler-v2.test.mjs \
  tooling/test/architecture-discovery.test.mjs \
  tooling/test/architecture-eslint-v2.test.mjs \
  tooling/test/architecture-boundaries.test.mjs
pnpm architecture:check
pnpm lint:architecture

5 files, 138 tests passed
```

## T2 - Establish shared technical package owners

### Implemented owners

- `@pressly/kernel` owns `Result`, `IdSource`, and the mechanism-free
  `UnitOfWork` algebra. Node UUID construction remains behind its Node entry.
- `@pressly/time` owns `Clock` and `systemClock`; deterministic clocks live in
  Testkit.
- The new browser-safe `@pressly/codec` root owns canonical JSON and bound
  cursor codecs. SHA-256 is isolated under `@pressly/codec/node`, so pure
  mappers do not accidentally acquire Node runtime dependencies.
- `@pressly/db` owns database-runtime and unit-of-work construction and exposes
  explicit client, query, schema, testing, and unit-of-work subpaths.
- `@pressly/http/express` owns request validation, safe response presentation,
  and the reusable cookie-CSRF factory used by Control and Processor.
- `@pressly/money` now exposes an immutable safe-integer `Money` value with
  currency-aware arithmetic and typed mismatch/overflow failures while
  retaining the existing formatting API.
- `@pressly/observability` replaces the misleading Metrics package name;
  Logging remains a separate owner and current consumers use the new package.
- `@pressly/errors` remains the unexpected throwable language and now exposes
  explicit app-error, factory, and presentation subpaths. Expected application
  failures remain module-owned typed data.
- `@pressly/testkit` owns deterministic Clock/ID doubles and generic typed
  Result assertions.
- `@pressly/contracts` now exposes explicit Auth, Cents, LPMS, Orders, Pricing,
  Processor, Production, Users, webhook-ingestion, and UTC boundary subpaths.
  The root remains temporarily compatible until T7 migrates every consumer.

Shared semantic aliases that add no meaning were removed from Orders, Users,
Production, Webhook Ingestion, Auth, API, and Worker consumers. Feature-local
aliases remain only where they add application meaning.

### Focused proof

The package work passed package-local lint, typecheck, build, and 88 focused
tests across Kernel, Time, Codec, DB unit-of-work, Testkit, and affected
consumers. Additional proof on 2026-08-03 included:

```text
Contracts: typecheck, build, 16 files / 136 tests passed
DB: lint, typecheck, build, 9 files / 43 non-DB tests passed
Errors: lint, typecheck, build, 3 files / 28 tests passed
Money: typecheck, 20 tests passed
HTTP: typecheck, 55 tests passed
Observability: lint, typecheck, build, 17 tests passed
Worker focused consumers: 19 tests passed
API observability/security consumers: 11 tests passed
Control/Processor CSRF consumers: 11 tests passed
```

All API, Worker, CLI, Web, Processor, Orders, Users, Production, and Identity
consumer typechecks were green when checked outside concurrent physical module
moves. Repository-wide bounded gates remain V1 proof; T2 does not claim the
database integration environment or unrelated module migrations passed.

## T3 - Prove the universal module grammar through Pricing

### Resulting authority

Pricing is the first module fully compiled by the v2 grammar:

```text
src/
  features/
    catalog/load-pricing-catalog/
    pricebook/plan-pricing-change/
    pricebook/publish-pricing-change/
  foundations/
    language/pricing/
    language/pricing-change/
    ports/pricing-change-store/
    adapters/http/pricing-change-failure/
    adapters/postgres/pricing-change-store/
  composition/pricing.composition.ts
```

- Plan and publish are independent application features rather than a shared
  executable directory.
- Shared Pricing language, effect declarations, persistence, and HTTP failure
  presentation have explicit foundation owners and declared dependency edges.
- Boundary transformations use qualified contract and persistence mapper
  roles; no bare mapper remains.
- Expected not-found, conflict, and policy outcomes are typed `Result` data.
  Unexpected database and stored-invariant failures remain normalized
  throwable `AppError` values.
- Publishing receives `Clock` explicitly. No false Pricing entity, clock port,
  generic repository, or ceremonial layer was introduced.
- Tests mirror features, foundations, integration, and support.
- The canary exposed two real compiler/package seams: module composition roots
  may assemble DB/HTTP mechanisms, and Testkit Result assertions must be
  generic over coded expected failures. Both seams now have focused tests.

### Verification

On 2026-08-03:

```text
Pricing lint, source/test typecheck, build: passed
Pricing unit, policy, HTTP tests: 29 passed
Testkit lint, typecheck, build: passed
Testkit tests: 6 passed
Architecture compiler typecheck and focused ESLint tests: 8 passed
```

Pricing's composition integration test passed. Six repository integration
tests were discovered but skipped because PostgreSQL at `127.0.0.1:55434`
refused connections. This is reported as missing environment proof, not as a
passing database gate. The global architecture check contained no Pricing
finding; findings at that moment belonged to concurrent Users and Webhook
Ingestion moves.

## T4 - Migrate business and integration modules

### Completed slices

Orders, Users, Webhook Ingestion, and Production now use the v2
feature/foundation grammar. Repository-level verification later converged
across every independently migrated authority.

- Orders is organized by lifecycle, fulfillment, intake, query, and outbox
  application features. Its shared command execution, Order language, incoming
  proposal language, outbox language, command-store port, durable outbox codec,
  and Postgres stores have explicit foundation owners.
- Users separates create/read/update customer features from source-user
  resolution. User identity and command language are mechanism-free
  foundations; PostgreSQL is an adapter rather than a module-wide persistence
  area.
- Webhook Ingestion moved physically from `modules/business` to
  `modules/integration`. Inbox, quarantine, and source-binding lifecycles are
  separate application features over explicit language and Postgres adapter
  foundations.
- False Clock, ID, and transaction aliases were removed in favor of the shared
  Kernel and Time algebras. Qualified contract and persistence mappers make
  each representation boundary visible.

### Production authority

- Production is organized into demand, floor, History, order, query, resource,
  and scheduling feature namespaces. Tests mirror those leaves.
- Intrinsic policies and lifecycle graphs moved from the former
  `@pressly/production-policy` peer into named language foundations. The
  immutable `defineProductionRules` factory compiles the sole runtime rule set;
  apps can no longer replace business rules through arbitrary injection.
- Versioned deterministic scheduling moved from the former
  `@pressly/production-scheduling` peer into algorithm foundations. The
  immutable approved-algorithm registry retains executable v2 scheduling and
  historical v1 recognition without changing persisted version semantics.
- The module-wide persistence bag was split into PostgreSQL board, command,
  execution, History, order, and scheduling adapters. Signals are a
  declaration-only port with a separate null adapter.
- Application construction now accepts repositories, Clock, IdSource, and an
  optional signal capability. Rules and algorithms remain intrinsic.
- Contract schemas enter only through routes or qualified contract mappers;
  database mechanisms remain in repositories, adapters, and persistence
  mappers. The full Production source passes the v2 dependency, role, pure-file,
  port, and failure-boundary lint rules.
- The top-level Policy and Computation authority families and both absorbed
  workspace packages were removed. API, Worker, and CLI no longer import or
  construct them.

The four queued `lpms-order-control-correctness-hardening` defects remain open.
Their current source and test paths were rebaselined in that queued work
package; the migration did not repair or relabel them.

### Focused proof

```text
Orders: lint, source/test typecheck, build passed; 11 files / 40 tests passed
Users: lint, source/test typecheck, build passed; 8 unit tests passed
Webhook Ingestion: lint, source/test typecheck, build passed; 5 files / 14 tests passed
Orders API consumers: lint, typecheck, build passed; 2 files / 11 tests passed
Orders Worker consumers: lint, typecheck, build passed; 3 files / 32 tests passed
Webhook Worker consumers: typecheck passed; 30 focused tests passed
Compiler v2 failure-boundary fixture: 11 tests passed
Production: architecture check, architecture lint, module lint, source/test
typecheck, and build passed; 86 files / 417 unit tests passed
Production PostgreSQL: isolated role configuration and migrations passed;
15 files / 35 integration tests passed sequentially
Production consumers: Worker and CLI typechecks passed
```

Users ran six real PostgreSQL integration tests successfully in its agent's
available database environment. Later Orders and Webhook integration attempts
were discovered at their migrated paths but could not connect to PostgreSQL at
`127.0.0.1:55434`; Orders skipped 16 and Webhook did not claim database proof.
Repository-level database evidence remains a separate V1 gate.

## T5 - Reassign security policy and scheduling authority

- Authentication, sessions, MFA, workforce identity, and owner-bootstrap
  mechanisms moved from the false `business/auth` authority to
  `modules/security/identity`. Authorization moved from the top-level Policy
  family to the framework-free `modules/security/authorization` authority.
- Identity's broad MFA, session, and workforce areas were decomposed into
  one-action feature leaves. Six narrow store ports and their adapters replace
  the former module-wide persistence shape.
- The owner-bootstrap application process now belongs to the CLI composition
  edge. Identity publishes the mechanism; it no longer owns a deployment or
  operational workflow.
- Production's intrinsic rules and lifecycle decisions moved into named
  language foundations. Versioned scheduling is an approved algorithm
  foundation. The former `modules/policy` and `modules/computation` authorities
  and obsolete package identities are absent from source, manifests, and
  consumers.
- The state-machine and production-rule patterns remain immutable functional
  factories with explicit input/output algebras. No DI container, class
  hierarchy, service locator, or replaceable business-rule bag was introduced.

Final focused proof included Identity 40 files / 148 unit tests and 6 files /
33 PostgreSQL integration tests; Production 89 files / 423 unit tests and 16
files / 35 PostgreSQL integration tests. Both modules passed lint, source/test
typecheck, build, architecture, and consumer gates.

The four queued LPMS defects remain outside this task: machine-capacity
invalidation, between-stage routing eligibility, run-first route idempotency,
and History cursor timestamp precision.

## T6 - Extract experience applications and thin API

Control and Processor now own their cross-domain application/query behavior as
framework-free Experience authorities. API validates protocols, establishes
trusted context, invokes public capabilities, and serializes results.

### Resulting authority

```text
modules/experience/control/
  features/
    session/resolve-control-access/
    customers/manage-control-customers/
    orders/manage-control-orders/
    workforce/manage-control-workforce/
    invitations/manage-control-invitations/
    security/read-control-security-events/
  foundations/
    language/control-{access,context,customer,order,workforce}/
    ports/control-{access-store,customers,orders,workforce}/
    adapters/postgres/control-access-store/
  composition/control-experience.composition.ts
```

- Control owns business/location scope, capability and destination derivation,
  Customer/Order/workforce/invitation orchestration, and Control-facing
  projections.
- The module is framework-free and imports no Identity, Users, Orders,
  Contracts, Express, or HTTP package.
- API composition adapts public peer capabilities into Control-owned ports.
  API routes now validate Contracts, construct authenticated request context,
  invoke Control use cases, and serialize responses.
- Cookie/session loading, exact-origin CSRF, rate limiting, and browser-session
  serialization remain API/HTTP mechanisms.
- Expected peer rejections are classified at composition into typed Customer,
  Order, or Workforce rejection data. Unexpected database, invariant,
  configuration, and programming failures remain throwable and are not hidden
  inside expected `Result` values.
- Existing serialized contracts and `apps/control` consumers required no wire
  change.
- Control API and browser imports now use the explicit `contracts/auth`,
  `contracts/users`, and `contracts/orders` boundaries instead of the package
  root. In the same production build, the Control entry chunk fell from
  509.96 kB / 146.66 kB gzip to 455.18 kB / 135.03 kB gzip.

### Focused proof

```text
Control Experience: lint, source/test typecheck, and build passed; 4 files / 12 tests passed
API: lint, source/test typecheck, and build passed; 30 files / 198 tests passed
Control browser: lint, source/test typecheck, and production build passed; 20 files / 80 tests passed; entry 455.18 kB / 135.03 kB gzip
Architecture compiler: check, lint, and typecheck passed; 4 files / 24 v2 tests passed
Stateworks: both affected active networks validated and verified with no stop reason
```

The first architecture-test attempt used Node's built-in test runner against
Vitest suites and failed before collection. The same four suites passed under
their required Vitest runner; the runner mismatch is not a product failure.

### Processor experience authority

- Processor owns operational-order identity, order-control queries, production
  board projections, scheduling/history reads, and access resolution rather
  than leaving them as API-local query bags.
- Its use cases depend on narrow module-owned ports. API composition adapts
  peer public capabilities and Postgres reads to those ports; peer modules do
  not import one another.
- Contract, persistence, and projection transformations are separate qualified
  pure mappers. Effectful database and protocol loading remains in repositories
  and adapters.
- Final Processor proof passed lint, source/test typecheck, build, and 40 files
  / 275 tests. Control's final entry bundle was 455.18 kB / 135.07 kB gzip.

The resulting API contains no Control or Processor application policy. Shared
cookie-CSRF behavior is an HTTP package factory; app-specific authentication,
request context, and response presentation remain at process edges.

## T7 - Normalize Contracts, DB, Errors, and public surfaces

The repository-wide compatibility surfaces were removed after all consumers
moved to explicit package and module entry points. The following Production
slice records how the failure and serialization doctrine was first proven in a
large authority.

### Production failure and serialization proof

The Production slice now proves the T7 failure and serialization doctrine
without advancing the repository-wide task ahead of its dependencies.

- Every feature port returns feature-owned `ProductionFeatureFailure` data for
  expected validation, not-found, and conflict outcomes. No Production feature
  port exposes `AppError` or an HTTP status. Validation uses the application
  distinction `malformed | semantic`; the edge derives 400 or 422.
- Database, configuration, corrupt-row, and invariant failures throw normalized
  `AppError` values. Use cases no longer package those unexpected faults inside
  `Result.err`.
- Production controllers map expected failures at the HTTP edge. Worker demand
  projection, Cents source closure, and CLI bootstrap map the same public
  failure algebra at their own process edges.
- Work-event ports require Codec `JsonObject`; `unknown` no longer crosses that
  inward port. Schedule proposals use an explicit pure JSON projection, and
  persisted scheduling snapshots are structurally guarded on read and write.
- Existing list-order and backlog cursor bytes remain compatible while their
  Base64URL mechanics use Codec owners. The backlog checksum remains an
  integrity syntax check, not an authority or authentication claim.
- `ProductionShift` and `ScheduleProposal` are the two positive entity cases:
  stable identity continues across module-owned lifecycle changes. Run, batch,
  order, board, History, command, context, mutation, and result shapes remain
  models or projections because no corresponding aggregate is hydrated there.
- Explicit Errors subpaths replace package-root construction imports in the
  touched Production, Worker, and CLI paths.

The queued machine-capacity invalidation, between-stage routing eligibility,
route-idempotency locking, and History timestamp-precision defects remain open
and unchanged.

### Focused proof

On 2026-08-03:

```text
Production architecture check, lint, source/test typecheck, build: passed
Production unit: 87 files / 420 tests passed with at most two workers
Production PostgreSQL: 15 files / 35 tests passed sequentially
Worker lint, source/test typecheck: passed; 10 files / 65 tests passed
CLI lint and typecheck: passed; 9 files / 36 tests passed
API source/test typecheck: passed
API LPMS happy path: 1 file / 1 test passed sequentially
```

### Identity and Control proof

Identity and its Control consumer now apply the same doctrine end to end:

- Bootstrap, login, load-session, MFA, and workforce expected outcomes use
  feature-owned discriminated failures. Identity exposes no
  `Result<_, AppError>` application port.
- Database and cryptographic mechanisms return their successful values and
  throw normalized unexpected `AppError` failures. Login, logout, session
  lookup, audit, and password failures are no longer silently reclassified as
  expected business outcomes.
- MFA completion uses DB's shared result-aware unit of work. An expected
  rejected challenge rolls back through typed data; unexpected transaction
  failure throws. The former private `MfaTransitionRejected extends Error`
  control-flow class is gone.
- `@pressly/http/express` can present either a value or a typed feature result,
  with feature-to-`AppError` mapping required at the HTTP edge. Identity's
  login, load-session, and MFA mappings live beside their contracts, while
  CLI bootstrap maps the same public failure algebra at its process edge.
- Workforce command receipts accept Codec `JsonObject`; receipt metadata and
  invitation-acceptance replay data are structurally validated before use.
  Workforce cursor bytes remain compatible while Base64URL JSON mechanics are
  owned by Codec.
- Identity entities are exactly access grant, workforce invitation, and
  workforce membership continuity. Their summaries/details/pages are models.
  Control follows the same rule: grant, invitation, and membership are the
  only workforce entities; access manifests, pages, lists, snapshots, and
  mutation outcomes are models or values. `control-access` has no entity file
  because it is a resolved application projection.
- Control Customer and Order peer values use `*Snapshot`, not `*Record`.
  `Record` remains reserved for a real representation record, preventing a
  peer application snapshot from being mistaken for persistence or an
  aggregate.
- Explicit Errors subpaths are used throughout the touched Identity, Auth,
  HTTP, Control API, and Processor-session boundaries.

Focused verification on 2026-08-03:

```text
Identity lint, source/test typecheck, build: passed
Identity unit: 29 files / 139 tests passed with at most two workers
Identity PostgreSQL: 6 files / 33 tests passed sequentially
Auth package lint, typecheck, build: passed; 16 files / 64 tests passed
HTTP package lint, typecheck, build: passed; 6 files / 56 tests passed
Codec package lint, typecheck, build: passed; 5 files / 23 tests passed
Contracts lint, typecheck, build: passed; 16 files / 136 tests passed
Control Experience lint, source/test typecheck, build: passed; 4 files / 12 tests passed
API lint, source/test typecheck, build: passed; focused Control/Auth 8 files / 36 tests passed
Architecture check, lint, typecheck: passed; 4 files / 68 focused tests passed
Both affected Stateworks networks: validate and verify passed with no stop reason
```

### Repository-wide boundary normalization

- Contracts, DB, and Errors have no package-root barrel, wildcard export, or
  compatibility index. A mechanical consumer migration replaced 138 Contracts,
  174 DB, and 120 Errors package-root imports with explicit subpaths.
- Application entities, policies, ports, use cases, and repositories remain
  module-owned. Contracts own schemas for unknown protocol values and their
  serialized counterparts; DB owns schema/query/runtime mechanisms.
- Each of the nine module authorities exposes one explicit `main.ts` and one
  explicit `public.ts`. Neither surface uses wildcard re-export or alias
  compatibility. The obsolete Auth, Access Control, Production Policy,
  Scheduling, Metrics, and aggregate package identities are absent.
- Expected feature rejections are immutable `Result` data. Unexpected runtime
  failures are normalized `AppError` values. HTTP, CLI, Worker, and browser
  processes translate those two languages at their own edges.
- Live checked-in Node tooling constructs failures through the standalone
  `@pressly/errors/tooling-error` entry, including architecture discovery,
  browser support, deployment selection, Docker statistics, release manifests,
  and shell-embedded JavaScript. A tooling ownership test rejects all nine
  native throwable constructors outside the Errors package and intentional
  fixtures.
- `@pressly/errors/abort-reason` is the sole qualified native DOM timeout
  mechanism. It preserves the platform `DOMException` semantics while keeping
  construction inside the Errors owner.
- Clocks, IDs, SHA-256 text hashing, codecs, and result-aware units of work use
  the Time, Kernel, Codec, and DB package algebras. API and Worker no longer
  hide direct UUID, wall-clock, or hashing construction in application paths.

## T8 - Enforce and document the placement system

The rules are normative in `AGENTS.md`, `docs/architecture.md`, and
`docs/module-architecture.md`, then independently executable through compiler,
ESLint, and topology tests.

- Nine immutable module manifests declare 102 use cases in 102 unique feature
  leaves. One executable use case per leaf is mechanically enforced.
- Every source mapper is qualified by representation boundary. The final audit
  found 80 of 80 as contract, persistence, projection, domain, or other
  declared qualified roles; none was async or ambiently effectful.
- The compiler rejects peer-module imports, undeclared feature/foundation
  dependencies, runtime values in ports, feature-local generic factories,
  ambient effects in pure roles, illegal source/test zones, empty leaves,
  generic module buckets, compatibility surfaces, and misleading entity roles.
- Placement is semantic: entities require owner-controlled identity continuity;
  application snapshots/pages/results remain models; representation rows are
  mapper-owned adapter shapes; effects are explicit ports, repositories, or
  adapters.
- Generic patterns must first be expressed as typed immutable factories and
  must be earned by repeated semantics. The documentation explicitly rejects
  ceremonial role files, generic repositories, base entities, service
  locators, replaceable policy bags, and arbitrary algorithm injection.
- Root and direct Turbo/Vitest entry points cap workspace concurrency and test
  workers at two. Database integration remains sequential. The same rule is
  present in CI, Dockerfiles, browser contracts, and LPMS end-to-end scripts.

The final independent structural audit found zero peer-module imports, root
package compatibility imports, root package barrels, obsolete package names,
semantic-free effect aliases, empty module directories, generic module buckets,
ambient module effects, or live native throwable construction outside Errors.

## V1 - Prove repository architecture and behavior

### Repository gates

Executed on the final source tree with bounded concurrency:

```text
pnpm install --frozen-lockfile: passed across 30 workspaces
pnpm format:check: passed
pnpm clean && pnpm exec turbo build --concurrency=2 --force:
  28 of 28 build tasks passed from a cold output tree
pnpm lint:
  architecture guard plus 28 of 28 workspace lint tasks passed
pnpm typecheck:
  50 of 50 workspace tasks plus browser and architecture typechecks passed
pnpm test:
  51 of 51 workspace tasks passed; tooling passed 18 files / 200 tests
pnpm test:int:
  DB 22 files / 88 tests
  Identity 6 / 33, Users 1 / 6, Orders 1 / 16, Pricing 3 / 7
  Webhook Ingestion 2 / 5, Production 16 / 35, API 1 / 1
pnpm test:lpms:e2e:
  API/Cents/LPMS 5 files / 55 tests; Processor 40 / 275
pnpm test:browser:smoke:
  9 Chromium tests passed in 45.3 seconds against disposable local HTTPS
git diff --check: passed
```

The browser proof covered owner MFA session provisioning, isolated Processor
authentication, Control customer/order creation, host-only cookies, CSRF and
origin rejection, Processor restoration, workforce role authority, and mobile
containment. Its containers, networks, volumes, and images were removed by the
test cleanup. The integration PostgreSQL service was explicitly stopped after
verification.

This completed work validated and verified with `done: yes`, no stop reason,
and no ready task. Both affected active networks remain schema-valid. The
workforce/identity network reports no stop reason; the older LPMS readiness
network continues to report its pre-existing H1 human confirmation and V2
offline-topology invalidation. This architecture work did not clear or relabel
either condition. Both underlying domain memory files validate. No domain
memory delta was created because this work changes repository architecture and
engineering rules, not confirmed laundry-production facts.

### Honest residuals

- The Processor production bundle reports a non-blocking size warning at about
  1.405 MB / 392.37 kB gzip.
- The Web build reports the existing Sentry navigation-instrumentation notice.
  Neither warning failed a gate.
- No production migration, deployment, webhook replay, external write, commit,
  push, or pull request occurred.
- The queued LPMS work remains authoritative for machine-capacity invalidation,
  between-stage routing eligibility, run-first route idempotency/locking, and
  History cursor PostgreSQL timestamp precision. None is claimed fixed here.
