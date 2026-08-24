# Refactoring wiht Cellular Modular Monolith

Replace the current structure with a **cellular modular monolith**:

```txt
systems own state and truth
cells own behavior
experiences own user workflows
hosts interpret protocols
platform provides mechanisms
```

The target should be **distribution-ready without being distributed by default**: one PostgreSQL cluster, one HTTP process, one job process, and explicit system boundaries that could later become network boundaries without rewriting business logic.

## Target Repository

```txt
hosts/
  http/
    main.ts
  jobs/
    main.ts
  cli/
  browser/
    customer/
    control/
    processor/

systems/
  access/
  customers/
  orders/
  pricing/
  production/
  ingress/

experience/
  customer/
  control/
  processor/

platform/
  auth/
  cells/
  codec/
  config/
  errors/
  http/
  jobs/
  logging/
  money/
  observability/
  postgres/
  testing/
  time/

tooling/
  pressly.ts
  local.ts
  production.ts

generated/
  http-catalog.ts
  job-catalog.ts
  clients/

deploy/
docs/
stateworks/
tooling/
```

### Meaning of Each Top-Level Directory

| Directory   | Responsibility                                                                          |
| :---------- | :-------------------------------------------------------------------------------------- |
| systems     | Durable state, invariants, lifecycle authority, commands, queries, and emitted messages |
| experiences | Cross-system user workflows, experience-specific projections, and frontend features     |
| hosts       | Process lifecycle and protocol interpretation only                                      |
| platform    | Generic technical mechanisms with no Pressly business knowledge                         |
| topology    | Which systems, experiences, and hosts are assembled into a deployment                   |
| generated   | Static imports, typed clients, endpoint/job catalogs, and navigational maps             |

Make two more naming changes:

- Merge current identity and Authorization into systems/access
- Rename current Users authority to systems/customers. "User" is overloaded between customers, workers, identities, sessions, and browser users.

systems/ingress would own webhook receipts, quarantine, inbox leases, replay, and dead letters. Cents translation would live under an ingress source adapter rather than inside HTTP host.

## The Central Unit: A Cell

A **cell** is one independently observable operation:

- one command,
- one query
- one event reaction,
- or one stateful process manager.

Everything specific to that operation stays together.

For the existing Production stage operation:

```txt
systems/
  production/
    system.ts

    model/
      batch/
        batch.ts
        lifecycle.ts
      stage/
        stage.ts
        lifecycle.ts
        confirmation.ts
      schedule/
        schedule.ts

    schema/
      tables.ts
      migrations/

    cells/
      floor/
        advance-stage/
          cell.ts
          contract.ts
          decide.ts
          execute.ts
          postgres.ts
          http.ts
          events.ts
          advance-stage.spec.ts
          advance-stage.int.spec.ts
```

The current feature is already cohesive, but its nine-file vocabulary and repeated filename prefix create unnecessary ceremony.

The replacement roles are deliverately smaller:

- `contract.ts`: versioned serialized input, output, and expected failures
- `decide.ts`: pure state transition or calculation
- `execute.ts`: effectful orchestration
- `postgres.ts`: operation specific persistence
- `http.ts`: framework-free HTTP declaration
- `event.ts`: emitted message contracts
- `cell.ts`: the cell's immutable manifest and assembly
- colocated specifications: unit, contract, and integration tests

A separate `port.ts` should exist only when there is an actual replacement axis. It should not be mandatory ceremony around every repository or function.

Shared Production concepts remain in `systems/production/model`. Operation specific concepts remain in the operation folder.

## Functional Shape

The core transition remains pure:

```ts
type AdvanceStageDecision =
  | Readonly<{
      kind: 'commit';
      nextStage: Stage;
      events: readonly ProductionEvent[];
    }>
  | Readonly<{ kind: 'reject'; failure: AdvanceStageFailure }>;

export const decideAdvanceStage = (
  current: AdvanceStageFacts,
  command: AdvanceStageCommands,
): AdvanceStageDecision => {
  // Pure lifecycle, confirmation, capacity, and version decisions.
};
```

The effectful shell obtains authoritative facts and commits the decision:

```ts
export const makeExecuteAdvanceStage =
  (dependencies: AdvanceStageDependencies) =>
  async (
    command: AdvanceStageCommand,
  ): Promise<Result<AdvanceStageResult, AdvanceStageFailure>> =>
    dependencies.transaction(async (transaction) => {
      const current = await dependencies.store.loadForUpdate(
        transaction,
        command.stageRunId,
      );

      const decision = decideAdvanceStage(current, command);

      if (decision.kind === 'reject') return result.err(decision.failure);

      await dependencies.store.commit(transaction, decision.nextStage);

      await dependencies.outbox.append(transaction, decision.events);

      return result.ok(toAdvanceStageResult(decision));
    });
```

This preserves the strongest part of the current code. For example, the Orders fullfillment release use case already handles command hashing, idempotency receipts, optimistic versions, row locking, lifecycle decisions, and transactional mutation. The behavior should be moved, not reinvented.

I would not introduce Effect-TS, a dependency-injection framework, decorators, or a runtime service container. Pressly already has important primitives: `Result`, clocks, ID sources, transactions, explicit dependencies, and pure policies.

## A Declarative Cell Manifest

Each cell declares both its software behavior and its distributed-systems behavior:

```ts
export const makeAdvanceStageCell = (dependencies: AdvanceStageDependencies) =>
  defineCommandCell({
    id: 'production.advance.stage.v1',

    contract: advanceStageContract,

    authorization: {
      capability: 'production.stage.advance',
      scope: ({ locationId }) => locationId,
    },

    consistency: {
      transaction: 'required',
      concurrencyKey: ({ locationId }) => locationId,
      expectedVersion: ({ expectedStageVersion }) => expectedStageVersion,
    },

    idempotency: {
      required: true,
      key: ({ idempotencyKey }) => idempotencyKey,
    },

    execute: makeExecuteAdvanceStage(dependencies),

    surfaces: [
      http.post({
        path: 'production/locations/:locationId/stages/:stageRunId/:transition',
        bodyLimit: 'small-command',
        input: toAdvanceStageCommand,
        output: toAdvanceStageResponse,
      }),
    ],

    emits: [productionStageStartedV1, productionStageCompletedV1],

    observability: {
      operation: 'production.advance-stage',
    },
  });
```

The manifest should support:

- stable operation ID,
- command/query/reaction/process kind,
- input and output contract versions,
- authorization capability and scope,
- transaction requirement,
- concurrency or partition key,
- optimistic version rule,
- idempotency rule,
- endpoint or job surfaces,
- emitted and consumed messages,
- retry and dead-letter policy,
- timeout policy,
- observability identity.

This makes concurrency, retries, versioning, and delivery semantics visible before opening and implementation.

## The HTTP Host has Zero Domain Knowledge

`hosts/http` should not import Orders, Production, Identity, Cents, Pricing, Control, or Processor.

It should look approximately like this:

```ts
import { httpCatalog } from '@pressly/generated/http-catalog';
import { createHttpPlatform } from '@pressly/platform/http';
import { startHttpHost } from '@pressly/platform/http-host';

const platform = await createHttpPlatform(process.env);

await startHttpHost({
  platform,
  endpoints: httpCatalog,
});
```

It owns:

- process startup and shutdown,
- sockets,
- Express or another HTTP framework,
- request context,
- tracing,
- body parsing,
- CORS,
- security headers,
- authentication mechanism
- rate-limit mechanism,
- protocol error presentation,
- health and readiness mechanisms.

It does not own:

- route strings,
- business capabilities,
- domain specific middleware chains,
- module construction,
- Cents specific branches,
- Production-specfic signals
- Order-specific adapters.

The topology neessarily knows which systems exist:

```ts
export default defineTopology({
  systems: [
    accessSystem,
    customerSystem,
    ordersSystem,
    pricingSystem,
    productionSystem,
    ingressSystem,
  ],
  experiences: [customerExperience, controlExperience, processorExperience],
  hosts: [httpHost, jobsHost],
});
```

A build step turns that topology into static host catalogs. This is preferable to runtime filesystem scanning:

- deterministic startup,
- duplicate route detection at build time,
- static imports for bundling,
- no reflection magic,
- no domain imports in host source.

'Zero domain knowledge' therefore means: _The HTTP host contains no hand written domain imports, routes, branches, or composition. Domain knowledge exists only in cells and deplyment topology_.

## The Job Host is Equally Generic

Current Worker behavior is strong: reclaimable leases, bounded retries, jitter, inspectable dead letters, idempotent projection, hearbeats, and outbox/inbox recovery. That should remain unchanged.

But business jobs should move out of `apps/worker/src/jobs`.

What we have today is:

```txt
apps/worker/src/jobs/
  process-webhook-inbox/
  project-fulfillment-demand/
```

Target:

```txt
systems/
  ingress/
    cells/
      process-inbound-event/

systems/
  production/
    demand/
      project-fulfillment-demand/
        cell.ts
        contract.ts
        postgres.ts
        job.ts
```

The generic job only understands:

- polling,
- leasing,
- hearbeat renewal,
- retry scheduling,
- backoff,
- cancellation,
- dead-letter transitions,
- graceful shutdown,
- telemetry.

Each reaction cell declares:

```ts
defineReactionCell({
  id: 'production.project-fulfillment-demand.v1',
  consumes: ordersFulfillmentDemandReleasedV1,
  partitionBy: ({ locationId }) => locationId,
  idempotencyKey: ({ eventId }) => eventId,
  retry: {
    maxAttempts: 8,
    strategy: 'bounded-exponential-jitter',
  },
  deadLetter: 'retain',
  execute,
});
```

The host executes those declarations without knowing that they concern laundry, orders, Cents, or production.

## Distributed-System Boundaries

The architectural rule should be:

```txt
inside one system:
  direct calls + local database transaction

between systems:
  versioned capability or versioned message

across an asynchronous boundary:
  transactional outbox + inbox/deduplication

across a long-running workflow:
  explicit process manager
```

### 1. One Database Cluster, Separate Ownership

Keep PostgreSQL as the single operational database.

Eventually organize tables into PostgreSQL schemas:

```txt
access.*
customers.*
orders.*
pricing.*
production.*
ingress.*
experience_control.*
experience_processor.*
```

The platform owns:

- connections pooling,
- transaction execution,
- health checks,
- migration runner,
- SQL instrumentation.

Each system owns:

- table definitions,
- migrations,
- persistence mapping,
- database contraints,
- transaction level invariants.

A system may not import another system's schema or write its table. This produces a real future extraction boundary without introduction today's network complexity.

### 2. No Cross-System Transactions

Orders can commit:

```txt
canonical fullfillment mutation
+ command receipt
+ Order outbox message
```

Production consumes that message seprately and idempotently.

That is already consistent with Pressly's essential distinction between commercial order truth and physical production truth. The repository explicitly treats those as separate authorities, and source changes are not permitted to silently advance physical-floor state.

Do not collapse Orders and production simply to obtain transaction convenience.

### 3. Versioned Immutable Messages

Messages should be owned by the producer and carry a common envelope:

```ts
type MessageEnvelope<TType extends string, TPayload> = Readonly<{
  eventId: string;
  type: TType;
  version: number;
  producer: string;
  occurredAt: string;

  aggregateId: string;
  partitionKey: string;

  correlationId: string;
  causationId?: string;
  traceId?: string;

  payload: TPayload;
}>;
```

Rules:

- at-least-once delivery
- consumer idempotency is mandatory,
- ordering exists only within an explicit partition,
- event contracts are never rewritten,
- produces do not import consumers,
- dead letters remain inspectable,
- retries do not reinterpret business failures.

### 4. Synchronous Cross-System Calls are Explicit

A synchronous call is acceptable where the user requires an immediate answer, but it must use a stable capability contract.

```txt
experience -> system capability
system -> external system capability port
```

No peer-system internal imports and no cross sytem SQL joins. The topology may currently connect that capability to local function. A future topology could connect it to HTTP or messaging without changing the caller.

### 5. Cross System Read Models

For Control or Processor views needing data from several authorities:

- initially, an Experience query perform explicit synchronous fan-out;
- when latency or resilience requires it, build an Experience-owned projection from system events;
- do not build hidden joins cross Orders, Customer, and Production tables.

That is the correct place for eventual consistency: user-facing projection, not physical-floor command authority.

## Frontend and Backend Traversal

The Processor currently has its own feature hierarchy-forecast, intake, order control, scheduling, production board, settings, and others-separate from the backend Production hierarchy.

I would preserve runtime separation but add explicit experience manifests:

```txt
expriences/
  processor/
    experience.ts

  features/
    floor/
      advance-stage/
        feature.ts
        view.ts
        state.ts
        use-advance-stage.ts
        advance-stage.spec.tsx
```

```ts
export const advanceStageFeature = defineExperienceFeature({
  id: 'processor.floor.advance-stage',
  uses: [
    'production.advance-stage.v1',
    'production.load-board.v1',
    'production.subscribe-changes.v1',
  ],
});
```

Typed browser clients are generated form the operation contracts:

```ts
import { advanceProductionStage } from '@pressly/generated/clients/processor';
```

The UI never hand-writes:

- URL strings,
- transport DTOs
- response discriminants,
- retry assumptions,
- authorization capability names.

The source contracts remain besides the owning operation; generated clients are only derived artifacts.

## Traversal Guarantee

A person or agent should be able to run:

```bash
pnpm architecture:explain production.advance-stage.v1
```

and receive:

```txt
Operation
  production.advance-stage.v1

Owner
  systems/production/cells/floor/advance-stage

Experience consumers
  processor.floor.advance-stage

HTTP
  POST /production/locations/:locationId/stages/:stageRunId/:transition

Authorization
  production.stage.advance
  scope: locationId

Consistency
  transaction required
  concurrency partition: locationId
  expected version: stage version
  idempotency: required

State
  production stage run
  production batch
  machine assignments

Emits
  production.stage-started.v1
  production.stage-completed.v1

Consumers
  processor live projection
  operational metrics

Tests
  advance-stage.spec.ts
  advance-stage.int.spec.ts
  processor advance-stage.spec.tsx
```

The architecture map should be generated from source manifests and import evidence, not maintained manually.

The path becomes:

```txt
UI feature
  -> stable operation ID
  -> owning cell
  -> pure decision
  -> transaction
  -> emitted event
  -> consumer cells
```

There should be no need to search API bootstrap, a central contract package, a central DB schema package, Worker jobs, and module composition just to understand one operation.

Use the same stable ID in:

- traces,
- structured logs,
- metrics,
- Sentry transactions,
- audit events,
- tests,
- endpoint catalog,
- frontend feature declarations.

That gives both humans and agents operational index into the codebase.

## Hard Dependency Rules

```txt
hosts
  -> generated catalogs
  -> platform

topology
  -> hosts
  -> systems
  -> experiences
  -> platform

experiences
  -> system public capabilities/contracts
  -> platform

systems
  -> own model, cells, and schema
  -> platform
  -> another system's public contract only

platform
  -> platform only
```

Forbidden:

```txt
host -> system
host -> experience
platform -> system
system -> peer-system internals
system -> peer-system schema
system -> React, Express, process.env, filesystem, or vendor SDK
cell -> sibling cell internals
frontend -> system runtime implementation
```

One workspace package per system, experience, host, or substantial platform capability is enough. Do not create one package per cell.

## Architecture Enforcement Should Become Smaller

Keep enforcement, but enforce only high-value boundaries

- unique system, feature, operations, and event IDs;
- no host-to-system imports;
- no platform-to-business imports;
- no corss-system internal or schema imports;
- cell-local code cannot leak into another cell;
- endpoint conflicts;
- event version conflicts;
- browser-safe contract imports;
- declared edges correspond to actual imports;
- generated catalogs are current.

Remove most suffix and promotion bureaucracy:

- no required `main.ts` plus `public.ts`;
- no feature-versus-foundation fan-in accounting
- no mandatory role file for every architectural concept;
- no separate manifest explaining every shared helper;
- no mirrored `test/features/foundations/integration` hierarchy;
- nor rule that a file must be names `.model.ts` versus `.value.ts` merely to satisfy placement.

An architecture checker (e.g., dependency-cruiser, together with eslint) should primarily validate the dependency graph and cell declarations, not require developers to learn an extensive private taxonomy.

## Migration Plan

### Phase 1: Freeze external behavior

Before moving code, capture:

- HTTP methods, paths, bodies, statuses, and responses;
- cookies, CSRF, authentication, and authorization behavior;
- event schemas and versions;
- database constraints and transactional outcomes;
- idempotent replay behavior;
- optimistic version conflict behavior;
- Worker crash and lease recovery;
- Processor user flows.

No route, table, event, or business-state change should be bundled into the architecture refactor.

### Phase 2: Introduce the New Skeleton

Add:

```txt
platform/cells
hosts/http
hosts/jobs
topology
generated
systems
experiences
```

Implement:

- the small cell declaration algebra,
- topology compiler,
- static HTTP catalog,
- static job catalog,
- typed client generation,
- architecture map,
- simplified dependency validator.

The existing API and Worker remain operational.

### Phase 3: Migrate `production.advance.stage`

This should be the first real slice because it exercises nearly every difficult boundary:

- operator UI
- authentication
- location authorization,
- contract validation,
- early-start and completion confirmation,
- optimistic concurrency,
- transactional state mutation,
- machine and lifecycle invariants,
- live invalidation,
- observability.

Its current implementation already includes route, controller, mapper, policies, repository, and roughly 25 KB use case, making it a reprensentative, not ceremonial, test of architecture.

Keep the existing endpoints exactly the same.

### Phase 4: Move Production and Processor Together

After `advance-stage` succeeds:

1. Production commands
2. Production queries
3. scheduling
4. live change feed
5. Processor experience features
6. generated Processor client

This removes the largest and most operationally important cluster.

### Phase 5: Move Asynchronous Flows

Move:

- webhook processing into `systems/ingress`,
- canonical candidate creation into `systems/orders`,
- fulfillment-demand projection into `systems/production`,
- generic leases, retries, and dead-letter execution into `hosts/jobs`.

Retain the existing PostgreSQL inbox/outbox tables and semantics during the move.

### Phase 6: Move Remaining Systems

Recommended order:

```txt
orders
customers
access
control experience
pricing
customer experience
CLI
```

### Phase 7: Decentralize Contracts and Schemas

During migration, compatibility exports may temporarily point from

```txt
@pressly/contracts/production
@pressly/db/schema/production
```

to the new system owned declarations.

Once all consumer move:

- delete central domain contracts;
- delete central domain schemas;
- leave only platform codecs and PostgreSQL runtime machinery.

### Phase 8: Delete the Legacy Architecture

Remove:

```txt
apps/api/src/http/<domain>
apps/worker/src/jobs/<domain>

modules/business
modules/security
modules/integration
modules/experience

packages/contracts as a source authority
packages/db/src/schema as a source authority

module.architecture.ts
module main.ts/public.ts pairs
most of the role/suffix architecture compiler
```

## Replacing the Custom Architecture Compiler

I would **delete the custom architecture compiler** and replace it primarily with **`dependency-cruiser`**, with **`eslint-plugin-boundaries`** providing immediate editor-level feedback.

The current repository is maintaining a substantial custom architecture implementation—compiler, source graph, discovery, ESLint plugin, repository definitions, etc.—and the root ESLint config directly imports that custom machinery.

### 1. Use `dependency-cruiser` as the architecture authority

`dependency-cruiser` is a mature TypeScript-aware dependency analyzer that supports declarative `forbidden`, `allowed`, and `required` dependency rules, circular-dependency detection, package dependency validation, and dependency graph output. Its current npm release is 18.2.0. ([GitHub][1])

Install:

```bash
pnpm add -D dependency-cruiser
```

Replace:

```text
tooling/architecture/
  architecture-compiler.ts
  architecture-source-graph.ts
  architecture-discovery.ts
  architecture-check.ts
  architecture-eslint.plugin.ts
  architecture-definition.factory.ts
  pressly-module-architecture.ts
  pressly-repository.architecture.ts

modules/**/module.architecture.ts
```

with roughly:

```text
dependency-cruiser.config.mjs
```

The configuration should enforce only the important architectural laws:

```js
export default {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },

    {
      name: 'hosts-are-domain-free',
      severity: 'error',
      from: { path: '^hosts/' },
      to: { path: '^(systems|experiences)/' },
    },

    {
      name: 'platform-has-no-business-knowledge',
      severity: 'error',
      from: { path: '^platform/' },
      to: { path: '^(systems|experiences|hosts|topology)/' },
    },

    {
      name: 'systems-do-not-depend-on-experiences-or-hosts',
      severity: 'error',
      from: { path: '^systems/' },
      to: { path: '^(experiences|hosts)/' },
    },

    {
      name: 'production-code-does-not-import-tests',
      severity: 'error',
      from: {
        pathNot: '\\.(spec|test)\\.[jt]sx?$',
      },
      to: {
        path: '\\.(spec|test)\\.[jt]sx?$|/test/',
      },
    },
  ],

  options: {
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
```

Then:

```json
{
  "scripts": {
    "architecture:check": "depcruise --config dependency-cruiser.config.mjs systems experiences hosts platform topology generated"
  }
}
```

Dependency-cruiser should also generate the architecture graph when useful rather than Pressly maintaining its own source-graph implementation. ([npm][2])

---

### 2. Use ESLint for local architectural feedback

Use `eslint-plugin-boundaries` for rules developers should see immediately while editing. It supports custom architectural element classification and dependency policies for TypeScript/monorepo structures. ([npm][3])

Install:

```bash
pnpm add -D eslint-plugin-boundaries
```

The current `eslint.config.mjs` should lose:

```js
import path from 'node:path';

import { makeArchitectureEslintPlugin } from './tooling/architecture/architecture-eslint.plugin.ts';

import { presslyRepositoryRoot } from './tooling/architecture/architecture-discovery.ts';

import { presslyModuleArchitecture } from './tooling/architecture/pressly-module-architecture.ts';
```

and all locally implemented architecture rules such as:

```text
module-isolation
explicit-package-boundaries
web-zone-imports
feature/foundation placement rules
custom architecture role rules
```

The root ESLint configuration becomes substantially smaller:

```js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],

    plugins: {
      boundaries,
    },

    settings: {
      'boundaries/elements': [
        {
          type: 'host',
          pattern: 'hosts/*/**',
        },
        {
          type: 'system',
          pattern: 'systems/*/**',
          capture: ['system'],
        },
        {
          type: 'experience',
          pattern: 'experiences/*/**',
          capture: ['experience'],
        },
        {
          type: 'platform',
          pattern: 'platform/*/**',
        },
        {
          type: 'topology',
          pattern: 'topology/**',
        },
        {
          type: 'generated',
          pattern: 'generated/**',
        },
      ],
    },

    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',

          policies: [
            {
              from: { element: { type: 'host' } },
              allow: {
                element: {
                  type: ['platform', 'generated'],
                },
              },
            },

            {
              from: { element: { type: 'platform' } },
              allow: {
                element: {
                  type: 'platform',
                },
              },
            },

            {
              from: { element: { type: 'system' } },
              allow: {
                element: {
                  type: ['system', 'platform'],
                },
              },
            },

            {
              from: { element: { type: 'experience' } },
              allow: {
                element: {
                  type: ['experience', 'system', 'platform'],
                },
              },
            },
          ],
        },
      ],

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      ...reactHooks.configs.flat.recommended.rules,
    },
  },

  prettier,
];
```

The exact boundary selectors can be tightened during implementation, especially to enforce **same-system access but prohibit peer-system internals**. The plugin now supports fairly rich element/file/module classification, so Pressly should configure it rather than recreate that machinery. ([GitHub][4])

---

### 3. Divide responsibilities cleanly

Use:

```text
TypeScript
    type correctness

ESLint
    code quality
    purity-oriented restrictions
    immediate import-boundary feedback

dependency-cruiser
    repository dependency graph
    cycles
    architectural direction
    illegal cross-boundary dependencies

Vitest
    cell manifest uniqueness
    route collisions
    event ID/version uniqueness
    behavioral invariants

Prettier
    formatting
```

Things such as:

```text
unique operation IDs
unique HTTP method + path
unique event type + version
valid cell declarations
```

do **not** justify another architecture compiler.

They can be ordinary tests over the declarative topology:

```ts
expect(findDuplicateOperationIds(topology)).toEqual([]);
expect(findRouteCollisions(topology)).toEqual([]);
expect(findDuplicateEventVersions(topology)).toEqual([]);
```

That leaves Pressly maintaining **architecture policy**, which is unavoidable, rather than maintaining **an architecture analysis engine**.

### Target result

Today:

```text
Pressly architecture rules
        +
Pressly dependency parser
        +
Pressly graph builder
        +
Pressly architecture compiler
        +
Pressly ESLint plugin
```

Target:

```text
Pressly architecture rules
        ↓
dependency-cruiser
        +
eslint-plugin-boundaries
        +
small topology tests
```

I would choose this over introducing Nx solely for architecture enforcement. Nx has strong tag-based module-boundary enforcement, but Pressly already uses pnpm + Turbo; adopting another workspace/build abstraction just to eliminate this compiler would introduce more infrastructure than it removes. Nx's module-boundary system is primarily designed around Nx projects and tags. ([Nx][5])

The goal should be for `tooling/architecture` to disappear almost completely.

## Don't Do

```txt
No microservices. Pressly does not need network calls between Orders and Production today.
No Kafka. PostgreSQL outbox/inbox is sufficient for the present scale and reliability needs.
No event sourcing. Immutable domain events do not require reconstructing all state from an event log.
No package per feature. That would replace directory traversal with package-management overhead.
No dependency-injection container. Plain constructors and functions are clearer.
No framework in systems. No Express, React, Node process APIs, or vendor SDKs.
No generic shared, common, utils, or services directories.
No automatic runtime discovery. Generate static catalogs at build time.
No cross-system database access.
No collapse of Orders truth into Production truth.
No business behavior generated from metadata. Generate catalogs, maps, and clients only.
```

## Final Architecture Judgement

The current architecture's principles are mostly correct:

- pure decisions,
- explicit effects,
- typed expected failures,
- strong transaction boundaries,
- idempotency,
- outbox/inbox,
- source-neutral Production
- operator confirmed floor truth

The mistake is largely physical organization and excessive architectural grammar, not the underlying correctness model.

The replacement should be:

```txt
radically vertical in code ownership
strictly separated at system state boundaries
generic at runtime-host boundaries
event-driven across consistency boundaries
incrementally migrated without behavioral change
```

The first concrete slice should be:

```txt
platform/cells
topology/pressly.ts
hosts/http
systems/production/cells/floor/advance-stage
experiences/processor/features/floor/advance-stage
```

served through the existing Production endpoint with unchanged contracts and database semantics. That one slice will prove whether the architecture is genuinely easier to traverse while surviving Pressly’s real authorization, concurrency, transaction, UI, and operational requirements.
