# Code Quality, Separation, and Behavioral Equivalence During the Refactor

The architecture refactor should change **where behavior lives and how dependencies are expressed**, not what Pressly does.

For every migrated operation, the governing rule is:

```text
same valid inputs
+ same authoritative starting state
+ same clock and identifier sources
= same business outcome
+ same durable state transition
+ same emitted messages
+ same externally visible protocol behavior
```

Internal implementation details may change completely. Business semantics, concurrency behavior, authorization, idempotency, and protocol contracts may not change unless that change is separately specified and reviewed.

---

## 1. Define behavioral equivalence precisely

“Functionality is the same” should not mean only that the endpoint returns the same status code.

For a command, the observable result is:

```ts
type CommandObservation = Readonly<{
  outcome: unknown;
  stateDelta: unknown;
  outboxMessages: readonly unknown[];
  auditEvents: readonly unknown[];
  idempotencyReceipt: unknown | null;
  protocol?: Readonly<{
    status: number;
    body: unknown;
    headers: Readonly<Record<string, string>>;
    cookies: readonly string[];
  }>;
}>;
```

A migrated command is equivalent when the old and new implementations produce the same relevant observation from the same scenario.

The comparison should include:

- accepted and rejected input cases;
- expected failure code and failure data;
- entity state and version changes;
- rows created, updated, deactivated, or retained;
- idempotency receipts and replay behavior;
- outbox messages and their versions;
- audit or work events;
- authorization decisions;
- HTTP status, response body, headers, and cookies;
- concurrency outcomes;
- transaction rollback behavior.

The following may change without violating equivalence:

- file organization;
- private function and type names;
- SQL query structure, provided locking and consistency remain equivalent;
- internal intermediate models;
- private log wording;
- whether a pure calculation is split across one or several files.

Do not broadly normalize away timestamps or identifiers in equivalence tests. Inject the same deterministic `Clock` and `IdSource` into both implementations so they can be compared exactly.

---

## 2. The cell should be the code-quality boundary

Each cell should contain all operation-specific code and nothing unrelated:

```text
systems/production/
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

        decide.spec.ts
        execute.spec.ts
        contract.spec.ts
```

### File responsibilities

| File          | Responsibility                                                      |
| ------------- | ------------------------------------------------------------------- |
| `contract.ts` | Serialized command, query, result, and expected failure contracts   |
| `decide.ts`   | Pure business decision from complete facts                          |
| `execute.ts`  | Effectful orchestration: load, decide, commit, emit                 |
| `postgres.ts` | SQL, locking, persistence mapping, and transactional implementation |
| `http.ts`     | Framework-neutral endpoint declaration and protocol mapping         |
| `events.ts`   | Messages produced by this operation                                 |
| `cell.ts`     | Stable operation ID and declarative assembly                        |
| `*.spec.ts`   | Tests owned by this operation                                       |

Not every cell requires every file. A pure query may need only `contract.ts`, `execute.ts`, and `cell.ts`. A calculation may need only `decide.ts` and its specification.

Files should be split by **semantic responsibility**, not by arbitrary line counts. The current Production `advance-stage` operation has a roughly 25 KB use case plus separate route, controller, repository, mapper, and confirmation policies. The new structure should separate the pure transition decisions from the transactional protocol, rather than mechanically dividing the use case into smaller “services.”

### One operation, one obvious path

A developer following `production.advance-stage.v1` should not have to leave the cell to understand:

1. what the operation accepts;
2. what facts it loads;
3. what decision it makes;
4. what it commits;
5. what it emits;
6. how it is exposed;
7. how it is tested.

Shared domain concepts such as `ProductionBatch`, `StageRun`, or the canonical lifecycle graph may remain under:

```text
systems/production/model/
```

A concept should move there only when it has stable domain identity or is genuinely used by multiple cells. Similar-looking code should remain local when the meanings differ.

---

## 3. Functional and declarative code standard

### Pure decisions receive complete facts

A decision function must not load data or consult ambient state:

```ts
export const decideAdvanceStage = (
  facts: AdvanceStageFacts,
  command: AdvanceStageCommand,
): AdvanceStageDecision => {
  // No database, clock, random source, process state, logging, or network.
};
```

The input should contain everything needed to decide:

```ts
type AdvanceStageFacts = Readonly<{
  stage: StageRun;
  batch: ProductionBatch;
  previousStages: readonly StageRun[];
  activeStageOfSameKind: StageRun | null;
  machineAssignments: readonly MachineAssignment[];
  now: Date;
}>;
```

Time remains an effect at the outer shell. `execute.ts` reads the clock and passes `now` into the pure decision.

### Decisions return plans, not effects

Prefer:

```ts
type AdvanceStageDecision =
  | Readonly<{
      kind: 'commit';
      mutation: AdvanceStageMutation;
      events: readonly ProductionEvent[];
    }>
  | Readonly<{
      kind: 'reject';
      failure: AdvanceStageFailure;
    }>;
```

Avoid a decision function that calls repositories, sends observations, or mutates externally owned objects.

This makes the policy:

- deterministic;
- exhaustively testable;
- reusable from HTTP, jobs, CLI, or future transports;
- independent of PostgreSQL and Express;
- easy to compare against the legacy behavior.

### Expected failures remain data

Expected application failures should remain discriminated unions:

```ts
type AdvanceStageFailure =
  | Readonly<{ kind: 'stage_not_found' }>
  | Readonly<{ kind: 'version_conflict'; currentVersion: number }>
  | Readonly<{ kind: 'invalid_transition'; currentState: StageState }>
  | Readonly<{ kind: 'confirmation_required'; reason: ConfirmationReason }>;
```

They should not contain HTTP status codes or retry instructions. Those belong to the presenting host or job adapter.

Unexpected database failures, corrupt persistence, and impossible invariants may still use the repository’s standard throwable error channel.

### Effects remain explicit

Dependencies should be passed directly:

```ts
type AdvanceStageDependencies = Readonly<{
  clock: Clock;
  transaction: TransactionRunner;
  store: AdvanceStageStore;
  outbox: ProductionOutbox;
}>;
```

Avoid:

- global service containers;
- `process.env` below a host or topology;
- module-level mutable registries;
- hidden singleton database clients;
- `Date.now()` or random UUID creation inside business code;
- constructors that perform I/O;
- decorators that hide dependency acquisition.

### Immutable data by default

Use:

- `Readonly` command and fact types;
- readonly arrays;
- discriminated unions;
- exhaustive matching;
- explicit constructors for invariant-protected values;
- pure transformations.

Local mutation inside a pure algorithm remains acceptable when it is unobservable and materially clearer or faster. Functional code quality is about controlling observable effects, not banning efficient implementation.

### Avoid ambiguous APIs

Prefer:

```ts
type AdvanceStageCommand = StartStageCommand | CompleteStageCommand;
```

over:

```ts
advanceStage(stageId, true, false, undefined);
```

Prefer named data:

```ts
advanceStage({
  stageRunId,
  transition: 'complete',
  expectedVersion,
  confirmation,
});
```

over positional arguments or optional Boolean flags.

### No generic abstraction before stable repetition

Do not create:

```text
shared/
common/
utils/
services/
base-repository/
generic-command-handler/
```

A helper should remain cell-local until at least two operations use the same abstraction for the same reason.

Even then, prefer a narrowly named system concept:

```text
systems/production/model/command-idempotency/
```

or a technical platform primitive:

```text
platform/cells/idempotency/
```

rather than a general utility bucket.

---

## 4. Keep orchestration linear

`execute.ts` should read like an explicit transaction protocol:

```ts
export const makeExecuteAdvanceStage =
  (dependencies: AdvanceStageDependencies) =>
  async (
    command: AdvanceStageCommand,
  ): Promise<Result<AdvanceStageResult, AdvanceStageFailure>> => {
    const now = dependencies.clock.now();

    return dependencies.transaction(async (transaction) => {
      const replay = await dependencies.store.loadReceipt(
        transaction,
        command.idempotencyKey,
      );

      if (replay !== null) {
        return interpretReplay(replay, command);
      }

      const facts = await dependencies.store.loadFactsForUpdate(
        transaction,
        command,
      );

      const decision = decideAdvanceStage(facts, {
        ...command,
        now,
      });

      if (decision.kind === 'reject') {
        return result.err(decision.failure);
      }

      await dependencies.store.commit(transaction, decision.mutation);

      await dependencies.outbox.append(transaction, decision.events);

      await dependencies.store.saveReceipt(transaction, command, decision);

      return result.ok(toAdvanceStageResult(decision));
    });
  };
```

Business branching should primarily occur in `decide.ts`. `execute.ts` may branch around effect protocol—replay, missing data, transaction results—but should not become a second policy engine.

Persistence adapters should return authoritative facts, not partially interpreted business decisions.

---

## 5. Refactor one behavioral slice at a time

Each operation should follow the same migration sequence.

### Step 1: Characterize the existing behavior

Before moving code, create or confirm tests covering:

- successful execution;
- every expected failure;
- idempotent replay;
- idempotency-key conflict;
- optimistic version conflict;
- invalid lifecycle transition;
- transaction rollback;
- authorization denial;
- relevant concurrent attempts.

These tests describe the implementation as it exists, including behavior that may not be obvious from documentation.

### Step 2: Extract the pure decision

Identify the current business branches and express them as:

```text
facts + command -> decision
```

Initially, the legacy use case may call the new pure decision while retaining its existing repository, controller, and route. This reduces the semantic distance before changing boundaries.

### Step 3: Implement the new cell shell

Add the new:

- contract;
- executor;
- PostgreSQL adapter;
- endpoint or job declaration;
- cell manifest.

Do not activate it yet.

### Step 4: Run differential tests

Execute the legacy and new implementations independently against equivalent starting states and compare their observations.

### Step 5: Cut over one boundary

Bind the existing endpoint or job to the new cell implementation.

For writes, exactly one implementation must be authoritative. Do not dual-write to old and new paths.

Read-only queries may be shadow-executed temporarily, provided the shadow result cannot affect the response or mutate state.

### Step 6: Remove the legacy implementation

After equivalence, integration, and deployment verification pass, delete the old operation and its compatibility code.

Do not leave two long-lived architectures representing the same behavior.

---

## 6. Testing architecture

The repository already has a strong base: architecture checks, type checking, Vitest, database integration tests, browser tests, and controlled test concurrency. The refactor should preserve that toolchain while changing test ownership and purpose.

The new test structure should be:

```text
systems/
  production/
    cells/
      floor/
        advance-stage/
          decide.spec.ts
          execute.spec.ts
          contract.spec.ts

    test/
      integration/
        advance-stage.postgres.spec.ts
        production-outbox.postgres.spec.ts
      support/
        production-fixtures.ts
        production-test-runtime.ts

experiences/
  processor/
    features/
      floor/
        advance-stage/
          state.spec.ts
          feature.spec.tsx

verification/
  equivalence/
    production/
      advance-stage.equivalence.spec.ts

  flows/
    cents-order-to-production-demand.spec.ts
    production-stage-completion.spec.ts

  topology/
    http-catalog.spec.ts
    job-catalog.spec.ts
    architecture-graph.spec.ts
```

### Layer 1: Pure decision tests

These should form the majority of business-rule tests.

They test:

```text
facts + command -> decision
```

without mocks, database setup, HTTP, or process configuration.

Example:

```ts
it('requires confirmation when completing before the protected time', () => {
  const decision = decideAdvanceStage(
    stageFacts({
      state: 'started',
      actualStartedAt: instant('2026-08-17T13:00:00Z'),
      plannedEndAt: instant('2026-08-17T14:00:00Z'),
    }),
    completeCommand({
      now: instant('2026-08-17T13:30:00Z'),
      confirmation: null,
    }),
  );

  expect(decision).toEqual({
    kind: 'reject',
    failure: {
      kind: 'confirmation_required',
      reason: 'early_completion',
    },
  });
});
```

For lifecycle and scheduling code, test invariants rather than only examples:

- a batch cannot have two active stages;
- a later stage cannot start before its predecessor;
- an order is never split;
- hard capacity is never exceeded;
- the same scheduling facts produce the same proposal;
- terminal completion produces terminal state for all required records.

Targeted property-based tests may be useful for scheduling and state-transition graphs, but they should supplement named examples rather than replacing readable scenario tests.

### Layer 2: Executor tests

Executor tests verify orchestration:

- facts are loaded under the correct transaction;
- decisions are committed exactly once;
- rejected decisions do not commit;
- outbox messages are appended atomically;
- command receipts are saved;
- replay does not emit duplicate events.

Use small deterministic fakes that record calls and return explicit values. Avoid interaction-heavy mocks that merely repeat the implementation line by line.

A useful fake should model behavior:

```ts
const store = makeMemoryAdvanceStageStore({
  facts,
  receipt: null,
});
```

rather than requiring dozens of `expect(...).toHaveBeenCalledWith(...)` assertions.

### Layer 3: PostgreSQL integration tests

Use real PostgreSQL for behavior that PostgreSQL controls:

- row locks;
- unique constraints;
- transaction rollback;
- optimistic updates;
- concurrent command races;
- outbox atomicity;
- lease acquisition;
- SKIP LOCKED behavior;
- migration compatibility.

Do not mock the database for concurrency-sensitive behavior.

Every write cell should normally have integration coverage for:

1. successful commit;
2. expected rejection without partial writes;
3. unexpected failure rollback;
4. idempotent replay;
5. concurrent version or idempotency race.

### Layer 4: Contract and boundary tests

`contract.spec.ts` should test:

- accepted serialized values;
- malformed values;
- semantic validation failures;
- result serialization;
- backward-compatible boundary cases;
- event-version parsing.

The generic HTTP host should be tested once for:

- validation order;
- authentication extraction;
- authorization invocation;
- body limits;
- error presentation;
- unexpected promise rejection;
- request context and tracing.

Individual cells should test their declarative HTTP mapping, but should not each re-test all Express machinery.

### Layer 5: Differential equivalence tests

During migration, each substantial cell receives an equivalence harness:

```ts
it.each(advanceStageScenarios)('$name', async ({ initialState, command }) => {
  const legacy = await observeLegacyAdvanceStage({
    initialState,
    command,
    clock: fixedClock,
    ids: deterministicIds,
  });

  const replacement = await observeNewAdvanceStage({
    initialState,
    command,
    clock: fixedClock,
    ids: deterministicIds,
  });

  expect(replacement).toEqual(legacy);
});
```

Each implementation should run against an isolated database or isolated transaction that begins from the same fixture.

The observation should be built from canonical values:

```ts
const observe = async (): Promise<CommandObservation> => ({
  outcome,
  stateDelta: await readCanonicalProductionState(),
  outboxMessages: await readCanonicalOutbox(),
  auditEvents: await readCanonicalWorkEvents(),
  idempotencyReceipt: await readCanonicalReceipt(),
});
```

Equivalence tests are migration scaffolding. Once the legacy implementation is deleted, retain the scenario matrix as conformance tests against the new cell, but remove the legacy runner.

### Layer 6: Cross-system flow tests

Cross-system tests should verify only behavior that cannot be proven inside one system:

```text
Ingress accepts event
  -> Orders creates canonical fulfillment
  -> Orders outbox contains released demand
  -> Jobs host delivers event
  -> Production creates demand exactly once
```

These tests should assert:

- contract compatibility;
- idempotent redelivery;
- durable handoff;
- source-system isolation;
- no cross-system transaction assumption.

They should not retest every internal lifecycle branch already covered by system tests.

### Layer 7: Browser tests

For Processor and Control:

- pure feature state and reducers receive unit tests;
- generated client mapping receives contract tests;
- critical component interactions receive focused UI tests;
- only high-value workflows receive full browser tests.

Critical Processor browser coverage should include:

- login and location selection;
- loading the current board;
- starting and completing a stage;
- confirmation-required flows;
- conflict refresh behavior;
- reconnecting after a live-update interruption.

The frontend must not duplicate backend policies. It may derive presentation state, but capacity, eligibility, lifecycle, and authorization decisions remain server authoritative.

---

## 7. Concurrency and distributed-systems conformance

These tests should be treated as architecture requirements, not optional edge cases.

### Command concurrency

For each versioned write:

```text
two commands use the same expected version
  -> exactly one commits
  -> the other receives version_conflict
  -> no partial state or duplicate event exists
```

### Idempotency concurrency

```text
two concurrent commands use the same key and same payload
  -> one mutation commits
  -> both callers observe the same logical result
  -> one outbox sequence exists
```

```text
same key with different payload
  -> idempotency_conflict
  -> no second mutation occurs
```

### Outbox delivery

```text
transaction commits state and message
worker crashes before acknowledgement
message is delivered again
consumer performs an idempotent no-op
```

### Lease recovery

```text
worker claims work
heartbeat expires
another worker reclaims it
only one durable business effect exists
```

### Rollback

Inject a failure after the main state update but before outbox or receipt completion:

```text
entire transaction rolls back
```

The Worker already has reclaimable leases, bounded retries, dead-letter retention, heartbeat behavior, and idempotent downstream projection. Those semantics should remain covered while business job implementations move into cells.

---

## 8. Architecture and static-quality enforcement

The simplified architecture checker should enforce boundaries that materially improve correctness and traversal.

### Repository rules

- hosts may import only platform code and generated catalogs;
- systems may not import peer-system internals;
- systems may not query peer-system schemas;
- platform may not import systems or experiences;
- pure decision files may not import database, HTTP, filesystem, process, crypto, or observability mechanisms;
- SQL may appear only in system persistence adapters or platform PostgreSQL code;
- external `unknown` values must be parsed at their boundary;
- operation IDs must be unique;
- event type/version pairs must be unique;
- endpoint method/path pairs must be unique;
- job IDs must be unique;
- event consumers must reference declared producer contracts;
- generated catalogs and clients must match source manifests.

### TypeScript rules

Keep strict compiler settings and prohibit:

- implicit `any`;
- unreviewed `as unknown as`;
- non-null assertions in business logic;
- ignored promises;
- mutation of readonly inputs;
- non-exhaustive union handling;
- package-root imports that expose unrelated surfaces;
- cross-cell imports into another cell’s private files.

No hard global coverage percentage is necessary. A 90% number can coexist with missing concurrency or failure semantics. Completion should instead be based on operation-specific obligations.

---

## 9. CI gates during migration

Retain the repository’s current constrained concurrency—Turbo entrypoints at concurrency two and Vitest workers at two—unless the project’s resource assumptions intentionally change. That limit is already part of the repository’s operating guidance.

A refactor verification command should approximately run:

```json
{
  "scripts": {
    "verify:refactor": "pnpm architecture:check && pnpm typecheck && pnpm test:cells && pnpm test:systems:int && pnpm test:equivalence && pnpm test:flows && pnpm test:browser:smoke"
  }
}
```

Recommended gates:

```text
Every change
  architecture graph
  typecheck
  cell tests
  affected system tests

Every migrated write cell
  PostgreSQL integration
  differential equivalence
  concurrency/idempotency cases

Before merge to main
  cross-system affected flows
  generated catalog freshness

Before deployment
  browser smoke
  database migration verification
  production-topology smoke
```

Equivalence tests should be mandatory only while a legacy implementation remains. After cutover, the same scenarios become permanent conformance tests against the replacement.

---

## 10. Feature-integration ergonomics

Adding a normal feature should require one predictable path:

```text
1. Create a cell folder.
2. Define the serialized contract.
3. Define the pure decision or projection.
4. Implement the executor.
5. Add the persistence adapter when required.
6. Declare HTTP or job surfaces.
7. Register the cell with its owning system.
8. Regenerate catalogs and clients.
9. Add colocated tests.
```

A developer should not need to edit:

- API bootstrap;
- Worker bootstrap;
- a central contract barrel;
- a central DB schema barrel;
- several module manifests;
- frontend URL constants;
- separate observability registration;
- manual endpoint documentation.

The cell manifest and system registration should be sufficient for generated host catalogs, typed clients, architecture maps, and operation documentation.

---

## 11. Definition of done for a migrated cell

A migrated operation is complete when:

- the owning system and cell are obvious from its stable ID;
- its serialized contract is explicit and versioned;
- business decisions are pure and deterministic;
- effects are acquired through explicit dependencies;
- SQL is isolated in its persistence adapter;
- expected failures are typed data;
- unexpected failures use the standard error boundary;
- HTTP or job behavior is declaratively registered;
- old and new behavior pass the same scenario matrix;
- persistent state and emitted messages are equivalent;
- idempotency and concurrency behavior are verified with real PostgreSQL;
- cross-system messages remain backward compatible;
- the frontend uses the generated client;
- the architecture map resolves the complete execution path;
- the legacy implementation and compatibility code are removed.

The overall standard is:

```text
pure where behavior is decided
explicit where effects occur
colocated where a feature is understood
isolated where state is owned
versioned where systems communicate
differentially tested while behavior moves
```

This preserves the strongest correctness properties already present in Pressly while making each feature materially easier to discover, modify, test, and integrate.
