# Integration Testing

## 1. What Changed

Integration testing checks that multiple real parts work together.

In the current pricing implementation, integration tests run the real pricing
repositories against a real PostgreSQL test database.

They do not use fake ports for the database path.

They verify:

- pricing catalog reads
- location-specific pricing reads
- global fallback reads
- missing pricing errors
- inactive, expired, and future pricing exclusion
- pricing publish writes
- audit event writes
- stale publish rejection

## 2. Where

Test entrypoint:

```bash
pnpm test:pricing:int
```

Root scripts:

- `package.json`
  - `docker:test-db:up`
  - `db:test:migrate`
  - `test:pricing:int`

Docker service:

- `docker-compose.yml`
  - `postgres-test`
  - database: `pressly_test`
  - default host port: `55434`

Pricing module scripts:

- `modules/pricing/package.json`
  - `test:integration`
  - runs `test/adapters/*.repo.int.test.ts`

Integration tests:

- `modules/pricing/test/adapters/load-pricing-catalog.repo.int.test.ts`
- `modules/pricing/test/adapters/pricing-change.repo.int.test.ts`

Test database wrapper:

- `modules/pricing/test/support/database.ts`

Shared test helpers:

- `packages/testkit/src/database.ts`
- `packages/testkit/src/result.ts`

Pricing fixtures:

- `modules/pricing/test/support/pricing-fixtures.ts`

## 3. Why

The repository tests cover behavior that depends on real database state.

The inspected tests insert pricing services, locations, sets, and items.

Then they call the real repository functions and assert returned data or written
database rows.

Examples:

- catalog loading asserts item order and current pricing output
- location pricing asserts scoped price selection
- fallback pricing asserts global prices for a known location without a scoped set
- publish pricing asserts old set archival, new set creation, copied item rows, and audit event rows

## 4. Effect

Engineers can test pricing persistence without touching the local development
database.

The flow is:

1. Start the test PostgreSQL container.
2. Run database migrations against `pressly_test`.
3. Run pricing repository integration tests.
4. Reset pricing tables between tests.
5. Close the database connection after the test file finishes.

The safety checks are:

- test helpers only run in a test runtime
- the database name must include `test`
- table names must match a safe identifier format
- pricing tests truncate only pricing tables

Use this when changing SQL queries, repository behavior, migrations, or pricing
publish persistence.
