# Module Test Guide

This guide defines how tests should be written for `modules/*/*`.

It does not cover `apps/*` or `packages/*` yet.

The goal is simple:

- test pure rules without IO
- test usecases through ports
- test repositories against real infrastructure
- test HTTP adapters as translation code
- keep test setup small, typed, and readable

## Three-Second Rule

When opening a test file, the reader should know these four things fast:

1. What behavior is being tested.
2. What layer owns that behavior.
3. What dependencies are real.
4. What dependencies are fake.

If a test hides those answers, rewrite it.

## Module Shape

Modules follow this shape:

```txt
modules/<group>/<name>/
  src/
    domain/
      *.policy.ts
      *.machine.ts

    features/
      <feature>/
        *.usecase.ts
        *.port.ts
        *.error.ts

    adapters/
      <feature>/
        http/
          *.controller.ts
          *.route.ts

        persistence/
          *.repo.ts

    main.ts
    public.ts

  test/
    domain/
    features/
    adapters/
    support/
    module.test.ts
```

Tests should mirror the production boundary.

If production code says `features` depends on a `port`, the test should use a
fake `port`.

If production code says `repo` owns SQL, the test should use a real database.

## Testing Map

| Layer               | File example                       | Dependency style       | What it proves                                  |
| ------------------- | ---------------------------------- | ---------------------- | ----------------------------------------------- |
| Domain              | `test/domain/*.test.ts`            | no IO                  | pure policy and state-machine rules             |
| Feature usecase     | `test/features/*.usecase.test.ts`  | fake ports             | orchestration, permissions, error flow          |
| HTTP adapter        | `test/adapters/*.http.test.ts`     | fake usecases          | request parsing and response envelopes          |
| Persistence adapter | `test/adapters/*.repo.int.test.ts` | real Postgres          | SQL, transactions, effective dates, constraints |
| Module composition  | `test/module.test.ts`              | minimal dependency box | `main.ts` exposes the intended module surface   |

Use the smallest test type that can prove the behavior.

Do not prove the same rule at every layer.

## First Principles

Test the boundary that owns the behavior.

```txt
domain owns rules.
usecases own orchestration.
repos own storage behavior.
controllers own HTTP translation.
main.ts owns composition.
```

The test should enter through that layer's public function.

The test should not reach through private implementation detail unless the
implementation detail is the unit being tested.

## What To Fake

Fake the nearest dependency outside the unit.

```txt
domain test
  calls domain function directly

usecase test
  usecase + fake port

repo test
  repo + real database

controller test
  controller + fake usecase

module test
  main composition + minimal dependency shell
```

Do not fake:

- domain functions
- Drizzle inside repo tests
- Express inside usecase tests
- repos inside repo tests
- contracts used to validate commands/results

The fake should prove what crossed the boundary.

It should not reimplement production logic.

## Support Files

Use `test/support` for helpers that make tests easier to read.

```txt
test/support/
  assertions.ts
  builders.ts
  database.ts
  fakes.ts
  <module>-fixtures.ts
```

### `builders.ts`

Builders create test data.

They should:

- return valid defaults
- accept small overrides
- create nouns, not verbs
- avoid IO
- avoid calling production behavior

Good:

```ts
export const makePublishPricingChangeCommand = (
  overrides: Partial<PublishPricingChangeCommand> = {},
): PublishPricingChangeCommand => ({
  serviceSlug: 'wash-fold',
  reason: 'Update delivery fee',
  actor: makeAdminActor(),
  items: [{ code: 'delivery_fee', priceCents: 100 }],
  ...overrides,
});
```

Bad:

```ts
export const makeUsecase = () => makePublishPricingChange(store);
export const savePricingSet = async () => repo.commitPricingChangePlan(input);
```

Rule:

```txt
builders.ts creates nouns, not verbs.
```

### `fakes.ts`

Fakes implement ports.

They should:

- satisfy the production port type
- return configurable results
- record calls
- stay dumb
- avoid domain calculations
- avoid database access

Good:

```ts
const store: PricingChangeStore = {
  loadCurrentPricingForPublish: async (command) => {
    calls.load.push(command);
    return input.loadResult ?? ok(current);
  },

  commitPricingChangePlan: async (command) => {
    calls.commit.push(command);
    return input.commitResult ?? ok(publishResult);
  },
};
```

Rule:

```txt
fakes.ts implements ports, not production adapters.
```

### `assertions.ts`

Assertions remove repetitive `Result` unwrapping.

They should:

- make happy-path tests shorter
- make error-path tests precise
- return the unwrapped value/error
- not hide behavior-specific assertions

Good:

```ts
const value = expectOk(result);

expect(value.changeItemCount).toBe(1);
```

Good:

```ts
const error = expectErrCode(result, 'pricing_change_has_no_changes');

expect(error.kind).toBe('ConflictError');
```

Rule:

```txt
assertions.ts improves readability, but must not hide behavior.
```

### `database.ts`

Database helpers are only for integration tests.

They should:

- connect to a test database only
- refuse to reset non-test databases
- expose `check`, `reset`, and `close`
- keep each integration test isolated
- avoid application-level seed logic unless the test needs it

The helper should fail loudly if the database name does not look safe.

Good safety rule:

```txt
if the database name does not include "test", do not reset it.
```

### Fixtures

Fixture files insert realistic rows for integration tests.

They should:

- live in `test/support`
- be used only by repo integration tests
- insert the smallest valid database graph
- return inserted rows when later assertions need IDs

Good:

```ts
const service = await insertPricingService(db);

await insertPricingSetWithItems(db, {
  serviceId: service.id,
  items: [{ code: 'delivery_fee', priceCents: 495 }],
});
```

Bad:

```ts
await seedEverythingForTheWholeApp(db);
```

## Domain Tests

Domain tests are pure.

They call policy or machine functions directly.

They should not import:

- repos
- usecases
- controllers
- database clients
- Express
- clocks
- loggers

Domain tests should cover:

- valid state
- invalid state
- edge cases
- duplicate input
- unknown referenced data
- no-op changes
- generated transition shape

Good domain test:

```ts
it('creates a plan when a known item price changes', () => {
  const command = makePublishPricingChangeCommand({
    items: [{ code: 'delivery_fee', priceCents: 100 }],
  });

  const result = makePricingChangePlan({
    command,
    currentSet: makeCurrentPricingSet(),
    currentItems: [makeCurrentPricingItem({ priceCents: 495 })],
  });

  expect(result).toMatchObject({
    ok: true,
    plan: {
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      oldPricingSetId: 'set_1',
      changes: [
        {
          code: 'delivery_fee',
          oldPriceCents: 495,
          newPriceCents: 100,
        },
      ],
    },
  });
});
```

Domain tests are where you should be exhaustive.

They are fast, stable, and cheap.

## Feature Usecase Tests

Usecase tests prove orchestration.

They should use fake ports.

They should not know:

- SQL
- HTTP
- Express
- Drizzle
- database row names
- UI behavior

Usecase tests should cover:

- valid command succeeds
- validation failure stops before IO
- unauthorized actor stops before write IO
- port load error is returned
- domain/policy error is mapped to `AppError`
- no-op change stops before commit
- commit error is returned
- happy path sends the expected command/plan to the port

The important assertion:

```txt
if validation fails, port calls should be empty.
```

That proves the usecase protects the IO boundary.

Good usecase test:

```ts
it('loads current pricing, creates a plan, and commits it', async () => {
  const { store, calls } = makeFakePricingChangeStore();
  const publishPricingChange = makePublishPricingChange(store, {
    now: () => new Date('2026-05-21T12:00:00.000Z'),
  });

  const result = await publishPricingChange(makePublishPricingChangeCommand());

  const value = expectOk(result);

  expect(value.changeItemCount).toBe(1);
  expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
  expect(calls.commit).toHaveLength(1);
  expect(calls.commit[0]?.publishedAt).toEqual(
    new Date('2026-05-21T12:00:00.000Z'),
  );
});
```

Usecase tests should verify behavior, not implementation order, unless the order
is part of the safety contract.

Example:

```txt
validate -> authorize -> load -> plan -> commit
```

For a write usecase, that order is part of correctness.

## Persistence Tests

Repo tests are integration tests.

They use real Postgres.

They should not fake:

- Drizzle
- transactions
- query results
- database constraints
- current rows

Repo tests prove storage behavior:

- SQL joins
- scoped lookup
- fallback policy
- strict not-found behavior
- effective-date filtering
- transaction commit
- transaction rollback
- audit-event inserts
- active vs archived records
- unique constraints and foreign keys

File naming:

```txt
test/adapters/<feature>.repo.int.test.ts
```

Repo test shape:

```ts
const testDb = createPricingTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('pricing change repo', () => {
  it('commits a new pricing set and audit event in one transaction', async () => {
    const repo = makePricingChangeStore(testDb.db);

    const result = await repo.commitPricingChangePlan(input);

    const value = expectOk(result);

    expect(value.changeItemCount).toBe(1);
  });
});
```

Do not write fake-repo tests that mirror arrays in memory.

That proves the fake, not the repo.

## HTTP Adapter Tests

HTTP adapter tests prove translation.

They should use fake usecases.

They should not use:

- database
- domain setup
- repository fixtures
- real network calls

Controller tests should verify:

- route params become command input
- request body becomes command input
- actor/context metadata becomes command input when applicable
- success results become success envelopes
- app errors become error envelopes
- status codes are set by the response helper

Good controller test shape:

```ts
it('passes the route params to the usecase', async () => {
  const calls: unknown[] = [];
  const usecase = async (command) => {
    calls.push(command);
    return ok(makeLoadPricingCatalogResult());
  };

  const controller = makeLoadPricingCatalogController(usecase);

  await controller(req, res);

  expect(calls).toEqual([
    {
      serviceSlug: 'wash-fold',
    },
  ]);
});
```

Route tests should stay smaller than controller tests.

They prove wiring:

- path exists
- validation is attached
- controller is attached
- HTTP method is correct

Do not retest all controller behavior at the route layer.

## Composition Tests

`test/module.test.ts` is a smoke test.

It should stay small.

It verifies the module exposes the expected public surface from `main.ts`.

Good:

```ts
it('exposes http routes and admin usecases', () => {
  const module = makePricingModule({ db: {} as Database });

  expect(module.routes).toBeDefined();
  expect(module.admin).toEqual({
    loadCatalog: expect.any(Function),
    planChange: expect.any(Function),
    publishChange: expect.any(Function),
  });
});
```

Composition tests should not need real infrastructure unless composition itself
creates infrastructure.

## Error Testing

Errors should be tested at the layer that creates them.

```txt
domain
  creates policy violations

feature errors
  map policy violations into AppError

usecase
  returns Result<T, AppError>

controller
  serializes AppError into HTTP shape

repo
  maps database failures or missing rows into AppError
```

Do not throw raw `Error` just to satisfy the compiler.

Use the formal error system:

- `makeAppError`
- `ok`
- `err`
- `Result<T, AppError>`
- module-specific error helpers

Good:

```ts
expectErrCode(result, 'pricing_change_has_no_changes');
```

Bad:

```ts
expect(() => fn()).toThrow('bad');
```

Use thrown assertions only when the production contract is actually `throw`.

Most module usecases should return `Result`.

## Naming Rules

Test names should describe behavior.

Good:

```txt
creates a pricing change plan from a valid command
returns a permission error when actor cannot publish pricing
does not commit when command validation fails
selects the currently effective pricing set
returns not found when no active pricing set exists
```

Weak:

```txt
works
handles errors
tests publish
calls function
```

Prefer this form:

```txt
it('<observable behavior> when <condition>')
```

Do not include implementation trivia in the name.

## Test Data Rules

Use real domain language.

Good:

```txt
delivery_fee
wash-fold
dry-cleaning
USD
fort-lee
```

Weak:

```txt
foo
bar
test
abc
```

Use override builders when one field matters:

```ts
makePublishPricingChangeCommand({
  reason: 'short',
});
```

Do not repeat full objects unless the whole object is the point of the test.

Use cents for money.

```txt
$4.95 -> 495
$1.00 -> 100
```

Do not test float money math in module logic unless the module explicitly owns
decimal parsing.

## Integration Database

Repo integration tests use a dedicated Docker Postgres service.

Start it:

```sh
pnpm docker:test-db:up
```

Apply migrations:

```sh
pnpm db:test:migrate
```

Run pricing integration tests:

```sh
pnpm test:pricing:int
```

Open a SQL shell:

```sh
pnpm docker:test-db:shell
```

Stop the test database:

```sh
pnpm docker:test-db:down
```

Rule:

```txt
unit tests should not require Docker.
repo integration tests may require Docker.
```

## Running Module Tests

Run fast tests for one module:

```sh
pnpm -F @pressly/pricing test
```

Run integration tests:

```sh
pnpm -F @pressly/pricing test:integration
```

Run the module test typecheck:

```sh
pnpm -F @pressly/pricing typecheck:test
```

Run production typecheck:

```sh
pnpm -F @pressly/pricing typecheck
```

Run lint:

```sh
pnpm -F @pressly/pricing lint
```

Run the full module gate:

```sh
pnpm -F @pressly/pricing lint
pnpm -F @pressly/pricing typecheck
pnpm -F @pressly/pricing typecheck:test
pnpm -F @pressly/pricing test
pnpm test:pricing:int
```

## Adding A New Module Test

Use this order:

1. Find the layer that owns the behavior.
2. Write the smallest test at that layer.
3. Add a builder only when repeated data starts hiding intent.
4. Add a fake only when testing a usecase through a port.
5. Add a fixture only when testing a repo against Postgres.
6. Add one unhappy path for every boundary that can reject input.
7. Add one regression test for every bug fixed.

Start with this structure:

```txt
modules/<name>/test/
  domain/
  features/
  adapters/
  support/
    assertions.ts
    builders.ts
    fakes.ts
  module.test.ts
```

Add `database.ts` and fixtures only when the module has persistence adapters.

## Coverage Guide

Coverage should come from behavior, not line count.

Minimum coverage for a module:

- every domain policy has valid and invalid tests
- every usecase has happy path and each stop condition
- every repo has one current-read test and one not-found/error test
- every write repo has a transaction/audit test if writes are transactional
- every controller has success and error-envelope tests
- `main.ts` has one composition smoke test

Do not chase 100 percent coverage by testing implementation noise.

Chase meaningful states.

## Anti-Patterns

Avoid these:

- testing private helper functions directly
- mocking Drizzle in repo tests
- importing repos into usecase tests
- importing usecases into domain tests
- using fake data names like `foo`
- asserting every property when only one property matters
- repeating the same behavior assertion at domain, usecase, controller, and repo
- making one giant integration test prove the entire module
- creating helper abstractions before the test repetition is real

If the test is hard to write, inspect the production boundary.

Hard tests often reveal unclear ports or mixed responsibilities.

## Review Checklist

Before committing module tests, ask:

- Does each test target the layer that owns the behavior?
- Are pure rules tested without IO?
- Are usecases tested through fake ports?
- Are repos tested against real infrastructure?
- Are controllers tested with fake usecases?
- Are errors asserted by `AppError.code`?
- Are builders creating data instead of behavior?
- Are fakes implementing ports instead of adapters?
- Is every test name behavior-first?
- Can a tired engineer understand the file in 30 seconds?

Default rule:

```txt
pure rules get pure tests.
orchestration gets fake ports.
IO gets real infrastructure.
HTTP gets fake usecases.
composition gets smoke tests.
```
