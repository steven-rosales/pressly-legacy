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
    cli/              operator/developer CLI tools

  modules/
    business/
      auth/           authentication/session capability module
      pricing/        business capability module
    policy/
      access-control/ authorization policy module
    # Future only: computation/ does not exist in the current repository.
    # Add computation/<capability>/ with its first real calculation and tests.

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
module main.ts -> capability files
capability adapters -> same-capability use cases and ports
web app -> features, UI primitives, and common runtime
web features -> common core
common adapters -> common core
```

Disallowed direction:

```txt
modules -> apps
one module capability -> a sibling capability
use cases -> HTTP details
use cases -> SQL details
intrinsic policy -> Express / Next.js / Drizzle / Pino
web common -> app or features
web features -> app
apps/web -> backend module internals
packages -> apps
```

Cross-module imports should go through `public.ts`. Cross-package imports should go through package exports.

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
- Cross-module imports go through `public.ts`.
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
- Tests mirror capability names.
- File suffixes still reveal role: `*.usecase.ts`, `*.port.ts`, `*.repo.ts`,
  `*.controller.ts`, `*.route.ts`, `*.policy.ts`, and so on.

Auth has explicit `http/` and `persistence/` foundations. Access-control has an
explicit `identity/` foundation. Those are directed dependencies, not
general-purpose dumping grounds.

### Business Modules

A business module owns product or stateful application behavior.

Current examples:

- `modules/business/auth`
- `modules/business/pricing`

Business module rules:

- Use cases own application behavior.
- Intrinsic business invariants and state machines stay in the business
  capability that owns the state.
- Repositories and controllers are mechanism adapters colocated with that
  capability.
- Business modules should not own cross-cutting authorization policy.
- Business modules should not import `@pressly/auth` authorization primitives unless the module itself is the auth module.
- Injected policy or computation may advise or authorize a command, but it
  cannot bypass intrinsic invariants.

Capability files should speak application language. For reads and lookups, prefer precise verbs:

- `loadX` for loading an application-facing view or catalog.
- `findX` for a persistence lookup that may or may not exist.
- `publishX` for making a controlled business change visible.
- `createX`, `updateX`, and `deleteX` only when that is literally the business action.

Avoid `getX` in application and module naming. It is too vague and collides mentally with HTTP `GET`. HTTP route methods can still use `router.get(...)`.

### Policy Modules

A policy module owns application policy that cuts across business capabilities.

Current example:

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

Policy module rules:

- Own Pressly authorization policy, not authentication.
- Import pure authorization primitives from `@pressly/auth`.
- Build resource mappers and guard bundles for business routes.
- Depend on contracts or public module surfaces only.
- Do not import business module internals.
- Do not make `apps/api` define policy.
- Remain replaceable at the composition boundary; policy modules do not own
  durable business state or business state-machine transitions.

This keeps the API app as a composition root and keeps business modules from
becoming security modules by accident.

### Projection and Computation Modules

A projection or computation module owns deterministic derived views,
calculations, proposals, or analysis that are not authoritative business state.

Possible future shape:

```txt
modules/computation/<capability>/
  src/
    <calculation>/
      *.calculator.ts
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
- Add policy or state-machine files only for durable intrinsic invariants.
- A module may have no database if it computes over existing inputs or projections.
- Receive immutable input and return a result or proposal.
- Never mutate another module's operational state.

The folder names in the previous three bullets describe optional roles, not a
required horizontal tree. New source remains capability-first.

### Intrinsic Rules, Injected Policy, and Computation

These responsibilities are deliberately different:

```txt
business module
  owns durable state, invariants, transactions, and state machines

policy module
  supplies replaceable cross-cutting decisions such as authorization

computation module
  supplies replaceable calculations or proposals from stable input

app
  injects concrete policy and computation into the business boundary
```

A business command validates its invariants even when policy and computation
have already approved or proposed the operation. An injected dependency is
never a way to outsource the truth of the state being changed.

For the future LPMS, the business capability will own production eligibility,
order cohesion, stage transitions, optimistic concurrency, idempotency, and
the transaction that records operational changes. A scheduler may propose
batches and machine assignments, but accepting that proposal must revalidate
business invariants before creating execution records.

This architecture refactor does not scaffold an LPMS business module or a
computation module. Those modules should be created only when their first real
behavior and tests are implemented.

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

`apps/cli` responsibilities:

- Run operator/developer workflows
- Validate operator input
- Call module/application capabilities safely
- Fail loudly with structured errors

Apps do not own business meaning. They assemble the program.

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
  -> transactor.run(...)
    -> repo operation
    -> repo operation
    -> result
```

Rules:

- A use case owns the transaction boundary.
- A transaction context is passed explicitly.
- Cross-repository consistency happens inside one transaction.
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

Names should reveal architectural role.

Files:

```txt
*.contracts.ts   runtime boundary schemas
*.command.ts     input to a use case
*.result.ts      output from a use case
*.usecase.ts     application behavior
*.port.ts        required capability
*.repo.ts        persistence adapter
*.controller.ts  HTTP adapter
*.route.ts       route binding
*.presenter.ts   result-to-response or data-to-view mapping
*.model.ts       page/view model composition
*.schema.ts      protocol or persistence shape
*.guard.ts       policy-to-framework guard
*.resource.ts    policy input mapping
*.mapper.ts      representation mapping
*.calculator.ts  deterministic computation
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
