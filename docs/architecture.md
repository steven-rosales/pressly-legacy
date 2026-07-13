# Architecture

Architecture is how this repo keeps meaning separate from mechanism.

The goal is not to look enterprise. The goal is to make code easy to place, easy to change, and hard to accidentally couple. Business language should live in modules. Runtime wiring should live in apps. Shared technical capabilities should live in packages. The frontend is a UI and protocol adapter, not the owner of backend business rules.

This repo is intentionally TypeScript and SQL first.

## 1. Working Principles

### Name the idea before the mechanism

A file, function, type, or package should answer one clear question:

- What concept does this represent?
- What invariant does this protect?
- What transformation does this describe?
- What effect does this perform?
- What outside mechanism does this adapt?

Implementation details are allowed, but only after the meaning has a home.

### Keep meaning separate from mechanism

These are not the same thing:

- A database row and a domain concept
- An HTTP request and a use case
- A React component and a business rule
- A Zod schema and a domain model
- Express middleware and application policy
- A cron schedule and a business process

Adapters translate mechanisms. They should not become the place where business meaning hides.

### Compose at the edge

Inner code should be small and explicit. Outer code can compose many pieces.

Prefer:

```txt
validate -> authorize -> transact -> execute -> present
```

Avoid:

```txt
controller.doEverything(req, res)
```

`main.ts`, route handlers, page components, and app startup files may import
many things because they are composition points. Capability use cases,
intrinsic policies, and computations should import very little.

### Make state and effects visible

State needs an owner. Effects need a boundary.

Allowed state owners:

- Database records
- Request context
- Transaction context
- Auth/session context
- UI state
- Worker job state
- Process runtime state

Do not smuggle state through mutable singletons, hidden module variables, accidental caches, or framework objects passed deep into the system.

Effects include database writes, HTTP calls, email, queues, cron, logging, metrics, time, and random IDs. Inner code should depend on capabilities, not concrete vendors.

## 2. Repo Shape

Current high-level shape:

```txt
pressly/
  apps/
    web/
      src/app/          Next.js routes and route-private composition
      src/features/     product capabilities used by routes
      src/components/   reusable UI primitives
      src/common/       technical web core and concrete adapters
      src/config/       static site configuration

    api/              Express HTTP process
    worker/           background and scheduled process
    processor/        LPMS operator interface and protocol adapter
    cli/              operator/developer CLI tools

  modules/
    business/
      auth/           authentication/session capability module
      pricing/        business capability module
      production/     LPMS state, transactions, routes, and use cases
    policy/
      access-control/ authorization policy module
      production/     headless production invariants and transitions
    computation/
      scheduling/     deterministic fixed-pulse schedule proposals

  packages/
    auth/             shared auth and authorization primitives
    config/           environment parsing and runtime config
    contracts/        shared protocol contracts, commands, and results
    db/               Drizzle schema, migrations, seeds, and db client
    errors/           AppError and AppException language
    http/             HTTP helpers, response shapes, Express adapters
    logging/          structured logging capabilities
    metrics/          metrics capabilities
    testkit/          shared test helpers
    tsconfig/         shared TypeScript configs

  tooling/            repo scripts and automation
  docs/               project docs
```

The short version:

```txt
apps compose
modules decide
packages enable
adapters translate
contracts validate boundaries
```

## 3. Dependency Direction

Dependencies point inward.

Allowed direction:

```txt
apps -> modules -> packages
apps -> multiple peer modules through dependency injection
module main.ts -> capability files
capability adapters -> same-capability use cases and ports
web app -> features, UI primitives, and common runtime
web features -> common core
common adapters -> common core
```

Disallowed direction:

```txt
modules -> apps
one module -> another module
one module capability -> a sibling capability
use cases -> HTTP details
use cases -> SQL details
intrinsic policy -> Express / Next.js / Drizzle / Pino
web common -> app or features
web features -> app
apps/web -> backend module internals
packages -> apps
```

Modules are isolated peers. A module cannot import, call, or declare a package
dependency on another module, including through `public.ts`. Apps import stable
module surfaces and connect them through narrow dependency injection. Cross-package
imports go through package exports.

## 4. Packages

Packages are for stable, reusable boundaries. They should not become a junk drawer for app-specific behavior.

Use a package when the code is:

- Needed by more than one app or module
- Stable enough to expose as a public API
- Technical infrastructure rather than product-specific behavior
- Useful to test independently

Examples:

- `@pressly/errors` owns the structured error language.
- `@pressly/contracts` owns shared protocol contracts and command/result types.
- `@pressly/db` owns persistence schema and database wiring.
- `@pressly/http` owns HTTP response helpers and Express-specific adapters under `src/express`.
- `@pressly/config`, `@pressly/logging`, and `@pressly/metrics` own runtime capabilities.

Rules:

- Export from `src/index.ts` or another explicit public entry.
- Avoid deep imports across package internals.
- Runtime packages should export built `dist` files, not raw `src` files.
- A package should have a small public surface and boring internals.

## 5. Modules

A module is a bounded application capability.

Modules are grouped by the kind of application capability they own:

- `modules/business/*` owns product and stateful application capabilities.
- `modules/policy/*` owns cross-cutting application policy.
- `modules/computation/*` owns derived views, calculations, projections, and
  analysis.

Most modules are vertical business capabilities, but not all of them are. Some
modules own policy, projections, computations, or other application-level
capabilities. Their internal roles differ, but their source remains organized
by named capability rather than a mandatory horizontal folder template.

The invariant is ownership, not folder ritual.

All modules should keep these surfaces:

- `main.ts` is the module composition root.
- `public.ts` is the stable module surface.
- `test/` holds module tests outside `src/`.
- Other modules never import this module; apps consume `public.ts` and compose
  peer modules.
- Internal files under `src/` are not imported directly by other modules.

### Capability-First Module Shape

Module source is organized by the capability an engineer is changing, not by
horizontal technical layers.

```txt
modules/business/pricing/
  src/
    load-pricing-catalog/
      load-pricing-catalog.usecase.ts
      load-pricing-catalog.port.ts
      load-pricing-catalog.repo.ts
      load-pricing-catalog.controller.ts
      load-pricing-catalog.route.ts

    publish-pricing/
      plan-pricing-change.usecase.ts
      publish-pricing-change.usecase.ts
      publish-pricing-change.policy.ts
      publish-pricing-change.port.ts
      publish-pricing-change.repo.ts
      publish-pricing-change.controller.ts
      publish-pricing-change.route.ts

    main.ts
    public.ts

  test/
    load-pricing-catalog/
    publish-pricing/
    support/
    module.test.ts
```

Rules:

- Keep the use case, its ports, and its adapters loose inside one capability.
- A capability imports sibling files with `./...`.
- Capabilities do not import sibling capabilities.
- Promote genuinely reused technical code into a narrow named foundation such
  as auth `http/` or `persistence/`; do not create module-local `common/` or
  `shared/` buckets.
- Tests mirror capability names under the module's `test/` tree. Tests never
  live under module `src/`.
- Business capability source uses a closed architectural vocabulary. A new
  business role suffix requires an intentional architecture change, not a
  local naming preference.
- Explicit business `http/` and `persistence/` foundations may use descriptive
  filenames because the directory already establishes their technical role.

Auth has explicit `http/` and `persistence/` foundations. Access-control has an
explicit `identity/` foundation. Those are directed dependencies, not
general-purpose dumping grounds.

### Business Modules

A business module owns product or stateful application behavior.

Current examples:

- `modules/business/auth`
- `modules/business/pricing`
- `modules/business/production`

Business module rules:

- Use cases own application behavior.
- Business modules own durable state and transactionally enforce every
  invariant supplied through their required policy ports.
- Repositories and controllers are mechanism adapters colocated with that
  capability.
- Repository ports are shaped around one capability's use case, not around an
  entire module or database. Do not create module-wide stores that accumulate
  unrelated persistence operations.
- Reuse transaction runners, row mappers, and stable persistence primitives
  through the explicit `persistence/` foundation. DRY persistence mechanics
  must not erase feature ownership.
- Business modules should not own cross-cutting authorization policy.
- Business modules should not import `@pressly/auth` authorization primitives unless the module itself is the auth module.
- Injected policy or computation is mandatory when the capability declares
  that dependency; there is no global or permissive fallback.

Capability files should speak application language. For reads and lookups, prefer precise verbs:

- `loadX` for loading an application-facing view or catalog.
- `findX` for a persistence lookup that may or may not exist.
- `publishX` for making a controlled business change visible.
- `createX`, `updateX`, and `deleteX` only when that is literally the business action.

Avoid `getX` in application and module naming. It is too vague and collides mentally with HTTP `GET`. HTTP route methods can still use `router.get(...)`.

### Policy Modules

A policy module owns application policy that cuts across business capabilities.

Current examples:

```txt
modules/policy/access-control/
  src/
    auth-sessions/
    mfa/
    pricing/
    identity/
    auth.port.ts
    main.ts
    public.ts
  test/
```

`modules/policy/production` is the headless LPMS policy peer. It exports pure
eligibility, acceptance, machine-assignment, and state-transition decisions.

Policy module rules:

- Own Pressly authorization policy, not authentication.
- Import pure authorization primitives from `@pressly/auth`.
- Build resource mappers and policy guard bundles for business routes.
- Depend on stable packages only, never another module surface or its internals.
- Do not make `apps/api` define policy.
- Remain headless and replaceable at the composition boundary.
- May own pure domain invariants and transition definitions when that policy is
  injected into the business module that owns durable state.

For LPMS specifically, `modules/policy/production` owns the pure production
transition and invariant definitions. `modules/business/production` owns the
durable execution state and must invoke the injected policy inside the same
transaction as every protected mutation.

This keeps the API app as a composition root and keeps business modules from
becoming security modules by accident.

### Projection and Computation Modules

A projection or computation module owns deterministic derived views,
calculations, proposals, or analysis that are not authoritative business state.

Current shape:

```txt
modules/computation/scheduling/
  src/
    propose-schedule/
      *.computation.ts
      *.port.ts
    main.ts
    public.ts
  test/
```

Projection/computation module rules:

- Add adapter-suffixed files only when the capability talks to an external
  mechanism.
- Add use cases and ports only when the capability has application workflow.
- Return explicit infeasibility and warnings instead of mutating input or
  operational state.
- A module may have no database if it computes over existing inputs or projections.
- Receive immutable input and return a result or proposal.
- Never mutate another module's operational state.

The folder names in the previous three bullets describe optional roles, not a
required horizontal tree. New source remains capability-first.

### Intrinsic Rules, Injected Policy, and Computation

These responsibilities are deliberately different:

```txt
business module
  owns durable state, transactions, idempotency, and enforcement

policy module
  owns pure decisions, invariants, and transition definitions

computation module
  supplies replaceable calculations or proposals from stable input

app
  injects concrete policy and computation into the business boundary
```

A business command invokes its injected policy inside the transaction and
revalidates a computation proposal against current durable state. An injected
dependency does not own state, and the business capability cannot bypass it.

For LPMS, production policy owns eligibility, order-cohesion, stage-transition,
pulse-boundary, and machine-overlap decisions. The production business module
owns optimistic concurrency, idempotency, and the transaction that records
operational changes. A scheduler may propose batches and machine assignments,
but accepting that proposal invokes production policy against current state
before creating execution records.

## 6. Contracts

Contracts are boundary language.

They may describe:

- HTTP params
- HTTP request bodies
- HTTP response bodies
- Event payloads
- Commands entering a use case
- Results leaving a use case
- Error envelopes

Current pattern:

```txt
packages/contracts/src/pricing/
  pricing.contracts.ts  runtime schemas, usually Zod
  pricing.command.ts    command types
  pricing.result.ts     result types
```

Do not default to `*.dto.ts`. A DTO is usually either input, output, or protocol shape. Name the role directly.

A Zod schema is a validation contract. It does not automatically become a domain model.

Input path:

```txt
unknown input
  -> contract validation
  -> command
  -> use case
  -> domain/application decision
```

Output path:

```txt
domain/application result
  -> presenter
  -> response contract
  -> protocol response
```

## 7. Web App

`apps/web` is a feature-oriented Next.js frontend. It is not formal MVVM.
`page.tsx`, `layout.tsx`, and `route.ts` are real composition points, while
product behavior lives outside the route tree.

Current shape:

```txt
apps/web/src/app/
  _components/
  _lib/
  (marketing)/
    page.tsx
    _components/
  schedule/
    page.tsx
    ui/

apps/web/src/features/
  pricing/
  order-entry/

apps/web/src/components/
  ui/

apps/web/src/common/
  core/         technical ports and runtime policy
  adapters/     PostHog, Sentry, Sonner, request and runtime implementations
  testing/

apps/web/src/config/
  site.ts
```

Frontend rules:

- `page.tsx` and `layout.tsx` compose.
- Route-private `_components/`, `_lib/`, and `_shared/` stay inside their
  owning route subtree.
- `features/<capability>` owns product queries, commands, schemas, presenters,
  and view state.
- A feature `server.ts` may select server runtime adapters.
- `components/ui` contains mechanism-level UI primitives, not product behavior.
- `common/core` owns generic web capabilities, not business rules.
- `common/adapters` owns vendor/framework implementations.
- `config` contains static site configuration.
- There is no app-wide `shared/` bucket and no separate `infra/` junk drawer.

The frontend can validate protocol payloads and build view models. It should not recreate backend domain rules as truth.

For public marketing pages, prefer static or build-time rendering unless the route genuinely needs per-request behavior. If a build-time fetch has a fallback, the fallback policy must be explicit and user-safe.

## 8. Web Core

Web core is a small capability layer, not a god object.

It exists to make runtime effects declarative:

```txt
core.query.run(...)
core.query.fetch(...)
core.analytics.track(...)
core.context.get()
core.clock.now()
core.request.send(...)
core.errors.capture(...)
core.logger.info(...)
```

The call site should describe the work. The query interpreter handles metadata,
error normalization, reporting, and logging through the injected ports.

Rules:

- Core should not own product workflows.
- Core should not know pricing, marketing, or Cents-specific behavior.
- Core should not import React, Next.js, product features, or concrete adapters.
- Vendor imports belong in adapters.
- Concrete adapters should not import routes or product features.
- Route entrypoints and feature `server.ts` files select concrete adapters.
- Add to core only when the capability is broadly useful across frontend workflows.

State machines, forms, workflow engines, and pricing flows can be sibling interpreters that consume core. They do not all need to be inside core.

## 9. API, Worker, and CLI Apps

Apps own runtime composition.

`apps/api` responsibilities:

- Load env
- Create logger
- Create database connection
- Install HTTP middleware
- Compose authentication, access-control, and business modules
- Mount module routes
- Map errors to HTTP responses
- Expose health/readiness endpoints
- Shut down cleanly

`apps/worker` responsibilities:

- Create job context
- Run scheduled/background work
- Enforce timeouts and cancellation
- Keep retries and idempotency visible
- Reclaim expired inbox leases and preserve dead-letter evidence
- Invoke production use cases through injected module capabilities
- Emit sparse heartbeat, lag, retry, dead-letter, and fatal signals without a
  public HTTP route

`apps/processor` responsibilities:

- Use the existing opaque server session through a same-origin Secure,
  HttpOnly, SameSite=Strict cookie and CSRF protection
- Restore authentication, authorized location, and active production workspace
  from server truth after refresh
- Present schedule proposals, warnings, hashes, and operational board state
- Submit versioned, idempotent operator commands
- Display only backend-provided allowed actions; never duplicate policy

The processor is a client-only Vite SPA. It uses `main.tsx` and `app/` as its
runtime boundary instead of copying the Next.js route and server conventions
from `apps/web`:

```txt
apps/processor/src/
  app/          bootstrap composition, providers, navigation, and app chrome
  ports/        framework-free capabilities and expected failure values
  adapters/     same-origin fetch, live API, and non-secret browser preferences
  features/     product slices expressed as model/view pairs
  components/   app-neutral layout and shadcn UI primitives
```

Processor dependency direction is closed:

```txt
main -> app
app -> features + adapters + ports + components
features -> own feature + ports + components
adapters -> ports + contracts
ports -> contracts only
components/ui -> components/ui
```

Rules:

- Feature models own local view state, asynchronous orchestration, and expected
  error presentation. Views remain declarative.
- Features receive ports from app composition and cannot import adapters or
  peer features.
- Adapters cannot import app composition, product features, or UI.
- Ports cannot import React, browser APIs, or concrete implementations.
- Runtime source contains no demo adapter or production fixture. Deterministic
  synthetic data belongs under `test/` only.
- Browser storage may hold non-secret presentation preferences such as theme or
  last-selected location. It must never hold a session credential.
- `components/ui` contains mechanisms and cannot import Pressly protocols.
- `shared/`, `common/`, generic `hooks/`, and `lib/` buckets are forbidden.
  The shadcn-only class-name merger belongs to `components/ui/class-names.ts`.
- Feature files declare a real role with `*.model.ts`, `*.presenter.ts`, or
  `*.view.tsx`.
- Port files use `*.port.ts` or `*.error.ts`; adapter files use
  `*.adapter.ts`. Test fixtures remain under `test/`.

These rules are enforced by the processor ESLint configuration and repository
architecture-boundary tests, including relative and aliased imports.

`apps/cli` responsibilities:

- Run operator/developer workflows
- Validate operator input
- Call module/application capabilities safely
- Fail loudly with structured errors

Apps do not own business meaning. They assemble the program.

For Cents ingress, `apps/api` owns the vendor wire adapter: exact raw-byte HMAC
verification, event classification, alias normalization, decimal-money
conversion, and payload minimization. It submits a source-neutral command to
`modules/business/webhook-ingestion`, which owns the durable inbox, claims,
retries, dead letters, and source-location bindings.

`apps/worker` is the asynchronous composition root. A vendor consumer translates
one claimed event into a canonical `ApplyOrderDemand` command and injects that
command into `modules/business/production`. Production owns order-demand and
physical-production rules; it has no knowledge of Cents, HTTP webhooks, inbox
receipts, or worker leases. Modules remain isolated peers and never import or
declare package dependencies on one another. API and worker applications are
the only places that connect their public ports.

`apps/api` may wire route guards produced by a policy module. It should not
define application authorization policy itself.

## 10. Persistence

`packages/db` owns database schema, migrations, seeds, and database clients.

Modules may import schema through stable database exports when implementing persistence adapters. The database package should not import business modules. That keeps migration/schema ownership from creating circular dependencies.

Rules:

- Schema describes storage.
- Repositories translate storage into application results.
- Use cases decide business policy.
- Temporal fields must be honored by reads.
- Seed data and schema migrations should be split once business data starts changing regularly.

## 11. Errors

Errors must be structured and predictable.

`AppError` is the structured error value.

`AppException` is the throwable `Error` wrapper.

The common error shape is:

```txt
kind
code
message
safeMessage
status
details
cause
traceId
```

Rules:

- Throw `AppException` when code needs to throw.
- Return or serialize `AppError` when code needs an error value.
- Domain errors should describe violated meaning.
- Adapter errors should describe failed mechanisms.
- HTTP status mapping belongs at the HTTP boundary.
- Internal causes should be logged, not leaked to clients.
- Failed responses should include a trace id when available.

## 12. Transactions

Transactions are application boundaries, not repository accidents.

Preferred shape:

```txt
use case
  -> feature repo transaction(...)
    -> feature repo operation
    -> feature repo operation
    -> result
```

Rules:

- A use case owns the transaction boundary.
- The feature repository supplies transaction-scoped operations without
  exposing a database executor to the use case.
- Multi-table consistency for one capability happens inside one transaction.
- Shared transaction execution belongs in a narrow persistence foundation;
  it is not a reason to create one repository for the whole module.
- External network calls should not happen inside database transactions unless explicitly required.
- Idempotency should wrap risky operations at the application boundary.

## 13. Observability

The system should explain itself while running.

Every runtime path should support:

```txt
request id
trace id
structured logs
metrics
health checks
readiness checks
error reporting
```

Rules:

- Logs are structured.
- Logs do not contain secrets.
- Each request gets request metadata.
- Each job run gets a run id.
- Health proves the process is alive.
- Readiness proves the process can serve traffic.
- Metrics describe system behavior, not guesses.
- Errors should be correlated with trace ids.

## 14. Testing

Tests should match the layer being tested.

```txt
intrinsic rule tests
  Pure rules and invariants.

use case tests
  Application behavior with fake ports.

adapter tests
  HTTP, persistence, vendor, and framework translation.

integration tests
  Real database, real app wiring, real middleware.

e2e tests
  Public behavior through browser or API protocols.
```

Rules:

- Pure code gets fast unit tests.
- Use cases should not require Express or Postgres.
- Repository tests may require Postgres.
- Controller tests verify protocol behavior.
- E2E tests cover critical flows only.
- Shared helpers belong in `packages/testkit`.

## 15. Naming

Names should reveal architectural role, but the naming contract follows the
kind of module rather than forcing one global suffix list.

Business capability source uses this deliberately closed vocabulary:

```txt
*.command.ts      non-HTTP delivery entrypoint
*.controller.ts   protocol-to-use-case adapter
*.error.ts        expected error mapping
*.mapper.ts       representation mapping
*.middleware.ts   protocol middleware
*.policy.ts       intrinsic business policy
*.port.ts         required capability contract
*.repo.ts         persistence adapter
*.route.ts        route binding
*.usecase.ts      application behavior
```

Within `modules/business/*/src/`, only `main.ts`, `public.ts`, and files inside
an explicit `http/` or `persistence/` foundation may omit a role suffix.
Foundation filenames should describe the narrow mechanism they centralize,
such as `http/auth-context.ts` or `persistence/database-result.ts`.

Policy modules use this closed policy vocabulary:

```txt
*.guard.ts       framework-facing policy enforcement
*.policy.ts      pure policy decisions and invariants
*.resource.ts    policy resource representation
*.port.ts        injected capability required to enforce policy
```

The policy `*.port.ts` role is retained because policy must receive runtime
capabilities through dependency injection rather than import business module
internals. Computation modules use their own closed vocabulary:

```txt
*.computation.ts  pure deterministic calculation
*.port.ts         typed capability boundary when composition requires one
```

Every module may use `main.ts` for composition and `public.ts` for its stable
external surface.

A module may also expose a narrowly named root `*.port.ts` or `*.error.ts` as
mechanism-free language shared by its own capabilities. These files are not a
route around capability ownership: root composition and generic shared/common
buckets remain forbidden.

Module tests live under `test/`, where test-specific names such as
`*.test.ts`, `*.fake.ts`, and `*.builder.ts` are allowed. Runtime boundary
schemas belong in `packages/contracts`; persistence schemas belong in
`packages/db`. Transport parsing belongs at the application adapter boundary.
Module `src/` therefore does not contain `*.schema.ts`, `*.parser.ts`, or test
files.

Other repository areas use vocabulary appropriate to their boundary. For
example, contracts use:

```txt
*.contracts.ts   runtime boundary schemas
*.result.ts      output from a use case
```

Functions:

```txt
makeX     creates a composed capability
parseX    validates unknown input
toX       transforms representation
assertX   enforces an invariant
isX       returns boolean
loadX     loads an application-facing result
findX     looks up something that may not exist
publishX  makes a controlled business change visible
runX      performs an effectful operation
```

Types:

```txt
XCommand
XResult
XUseCase
XPort
XRepo
XController
XPresenter
XContext
XConfig
```

General rules:

- Prefer precise names over short names.
- Name concepts before mechanisms.
- Avoid generic `service` names.
- Avoid files that contain unrelated ideas.
- Keep public names stable.
- Let private names change freely.

## 16. Adding a Feature

A normal backend feature should move like this:

```txt
1. Define shared contract if the feature crosses a boundary.
2. Add command/result types.
3. Add a top-level capability folder in the owning module.
4. Add the use case and ports inside that capability.
5. Colocate HTTP, persistence, vendor, or job adapters in that capability.
6. Wire everything in module main.ts.
7. Mount the module in the app.
8. Mirror the capability under test/ and add tests at the right boundary.
```

A normal frontend page should move like this:

```txt
1. Put the route in app/.
2. Put product behavior in features/<capability>.
3. Keep route-only composition in private _components/_lib/_shared folders.
4. Use common core ports and select adapters only at composition boundaries.
5. Keep vendor imports out of product and route components.
6. Render UI from explicit data and minimal client state.
7. Preserve static rendering unless per-request behavior is intentional.
```

That is the architecture in one sentence: put meaning near the business capability, put mechanisms at the edges, and compose the final program only at the runtime boundary.
