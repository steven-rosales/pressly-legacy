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

`main.ts`, route handlers, page components, and app startup files may import many things because they are composition points. Domain and feature files should import very little.

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
      src/app/        Next.js route tree and route-local files
      src/common/     web runtime core, adapters, and browser/server helpers
      src/infra/      web-side protocol clients

    api/              Express HTTP process
    worker/           background and scheduled process
    cli/              operator/developer CLI tools

  modules/
    pricing/          business capability module

  packages/
    auth/             shared auth types/capabilities
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
adapters -> features
controllers -> use cases
repos -> feature ports
routes -> controllers
main.ts -> runtime composition
```

Disallowed direction:

```txt
modules -> apps
features -> controllers
features -> repositories
use cases -> HTTP details
use cases -> SQL details
domain -> Express / Next.js / Drizzle / Pino
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

A module is a vertical business capability.

Current example:

```txt
modules/pricing/
  src/
    features/
      load-pricing-catalog/
        load-pricing-catalog.port.ts
        load-pricing-catalog.usecase.ts
      publish-pricing/
        publish-pricing-change.usecase.ts

    adapters/
      http/
        pricing.controller.ts
        pricing.routes.ts
      persistence/
        pricing.repo.ts

    main.ts
    public.ts
```

`public.ts` is the stable module surface.

`main.ts` is the module composition root. It wires repositories, use cases, controllers, and routes.

Feature files should speak application language. For reads and lookups, prefer precise verbs:

- `loadX` for loading an application-facing view or catalog.
- `findX` for a persistence lookup that may or may not exist.
- `publishX` for making a controlled business change visible.
- `createX`, `updateX`, and `deleteX` only when that is literally the business action.

Avoid `getX` in application and module naming. It is too vague and collides mentally with HTTP `GET`. HTTP route methods can still use `router.get(...)`.

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

`apps/web/src/app` is the route tree. Route folders can also colocate route-local implementation files as long as they are not Next.js convention files such as `page.tsx`, `layout.tsx`, or `route.ts`.

Current shape:

```txt
apps/web/src/app/
  (marketing)/
    home/
      page.tsx
      model.ts
      ui/
    services-pricing/
      model.ts
      presenter.ts
      wash-fold/
      dry-cleaning/
      ui/
    new-jersey/
      model.ts
      content/
      ui/

  shared/
    marketing/
    ui/
    legal/

apps/web/src/common/
  core/       web runtime capability language
  adapters/   PostHog, Sentry, Sonner, request clients, browser ids
  config/
  testing/

apps/web/src/infra/
  pricing.ts  web-side protocol integration
```

Frontend rules:

- `page.tsx` and `layout.tsx` compose.
- `model.ts` builds view models for the page.
- `presenter.ts` transforms data into UI-ready representation.
- `ui/` renders the view model.
- `content/` holds route-local static content.
- `common/core` owns generic web capabilities, not business rules.
- `common/adapters` owns vendor/framework implementations.
- `infra` owns protocol clients and server-side integration points.

The frontend can validate protocol payloads and build view models. It should not recreate backend domain rules as truth.

For public marketing pages, prefer static or build-time rendering unless the route genuinely needs per-request behavior. If a build-time fetch has a fallback, the fallback policy must be explicit and user-safe.

## 8. Web Core

Web core is a small capability layer, not a god object.

It exists to make runtime effects declarative:

```txt
core.query.run(...)
core.query.fetch(...)
core.command.run(...)
core.analytics.track(...)
core.feedback.show(...)
core.clock.now()
core.ids.sessionId()
```

The call site should describe the work. The core interpreter handles logging, metadata, error normalization, reporting, and feedback policy.

Rules:

- Core should not own product workflows.
- Core should not know pricing, marketing, or Cents-specific behavior.
- Vendor imports belong in adapters.
- Route code should use declarative helpers instead of importing vendors directly.
- Add to core only when the capability is broadly useful across frontend workflows.

State machines, forms, workflow engines, and pricing flows can be sibling interpreters that consume core. They do not all need to be inside core.

## 9. API, Worker, and CLI Apps

Apps own runtime composition.

`apps/api` responsibilities:

- Load env
- Create logger
- Create database connection
- Install HTTP middleware
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
domain tests
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
*.routes.ts      route binding
*.presenter.ts   result-to-response or data-to-view mapping
*.model.ts       page/view model composition
*.schema.ts      protocol or persistence shape
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
3. Add the use case in the module.
4. Define ports the use case needs.
5. Implement adapters for HTTP, persistence, vendors, or jobs.
6. Wire everything in module main.ts.
7. Mount the module in the app.
8. Add tests at the right layer.
```

A normal frontend page should move like this:

```txt
1. Put the route in app/.
2. Put route-specific model/presenter/ui/content beside the route.
3. Use infra/common adapters for protocol calls and effects.
4. Render UI from view models.
5. Keep vendor imports out of page components.
6. Preserve static rendering unless per-request behavior is intentional.
```

That is the architecture in one sentence: put meaning near the business capability, put mechanisms at the edges, and compose the final program only at the runtime boundary.
