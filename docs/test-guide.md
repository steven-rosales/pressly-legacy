# Test Guide

Test the smallest boundary that owns the behavior. Pure rules get pure tests;
cell execution gets fake capabilities; persistence gets real PostgreSQL;
catalogs and hosts get structural proof; assembled public workflows get
integration or browser proof.

Use Vitest for repository tests. Use Playwright only for cross-application
browser behavior under `tooling/browser-e2e`.

## Three-Second Rule

A reader should quickly see:

1. the behavior under test;
2. the owner of that behavior;
3. which dependencies are real; and
4. which dependencies are controlled fakes.

If setup hides those answers, simplify the test.

## Test Placement

Tests follow production ownership.

```text
systems/<owner>/src/
  cells/<namespace>/<operation>/*.spec.ts
  cells/<namespace>/<operation>/*.postgres.int.spec.ts
  model/**/*.spec.ts
  schema/**/*.spec.ts

experiences/<experience>/src/cells/<namespace>/<operation>/*.spec.ts
experiences/<experience>/test/
hosts/<host>/test/
platform/<mechanism>/test/

verification/<scope>/
  test/                    cross-owner and real-Postgres matrices

verification/topology/
  *.test.ts                topology, contract, schema, and catalog proof

tooling/test/
  *.test.mjs               repository and release-tooling proof

tooling/browser-e2e/specs/
  *.spec.ts                disposable-stack browser proof
```

System cell specs are colocated because the cell is the unit of ownership.
Other workspaces normally mirror `src` beneath `test`. Do not create generic
`shared` test buckets; use a small owner-local `test/support` only when several
tests genuinely need the same fixture or fake.

## Proof Map

| Boundary                                   | Dependencies                          | Proves                                           |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------ |
| decision, lifecycle, projection, algorithm | none                                  | exhaustive rules and invariants                  |
| contract                                   | real decoder/encoder                  | unknown input, wire shape, version semantics     |
| executor or use case                       | fake ports/capabilities               | effect order, stop conditions, outcomes          |
| Postgres adapter                           | real PostgreSQL                       | SQL, locks, constraints, rollback, idempotency   |
| cell declaration                           | real contract and surfaces            | ID, kind, consistency, protocol metadata         |
| system assembly                            | minimal typed dependencies            | named cells, capability wiring, owner boundary   |
| Experience feature                         | fake public system capabilities       | cross-system workflow and presentation mapping   |
| generated catalog/client                   | real generated artifact               | selected owner, route/job/CLI/SSE metadata       |
| generic host                               | synthetic catalog                     | protocol execution without business branches     |
| generated runtime binding                  | real assembly with controlled effects | deployed binding and middleware/process order    |
| cross-owner verification                   | real owners and PostgreSQL            | conformance, crash, replay, rollback, parity     |
| browser E2E                                | disposable local stack                | cookies, app boundaries, a11y, critical journeys |

Do not prove the same rule at every layer. A lifecycle edge belongs in a pure
test; an HTTP test needs only enough lifecycle behavior to prove translation.

## What to Fake

Fake the nearest dependency outside the unit.

```text
decision test     -> call the pure function directly
executor test     -> executor + fake repository/capability/clock/IDs
Postgres test     -> real adapter + real database
Experience test   -> workflow + fake public system capabilities
host test         -> generic host + synthetic catalog
runtime test      -> generated binding + controlled host mechanisms
```

A fake implements the production type, records calls, and returns configured
outcomes. It does not reproduce policy or SQL.

Never mock Drizzle in a Postgres test, import a repository into a pure decision
test, or replace a producer-owned contract with a test-only schema.

## Builders, Fakes, and Fixtures

Builders create valid nouns with small overrides:

```ts
const makeCommand = (overrides: Partial<Command> = {}): Command => ({
  idempotencyKey: 'command_1',
  expectedVersion: 3,
  ...overrides,
});
```

Builders do not perform IO or construct the behavior under test.

Fakes implement capabilities and record boundary values:

```ts
const calls: Command[] = [];
const capability: Capability = async (command) => {
  calls.push(command);
  return configuredOutcome;
};
```

Database fixtures insert the smallest valid graph. Avoid global seed helpers
when the test needs only one business, location, order, or batch.

Use real domain names and units. Use integer cents for money and explicit UTC
instants. Synthetic IDs must not resemble real customer or production data.

## Pure Decision Tests

Pure tests cover all meaningful branches:

- allowed and denied state transitions;
- boundary and capacity conditions;
- duplicate and no-op input;
- deterministic ordering and hashes;
- unknown references and malformed internal facts; and
- immutable output.

They do not import repositories, hosts, database clients, clocks, loggers,
frameworks, or process state. Pass time, IDs, and facts explicitly.

Finite lifecycle graphs should enumerate every state-and-event pair, including
terminal denials.

## Contract Tests

Contract tests enter through the real owner decoder and encoder. Cover:

- valid minimal and complete values;
- malformed unknown input;
- missing, extra, and boundary values;
- discriminated expected failures;
- exact money, UTC, digest, and JSON semantics; and
- round-trip or pinned wire fixtures where compatibility matters.

Do not cast malformed fixtures into the target type. The point is to prove the
unknown boundary.

## Executor and Use-Case Tests

Executor tests prove orchestration and atomic intent through fake effects:

- validation or authorization stops before write IO;
- facts are loaded in the required order;
- the pure decision receives the exact facts;
- no-op and expected rejection skip irrelevant effects;
- commit receives the exact plan;
- replay suppresses duplicate effects; and
- result-dependent signals occur only in the owning operation.

Assert effect order only when order is part of correctness, such as
authenticate-before-body, lock-before-read, or commit-before-notify.

## PostgreSQL Tests

Use real PostgreSQL for schema and persistence semantics:

- joins and owner scope;
- owner-local foreign keys, indexes, checks, and uniqueness;
- transaction commit and rollback;
- optimistic versions and partition locks;
- command receipts, work events, and outbox atomicity;
- lease claim, expiry, retry, and dead-letter behavior; and
- concurrent writers and replay.

Database suites run with one Vitest worker and no file parallelism. Completion
proof uses an explicit unique database created from `template0`, applies the
canonical migrations, force-drops it in teardown, and reads the catalog back
to prove absence. Never point a test reset at a deployed database.

An unavailable or skipped database is not a passing integration suite.

## Topology, Catalog, and Host Tests

Topology proof covers:

- unique operation, event, route, job, CLI, and stream identities;
- legal owner selection and assembly keys;
- HTTP boundary-profile completeness and middleware ordering;
- producer-owned contract descriptors and pinned wire semantics;
- one source owner for every table and enum;
- zero cross-owner foreign keys and complete owner-local references;
- generated artifact freshness; and
- browser-client exposure limited to consumed public operations.

Host tests use synthetic catalogs so a generic host cannot accidentally depend
on a real System. Generated-runtime tests then prove the real catalog is bound
once with the required concrete providers.

Never hand-edit `generated/*` to satisfy a test. Change the owner declaration
or topology and regenerate.

## Cross-Owner Verification

Use `verification/*` when the property spans owners or must remain a permanent
compatibility matrix. Examples include:

- Orders outbox to Production demand;
- Ingress claim, processing, redelivery, and dead-letter flows;
- Customers and Orders capability conformance;
- Production command, query, and scheduling matrices;
- contract and schema ownership; and
- crash, lease, replay, rollback, and restored-migration behavior.

Cross-owner verification imports only public owner surfaces and injected
schema segments. It does not become a shared implementation package.

## Typed Operation Proof

Every selected operation registers literal, named evidence from its exact cell
directory through `@pressly/testkit/operation-proof`.

```ts
proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'same key and payload commit once',
      proves: ['postgres-commit', 'same-key-concurrency'],
      run: proveConcurrentReplay,
    },
  ],
});
```

The helper executes every registered scenario. The strict topology verifier
reads only the inline literal operation ID, layer, scenario name, and typed
claims. It rejects owner-root matrices, imported proof objects, substring
matches, import-closure credit, and cross-owner fallback.

Cross-owner and browser tests remain separate evidence. They never satisfy a
missing operation-local claim.

## Browser Tests

The browser runner owns a fresh synthetic database and unique Compose project.
It must:

- refuse remote Docker;
- bind credentialed endpoints to loopback HTTPS;
- keep temporary credentials outside the repository;
- retain diagnostics only under ignored `.artifacts/playwright/`; and
- prove teardown.

Playwright proves assembled cookies, navigation, app switching, accessibility,
and critical journeys. It does not replace cell, policy, repository, or host
tests.

## Failure Tests

Expected application failures are asserted as discriminated cell outcomes.
Unexpected failures use the Errors-owned `AppError` language and are tested at
the mechanism or process edge that creates or presents them.

Use thrown assertions only when the production contract is actually
throwable. Tests may construct a native throwable solely as an explicit fault
fixture.

## Running Tests

Fast owner tests:

```bash
pnpm --filter @pressly/production-system test
pnpm --filter @pressly/experience-processor test
pnpm --filter @pressly/http-host test
```

Architecture and topology:

```bash
pnpm architecture:check
pnpm lint:architecture
pnpm test:topology
```

Real-Postgres owner and cross-owner suites:

```bash
pnpm docker:test-db:up
pnpm test:systems:int
pnpm test:conformance
```

Workspace and browser gates:

```bash
VITEST_MAX_WORKERS=2 pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:browser:smoke
pnpm test:browser:e2e
```

Every checked-in Turbo entrypoint uses `--concurrency=2`. Unit-test entrypoints
set `VITEST_MAX_WORKERS=2`; database integration stays at one worker.

## Review Checklist

- Is the test at the boundary that owns the behavior?
- Are pure decisions free of IO?
- Are executors tested through typed fakes?
- Is persistence proved against real PostgreSQL?
- Does each selected operation execute its required typed proof locally?
- Does the test use producer-owned contracts and public owner surfaces?
- Are topology and generated freshness covered after selection changes?
- Is each test name about observable behavior?
- Are fixtures synthetic, minimal, and free of secrets or customer payloads?
- Does teardown prove temporary database and process cleanup?
- Can a tired engineer understand the test in thirty seconds?
