# Architecture

Pressly is a TypeScript modular monolith. The architecture exists to make
ownership, dependency direction, effects, and boundary translation obvious in
the filesystem before the repository grows substantially.

This document defines repository-level boundaries. The normative backend
placement and suffix rules are in
[Module architecture](./module-architecture.md). The compiler and ESLint rules
under `tooling/architecture` are the executable authority.

## 1. System Rule

```text
apps compose
modules decide
packages enable
contracts validate serialized boundaries
adapters translate mechanisms
```

Meaning points inward. Mechanisms stay at the edges.

```text
unknown input
  -> parse a serialized contract
  -> map into application language
  -> load explicit facts through ports
  -> decide or derive with pure functions
  -> commit through adapters
  -> map into a serialized result
```

The goal is not layer count. The goal is that each fact, decision, and effect
has one discoverable owner.

## 2. Sources of Truth

Different artifacts answer different questions:

1. Code, migrations, and runtime contracts say what the checkout implements.
2. Stateworks domain memory preserves accepted domain decisions and
   invariants.
3. Stateworks work packages preserve active state, proof, and known gaps.
4. Living docs explain the architecture and operations.
5. Completed work and plans are historical evidence, not current runtime
   authority.

When two sources disagree, record and reconcile the drift. Do not silently
rewrite history or invent behavior.

## 3. Repository Shape

```text
apps/
  api/                 HTTP process and transport composition
  worker/              durable and scheduled job process
  web/                 customer-facing Next.js application
  control/             management frontend
  processor/           LPMS operator frontend
  cli/                 operator and developer command-line adapter

modules/
  business/
    orders/            commercial Orders and fulfillment authority
    pricing/           pricebook authority
    production/        LPMS state, policy, and scheduling authority
    users/             canonical customer identity authority
  security/
    identity/          login, sessions, MFA, and workforce identity
    authorization/     framework-free authorization decisions
  integration/
    webhook-ingestion/ durable external-event inbox authority
  experience/
    control/           Control cross-domain application workflows
    processor/         Processor cross-domain application workflows

packages/
  auth/                reusable authentication and authorization primitives
  codec/               canonical and bound serialization codecs
  config/              environment and runtime configuration parsing
  contracts/           schemas and serialized boundary values
  db/                  schema, migrations, database runtime, and SQL facade
  errors/              unexpected throwable error language
  http/                protocol helpers and Express mechanisms
  kernel/              Result, IDs, unit-of-work algebra, and core factories
  logging/             structured logging language
  money/               immutable money value and arithmetic
  observability/       counters, measurements, reporting, and sink isolation
  testkit/             deterministic shared test capabilities
  time/                clocks and calendar/time transformations

stateworks/            durable domain memory and delivery work state
tooling/architecture/  architecture definition, compiler, checks, and lint
```

There are no top-level `modules/policy` or `modules/computation` authorities.
Authorization is a Security authority. Intrinsic Production policies and
approved scheduling algorithms belong to Production. A calculation becomes a
peer authority only if it develops independent state, lifecycle, and product
meaning; technical complexity alone is not enough.

## 4. Dependency Direction

Allowed dependencies are intentionally few:

```text
apps -> module public surfaces
apps -> packages
modules -> packages
module composition -> its own features and adapters
feature -> its declared foundations
adapter/repository -> the port it implements
contract mapper -> an explicit Contracts subpath
```

Forbidden dependencies include:

```text
module -> app
module -> peer module
feature -> sibling feature
domain language -> HTTP, SQL, React, filesystem, network, clock, or randomness
use case -> Express, Next.js, or Drizzle
package -> module or app
frontend -> backend module internals
```

Peer modules collaborate only when an app injects one module's public
capability into another module's declared port. An Experience module may
coordinate several domains, but it still imports no peer module package.

## 5. Modules

Every backend module has one grammar:

```text
modules/<family>/<authority>/
  module.architecture.ts
  src/
    features/<namespace>/<verb-object>/
    foundations/
      language/<concept>/
      algorithms/<algorithm>/
      ports/<capability>/
      adapters/<mechanism>/<capability>/
    composition/<authority>.composition.ts
    main.ts
    public.ts
  test/
    features/
    foundations/
    integration/
    support/
```

A feature is an application action or query named with a verb-object phrase.
A foundation is a proven shared dependency with a narrow semantic owner. Empty
ceremonial files and generic `common`, `shared`, `utils`, `services`, or
`platform` directories are forbidden.

`module.architecture.ts` is immutable formal data. It declares namespaces,
feature profiles, foundation profiles, and dependency edges. The compiler
checks the filesystem and ESLint checks source dependencies and pure roles.

Each feature leaf owns at most one `*.usecase.ts`. Independently named
operations are independently named verb-object features and are connected by
narrow injected ports, never sibling imports. Module `main.ts` and `public.ts`
enumerate canonical exports explicitly; export-star and aliased compatibility
surfaces are forbidden.

See [Module architecture](./module-architecture.md) for the complete placement
decision tree, role vocabulary, Entity-versus-Model rule, failure grammar,
factory criterion, manifest form, and review checklist.

## 6. Apps and Experience Boundaries

Apps own process and delivery mechanisms:

- process startup, shutdown, signals, and configuration;
- HTTP or job registration and middleware order;
- authentication extraction and protocol security;
- composition of multiple peer modules;
- concrete observability, database, network, and vendor adapters;
- final protocol response or UI rendering.

This includes environment reads, process arguments, stdin/stdout, operating
system signals, exit codes, and runtime shutdown. Modules receive derived
configuration or narrow capabilities rather than reading process state.

Apps do not own domain policy or cross-domain application decisions.

`apps/api` is a thin HTTP adapter. Control and Processor workflows that combine
Identity, Authorization, Orders, Users, or Production belong in their
Experience modules. API code parses Contracts, invokes an injected public
capability, maps the result, and writes the response. It must not become a
second business layer. Qualified contract mappers remain synchronous; an API
adapter owns any asynchronous Experience lookup and then passes the resolved
facts into the pure contract transformation.

### Control reference boundary

Control is the reference implementation of this split:

| Owner                        | Owns                                                                                                                                       | Must not own                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `modules/experience/control` | business and location scoping, cross-domain orchestration, Control capabilities, application destinations, and Control read projections    | Express, cookies, CSRF, request locals, Zod wire schemas, or peer-module imports                          |
| `apps/api/src/http/control`  | contract validation, authenticated request-context adaptation, cookies, CSRF, rate limits, result presentation, and response serialization | business/location decisions, peer sequencing, date-rich application transformations, or read-model policy |
| `apps/control`               | browser presentation state and interaction                                                                                                 | backend authorization or domain decisions                                                                 |

The API composition root adapts the public capabilities of Identity, Users,
and Orders to narrow Control-owned ports. The Experience module never imports
those peer packages. This is deliberate dependency inversion, not a shared
service layer.

Peer adapters classify only reviewed, caller-actionable rejections into typed
Control failure records. Database, invariant, configuration, and unexpected
peer failures remain throwable `AppError` values and propagate to the outer
API error boundary. They must never be hidden inside `cause: unknown` on a
successful application `Result` channel.

Control session authority is split deliberately: the Experience module derives
business, location, capability, and destination access; the API owns host-only
cookies, authentication loading, origin/CSRF enforcement, and session response
serialization. Neither side duplicates the other.

`apps/worker` is the asynchronous composition root. It owns polling, leases,
retry scheduling, heartbeats, and job delivery. Durable inbox/outbox state and
application disposition remain owned by their modules.

`apps/cli` is a protocol adapter. It parses operator input, calls stable app or
module capabilities, and presents results; it does not duplicate policy.

Module composition only constructs and injects. A use case owns branching that
depends on the semantic result of its operation, including which signal or
observation to emit and whether replay suppresses it. Apps implement the
concrete sink; composition does not wrap use cases to rediscover those rules.

## 7. Contracts and Type Boundaries

`@pressly/contracts` owns only data that crosses a trust, process, durable
serialization, or versioned integration boundary.

Contracts may contain:

- runtime schemas for HTTP and external payloads;
- serialized request, response, event, and job values;
- types inferred from those schemas;
- explicit boundary versions.

Contracts must not contain entities, use-case ports, repository interfaces,
policies, database rows, or internal `Date`-rich models.

Use explicit boundary subpaths such as:

```text
@pressly/contracts/auth
@pressly/contracts/orders
@pressly/contracts/pricing
@pressly/contracts/processor
@pressly/contracts/production
@pressly/contracts/webhook-ingestion
```

The package root is not an application dependency. A
`*.contract.mapper.ts` translates between a validated serialized value and the
owning feature's application model.

Contracts, DB, and Errors deliberately expose explicit subpaths instead of
package-root barrels. Importing `@pressly/contracts`, `@pressly/db`, or
`@pressly/errors` at the package root is an architecture violation.

Use `unknown` exactly where trust ends, parse it once, and preserve the type
proof afterward. Prefer discriminated unions and closed type aliases. Use an
interface only for an intentionally open extension point or declaration
merging.

Open-ended serialized data uses `JsonValue` from `@pressly/codec`. Runtime
schema boundaries use `jsonValueSchema` from `@pressly/codec/zod`; persistence
mappers guard decoded JSON before exposing it inward. `undefined`, non-finite
numbers, dates, class instances, and cycles are rejected rather than smuggled
through `unknown`.

## 8. Functional Core and Effects

Pure decisions take complete input and return immutable data. Effectful shells
obtain facts and commit plans through explicit capabilities.

```text
functional core
  entity / value / event / lifecycle
  policy / projection / algorithm
  contract and persistence transformations

imperative shell
  use case
  port
  repository / adapter
  composition
  transport or job edge
```

Effects must be visible:

- time through `Clock` from `@pressly/time`;
- identifiers through `IdSource` from `@pressly/kernel`;
- atomic work through `UnitOfWork` from `@pressly/kernel`, constructed by
  `@pressly/db/unit-of-work`;
- expected rejection after partial transactional work through
  `ResultUnitOfWork` and `defineResultUnitOfWork`, which keep rollback inside
  the DB adapter and typed failure data in the application;
- SQL through `@pressly/db/query` and explicit schema subpaths;
- persistence, network, crypto, queues, and files through ports and adapters;
- logging and observation through injected sinks.

Do not create semantic-free aliases such as `FeatureClockPort = Clock`. A local
port must add application meaning, narrow semantics, or expose a genuine
replacement axis.

Pure functions may use local mutation when the mutation is unobservable and
materially clearer or faster. Functional architecture is about explicit
state and effects, not avoiding efficient implementation.

## 9. Errors and Failure Control Flow

Three failure categories have different owners:

```text
expected application rejection
  -> feature *.failure.ts discriminated data
  -> Result<Value, FeatureFailure>

unexpected mechanism or invariant failure
  -> AppError throwable from @pressly/errors/factories
  -> normalize once, observe once

protocol presentation
  -> controller or outer middleware
  -> safe response from explicit error presentation
```

Expected failures include ineligibility, not-found business records, and
current-state conflicts a caller can act on. They are not exceptions and do
not carry HTTP status codes. A validation distinction is application data such
as `malformed` versus `semantic`; the presenting edge chooses 400 versus 422.

Unexpected failures include unavailable mechanisms, corrupt persistence,
impossible invariants, bad configuration, and programming defects. They use
the explicit error subpaths:

```text
@pressly/errors/app-error
@pressly/errors/factories
@pressly/errors/presentation
```

Live source in apps, modules, packages, and executable repository tooling
outside Errors does not construct, call, or subclass native throwable types.
Native construction is owned by Errors. TypeScript consumers use an explicit
`@pressly/errors/*` subpath; checkout tooling that must run before workspace
installation uses the dependency-free
`packages/errors/src/tooling-error.mjs` factory. Tests may create native values
only as deliberate fault fixtures. Never catch an unexpected exception merely
to disguise it as an expected business failure.
Private `details` and `cause` never cross a client boundary; reviewed
`publicDetails` is a strict `JsonValue` and is the only structured diagnostic
context eligible for serialization.

API controllers, Worker jobs, and CLI commands translate expected module
failures into `AppError` only at the edge that owns HTTP or retry semantics.

Observation is non-authoritative. Logging, counters, or error-reporting failure
must not replace a business result or recovery disposition.

## 10. Persistence and Transactions

`@pressly/db` owns database schema, migrations, clients, health checks,
unit-of-work construction, and the reviewed query facade. Consumers use
explicit subpaths:

```text
@pressly/db/client
@pressly/db/health
@pressly/db/query
@pressly/db/schema/<authority>
@pressly/db/testing
@pressly/db/unit-of-work
```

Storage rows are not domain entities. A `*.persistence.mapper.ts` validates and
translates representation. A `*.repo.ts` implements a feature or shared module
port. SQL and database executors never enter domain language or use-case
signatures.

Accordingly, `Stored*`, `Persisted*`, `*Row`, and `*Record` declarations do not
belong in `*.entity.ts`. A genuinely hydrated entity uses the business name;
otherwise the representation remains local to the persistence adapter and its
mapper.

Durable JSON ports accept Codec `JsonObject` or a closed serialized union, not
inward `unknown`. A typed pure projection selects and normalizes every field
before a value crosses the port; a generic `JSON.stringify` round trip is not a
mapper. Persistence adapters structurally guard the JSON again on read. In
Production, `ProductionShift` and `ScheduleProposal` are entities because
their identities continue through owned lifecycle transitions; board,
History, command, context, and mutation representations remain models.

Use cases own atomic intent. A unit of work makes the transaction boundary
explicit, and transaction-scoped operations enforce invariants, idempotency,
audit, and outbox writes together where required. Avoid external network calls
inside database transactions unless the invariant genuinely requires them.

## 11. Frontends

Each frontend remains a delivery system rather than a backend domain owner.

`apps/web` uses Next.js route composition, product feature slices, reusable UI
primitives, and a technical web core. Product features do not select concrete
adapters except at a server or route composition edge.

`apps/control` and `apps/processor` consume serialized Experience APIs. Their
local models own presentation state only. They do not reimplement backend
authorization, Orders, Pricing, or Production decisions.

Frontend dependency direction remains:

```text
entry/route -> feature/view -> inward UI or core port
composition -> concrete adapter -> inward port
```

Route-private folders stay inside their route subtree. UI primitives do not
import product features. Framework and vendor dependencies stay out of core
application transformations.

## 12. Observability

Every process should expose enough context to explain authoritative behavior:

- request, trace, job, route, or command identity as appropriate;
- structured, redacted logs;
- bounded counters and measurements;
- liveness and readiness;
- safe error reporting and correlation;
- explicit shutdown and cleanup behavior.

`@pressly/observability` owns declarations and sink-isolation policy. Apps own
concrete Sentry and runtime adapters. Modules receive narrow sinks only when
observation is part of their application boundary.

Do not log secrets, session material, customer payloads, or proof artifacts.
Do not use high-cardinality customer, order, or trace IDs as metric labels.

## 13. Testing and Proof

Tests prove the boundary where behavior lives:

```text
policy/lifecycle/algorithm test  -> pure decision and invariant
use-case test                    -> application behavior with fake ports
adapter/repository test          -> mechanism and representation
app integration test             -> real composition and protocol
end-to-end test                  -> critical public workflow
```

Module tests mirror `features` and `foundations`. Shared deterministic clocks,
IDs, and Result assertions live in `@pressly/testkit`. Database integration is
reported separately from non-database gates and is never treated as passing
when PostgreSQL was unavailable.

Repository validation is deliberately bounded for WSL stability:

```text
VITEST_MAX_WORKERS=2 turbo test --concurrency=2
```

Every checked-in Turbo entrypoint, including app dependency builders and
Docker build stages, carries `--concurrency=2`; unit-test entrypoints also cap
Vitest at two workers. Database integration remains sequential at one worker.
Do not add an uncapped alternate path.

Lint, typecheck, build, architecture checks, Stateworks verification, and diff
hygiene remain independent proof obligations.

## 14. Reusable Patterns

Start with immutable definitions and pure `makeX` or `defineX` functions. A
design-pattern factory is justified only after multiple real consumers share
the same semantics, the varying parts form a small typed input, and the
factory makes control flow or effects more explicit.

Earned examples include state-machine definitions, bound cursor codecs,
unit-of-work construction, and cookie-CSRF protection. Similar syntax alone
does not justify a generic repository, base entity, policy engine, service
locator, decorator framework, or dependency-injection container.

## 15. Adding Behavior

For backend behavior:

```text
1. Name the semantic authority.
2. Name the verb-object application feature.
3. Define inward application data and expected failures.
4. Define pure entities, values, policies, projections, or algorithms only as needed.
5. Declare effects as narrow ports or shared technical algebras.
6. Implement repositories and adapters at mechanism boundaries.
7. Add a serialized Contract only where data crosses a real boundary.
8. Compose module peers only in an app.
9. Mirror tests under the same ownership tree.
10. Update the manifest and run architecture, lint, type, test, and build gates.
```

For frontend behavior:

```text
1. Put route ownership in the framework route tree.
2. Put product behavior in a named feature.
3. Keep route-only composition private to the route.
4. Depend inward on ports and pure models.
5. Select concrete adapters only at composition boundaries.
6. Keep server policy authoritative and presentation state local.
```

If a file cannot be placed by these rules, the architecture decision is not
finished. Do not conceal ambiguity with a generic directory name.
