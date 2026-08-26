# Test guide

Test at the boundary that owns the behavior. Keep one test responsible for one
claim and use the smallest realistic dependency boundary.

## Test layers

| Layer       | Enter through                               | Proves                                                |
| ----------- | ------------------------------------------- | ----------------------------------------------------- |
| decision    | pure `decide.ts` function                   | state transitions, policies, deterministic plans      |
| executor    | `execute.ts` with typed fakes               | effect order, no-op/replay behavior, atomic intent    |
| contract    | owner decoder/encoder                       | serialized wire shape and expected failures           |
| PostgreSQL  | owner adapter and real database             | SQL, locks, versions, transactions, outbox/inbox      |
| Experience  | Experience assembly and public capabilities | cross-system workflow and presentation state          |
| host        | generic host with a synthetic catalog       | protocol/process lifecycle and framework effects      |
| topology    | direct topology catalogs and compositions   | selection, identity, route/job/browser binding        |
| flow        | real owner assemblies and database          | cross-owner delivery, replay, rollback, redelivery    |
| browser E2E | local Compose stack                         | cookies, navigation, accessibility, critical journeys |

Do not duplicate a pure policy in a host test. Do not use a mocked database to
claim PostgreSQL semantics. A passing unit test is not runtime equivalence.

## Operation-local proof

A cell owns one independently observable operation:

```text
systems/production/src/cells/floor/advance-stage/
  contract.ts
  decide.ts
  execute.ts
  postgres.ts
  http.ts
  *.spec.ts
```

Operation tests stay beside the operation. Test its contract, expected
rejections, pure decision branches, effect order, replay/idempotency, and
persistence semantics as applicable.

Use literal operation IDs in tests:

```ts
proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'same key commits once',
      proves: ['postgres-commit', 'same-key-concurrency'],
      run: proveSameKeyConcurrency,
    },
  ],
});
```

Cross-owner tests never substitute for missing operation-local proof.

## Fakes and fixtures

Fake the nearest dependency outside the unit. A fake implements the production
type, records calls, and returns configured outcomes. It does not recreate
business policy or SQL.

Use:

- pure values and direct function calls for decisions;
- injected capabilities, clocks, IDs, and repositories for executors;
- real PostgreSQL for schema, locking, transactions, and durable messaging;
- synthetic catalogs for generic host tests;
- minimal synthetic identities, orders, locations, and batches.

Do not put credentials, customer payloads, or deployed database URLs in tests.
Use integer cents and explicit UTC instants.

## HTTP and jobs

HTTP tests should prove the declared route, validation locations, authorization
order, response envelope, and failure translation. If route scope is needed
before body parsing, the expected order is:

```text
params -> authorization -> body -> handler
```

Jobs tests should prove claim/lease behavior, retry and dead-letter handling,
heartbeat semantics, cancellation, and shutdown. Run database integration with
one worker.

The generic host receives a catalog from `topology/http.ts` or
`topology/jobs.ts`. It must not import a System or select business operations
itself.

## Topology tests

`verification/topology/topology.test.ts` checks direct topology invariants:

- unique selected owner and operation IDs;
- route identity uniqueness;
- browser descriptor identity uniqueness;
- finite observability catalog resolution.

The topology tests do not parse source files, scan export names, compile a
second architecture language, or compare generated artifacts.

Owner and host tests remain the right place for detailed behavior. Keep
topology tests small enough that a reviewer can understand the composition in
one sitting.

## Cross-owner verification

Use `verification/*` when a claim spans owners:

- Orders outbox to Production demand;
- Ingress claim, processing, redelivery, and dead letters;
- Customers and Orders capability conformance;
- Production scheduling and floor flows;
- contract and schema ownership;
- restored migration and release proof.

Import only public owner contracts/capabilities, topology schema segments, and
test mechanisms. Do not create a shared implementation bucket.

## Running gates

Fast architecture:

```bash
pnpm architecture:check
pnpm lint:architecture
pnpm test:topology
```

Type and package checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Behavioral checks:

```bash
pnpm test:cells
pnpm test:systems:int
pnpm test:conformance
pnpm test:browser:smoke
```

Database integration must have the required service available. An unavailable
or skipped database is not a passing integration proof.

Every checked-in Turbo entrypoint uses `--concurrency=2`. Unit tests use
`VITEST_MAX_WORKERS=2); database integration remains single-worker.

## Review checklist

- Does the test live beside the behavior it owns?
- Are decisions pure and executors explicit about effects?
- Are expected failures typed and unexpected failures owned?
- Does a persistence claim use real PostgreSQL?
- Does topology test direct arrays rather than generated snapshots?
- Are browser and flow tests reserved for assembled behavior?
- Are fixtures minimal, synthetic, and secret-free?
- Is a skipped external service visible as a failed gate?
