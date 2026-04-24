# Architecture

This document defines the structural laws of the system before any domain, use case, controller, port, repo, UI feature, job, or database table is introduced.

The goal is not to make the project look enterprise. The goal is to keep meaning separate from mechanism, keep state explicit, make effects visible, and make each layer speak a small language appropiate to its responsibility.

The project uses a Typescript and SQL monorepo with a clean architecture / hexagonal architecture style. The frontend is treated as an external adapter and protocol consumer, not as an owner of business rules.

## 1. Architectural Premise

The system is built around a small number of principles

### Programs express ideas

Code should descibe the concepts of the system before it describes machine steps. A function, type, module, or package should answer one of these questions:

- What concept does this represent?
- What invariant does this protect?
- What transformation does this describe?
- What effect does this perform?
- What boundary does this adapt?

Implementation detail is allowed only after the meaning has a home.

### Separate meaning from mechanism

The system distinguishes between:

- Domain meaning
- Application decisions
- Protocol representation
- Persistence representation
- Runtime mechanism
- Framework mechanism

A database row is not a domain entity, an HTTP request is not a use case, a react component is not a domain owner, a zod schema is not automatically a domain model, an express middleware is not an application policy, ..., a cron job is not a business process.

### Compose small general pieces

Modules should expose small, composable functions and types rather than large objects hidden behavior.

Prefer: `validate -> authorize -> transact -> execute -> present`
Avoid: `controller.doEverything(req, res)`

Composition should happen at the outer layers. Inner layers should describe meaning and decisions.

### Make state explicit and limited

State should have a visible owner.

State is allowed in:

- Database records
- Request context
- Transaction context
- Auth/session context
- UI state
- Worker job state
- Process runtime state

State should not be smuggled through globals, mutable singletons, implicit caches, hiddne module variable, or framework magic.

### Design for change

An architecture assumes that the following things will change:

- UI framework behavior
- API protocols
- Authentication provider
- Authorization rules
- Database schema
- Deployment target
- Queue/worker mechanism
- Observability vendor
- Feature flag mechanism
- Business use cases

The core should not be rewritten when these change.

## 2. Monorepo Shape

The repository is organized by deployable applications and reusable packages.

```txt
pressly/
  apps/
    web/
    api/
    worker/

  modules/

    <module-name>
      domain/

      features/
        <feature-name>/
          <feature-name>.command.ts
          <feature-name>.result.ts
          (<feature-name> || <feature-name-variant>).usecase.ts
          <feature-name>.port.ts

      adapters/
        http/
          (<feature-name> || <feature-name-variant>).controller.ts
          (<feature-name> || <feature-name-variant>).routes.ts
          <feature-name>.presenter.ts
        persistence/
          (<feature-name> || <feature-name-variant>).repo.ts
        schemas/
          <schema-name>.schema.ts

    main.ts
    public.ts

  packages/
    config/
    contracts/
    errors/
    logging/
    metrics/
    db/
    auth/
    http/
    testkit/
    tsconfig/
    eslint-config/

  tooling/
    docker/
    github/
    scripts/

  docs/
    architecture.md

  .gitignore
  .dockerignore
  docker-compose.yml
  pnpm-workspace.yaml
  turbo.json
  package.json
```

Note: `(<feature-name> || <feature-name-variant>)` is used to let the architecture scale vertically. For example, if the feature is `create-user`, there can be `create-user.usecase.ts`, but later we might refactor towards `create-customer.usecase.ts` and `create-staff.usecase.ts`.

### Deployable applications

`apps/web`

Next.js frontend application

Responsibilities

- Render UI
- Manage browser and UI state
- Call API protocols
- Subscribe to event streams
- Validate protocol payloads at the edge
- Present errors in user-appropiate language

Non-responsibilites

- Own domain rules
- Import databse code
- Import backend application services
- Import backend repositories
- Reconstruct authorization rules as business truths
- Treat API DTOs as domain entities

The frontend is a port consumer. It speaks HTTP, event stream, and UI state languages.

`apps/api`

Express HTTP API application.

Responsibilities:

- Process HTTP requests
- Parse and validate request input
- Create request context
- Authenticate caller
- Invoke application/use-case ports later
- Map application results to protocol responses
- Handle errors consistently
- Expose health and readiness endpoints

Non-responsiblities:

- Contain domain logic
- Contain persistence logic directly in route handlers
- Contain authorization decisions inline
- Let Express types leak inward

`apps/worker`

Background and scheduled job application.

Responsibilities:

- Run scheduled work
- Run async/background work
- Create job context
- Enforce job timeouts and cancellation

Non-responsibilities:

- Own domain logic
- Contain business rules inside scheduled job handlers
- Bypass use cases by calling repositories directly
- Hide retries, timeouts, or cancellation inside job code
- Run database migrations as ordinary jobs
- Share mutable process state across job runs
- Assume only one worker instance exists
- Treat cron timing as a business invariant
- Perform non-idempotent work without an idempotency boundary
- Let node-cron types or scheduling mechanics leak inward

Here’s a compact continuation you can paste after section 2.

````md
## 3. Dependency Direction

Dependencies point inward.

Allowed direction:

```txt
apps -> modules -> packages
adapters -> features -> domain
controllers -> use cases
repos -> ports
routes -> controllers
main.ts -> everything needed for composition
```
````

Disallowed direction:

```txt
domain -> adapters
domain -> packages/db
domain -> Express / Next.js / Drizzle / Pino
features -> controllers
features -> repos
use cases -> HTTP details
use cases -> SQL details
apps/web -> backend internals
```

The composition root may import many things. Inner layers should import very little.

## 4. Layer Responsibilities

### Domain

Owns meaning and invariants.

Responsibilities:

- Entities
- Value objects
- Domain rules
- Pure transformations
- Invariant protection

The domain should not know how it is stored, transported, rendered, logged, scheduled, or deployed.

### Features

Owns application behavior.

Responsibilities:

- Commands
- Results
- Use cases
- Application ports
- Authorization calls
- Transaction boundaries
- Idempotency boundaries

A feature describes what the system does, not how a framework performs it.

### Adapters

Own mechanisms.

Responsibilities:

- HTTP controllers
- Routes
- Presenters
- Repositories
- Database schemas
- External service clients
- Framework translation

Adapters translate between external mechanisms and internal language.

### Apps

Own runtime composition.

Responsibilities:

- Process startup
- Env loading
- Logger creation
- Database connection
- Express/Next/worker runtime
- Middleware setup
- Module mounting
- Graceful shutdown

Apps assemble the program. They do not own business meaning.

## 5. Module Anatomy

Each module is a vertical boundary around a business capability.

```txt
modules/
  <module-name>/
    domain/

    features/
      <feature-name>/
        <feature-name>.command.ts
        <feature-name>.result.ts
        <feature-name>.usecase.ts
        <feature-name>.port.ts

    adapters/
      http/
        <feature-name>.controller.ts
        <feature-name>.routes.ts
        <feature-name>.presenter.ts
      persistence/
        <feature-name>.repo.ts
        <schema-name>.schema.ts

    main.ts
    public.ts
```

`public.ts` exposes the stable public surface of the module.

`main.ts` composes the module for runtime use. It wires repos, use cases, controllers, and routes.

No other code should deep import from another module.

## 6. Contracts vs Domain Types

Contracts are protocol types.

Domain types are meaning types.

A contract may describe:

- HTTP request body
- HTTP response body
- Query params
- Route params
- Event payload
- Error envelope

A domain type may describe:

- Entity
- Value object
- Invariant
- Domain decision
- Domain event

A Zod schema in `packages/contracts` validates protocol shape. It does not automatically become a domain model.

External input should move through this path:

```txt
unknown input
  -> contract validation
  -> command
  -> use case
  -> domain model
```

External output should move through this path:

```txt
domain/application result
  -> presenter
  -> response contract
  -> protocol response
```

## 7. Error Language

Errors must be structured and predictable.

The system uses application errors with:

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

Error categories:

```txt
ValidationError
AuthError
PermissionError
NotFoundError
ConflictError
RateLimitError
ExternalServiceError
DatabaseError
InvariantViolationError
UnexpectedError
```

Rules:

- Domain errors should describe violated meaning.
- Application errors should describe failed decisions.
- Adapter errors should describe failed mechanisms.
- HTTP status mapping belongs at the HTTP boundary.
- Internal causes should be logged, not leaked to clients.
- Every failed response should include a trace id.

## 8. Context and State

State must have a visible owner.

Allowed state owners:

```txt
RequestContext
TransactionContext
JobContext
AuthContext
UI state
Database state
Process runtime state
```

Common context shape:

```txt
requestId
traceId
principal
logger
signal
startedAt
```

Rules:

- No hidden mutable globals.
- No implicit request state.
- No framework objects passed inward.
- No database transaction hidden in module state.
- State should be passed explicitly as data.

## 9. Transaction Boundaries

Transactions are application boundaries, not repository accidents.

Use cases decide when a transaction starts and ends.

Repositories may use a transaction, yet they should not secretly create one for a larger business operation.

Preferred shape:

```txt
use case
  -> transactor.run(...)
    -> repo operation
    -> repo operation
    -> result
```

Rules:

- A use case owns its transaction boundary.
- A transaction context is passed explicitly.
- Cross-repository consistency happens inside one transaction.
- External network calls should not happen inside DB transactions unless explicitly required.
- Idempotency should wrap the operation at the application boundary.

## 10. Effects and Adapters

Effects happen at the edges.

Effects include:

```txt
database writes
HTTP calls
email
file system
queues
cron
logging
metrics
time
random ids
```

Inner code should depend on capabilities, not concrete effects.

Examples:

```txt
Clock
IdGenerator
Logger
Transactor
RunIdempotently
EventPublisher
PasswordHasher
```

A use case should describe required capabilities through its dependencies.

```txt
makeUseCase({ repo, transactor, clock, ids, logger })
```

This keeps the program declarative: the use case describes the composition of meanings and effects.

## 11. Testing Strategy

Tests should follow the architecture.

```txt
domain tests
  Pure rules and invariants.

use case tests
  Application behavior with fake ports.

adapter tests
  HTTP, persistence, and external mechanism translation.

integration tests
  Real database, real app wiring, real middleware.

e2e tests
  Browser and API behavior through public protocols.
```

Rules:

- Domain tests should be fast and pure.
- Use case tests should not require Express or Postgres.
- Repository tests may require Postgres.
- Controller tests should verify protocol behavior.
- E2E tests should cover critical flows only.
- Test helpers belong in `packages/testkit`.

## 12. Observability Laws

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

- Logs are structured JSON.
- Logs should not contain secrets.
- Each request gets a child logger.
- Each job run gets a run id.
- Health checks prove the process is alive.
- Readiness checks prove the process can serve traffic.
- Metrics describe system behavior, not business guesses.
- Errors should be correlated with trace ids.

## 13. CI / Boundary Enforcement

Architecture should be enforced by tooling.

CI should run:

```txt
format
lint
typecheck
unit tests
integration tests
build
e2e smoke tests
migration checks
```

Boundaries should be enforced with:

```txt
package exports
TypeScript project references
ESLint import rules
no deep imports
no circular dependencies
CI checks
```

Rules:

- A package exposes its public API through `index.ts` or `public.ts`.
- Cross-module imports must use public exports.
- Apps may compose modules.
- Modules should not import from apps.
- Failing boundary checks should block merges.

## 14. Naming Conventions

Names should reveal architectural role.

Files:

```txt
*.command.ts      input to a use case
*.result.ts       output from a use case
*.usecase.ts      application behavior
*.port.ts         required capability
*.repo.ts         persistence adapter
*.controller.ts   HTTP adapter
*.routes.ts       route binding
*.presenter.ts    result-to-response mapping
*.schema.ts       protocol or persistence shape
```

Functions:

```txt
makeX          creates a composed capability
parseX         validates unknown input
toX            transforms representation
assertX        enforces an invariant
isX            returns boolean
runX           performs an effectful operation
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
- Avoid generic service names.
- Avoid files that contain many unrelated ideas.
- Keep public names stable.
- Let private names change freely.
