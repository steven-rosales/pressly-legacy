# Evidence

## Work

- Work ID: `module-architecture-refactor`
- Network:
  `stateworks/work/done/module-architecture-refactor/network.yaml`
- Started: `2026-08-02`
- Finished: `2026-08-02`

## T0 — Characterize module roles and contract ownership

### Observed implementation

- The repository already seals module roots, isolates peer modules, uses a
  closed role-suffix vocabulary, and declares selected foundations in
  `eslint.config.mjs`.
- The previous declaration was duplicated between ESLint and repository tests,
  allowed a stale Production `http` foundation, and did not prove that every
  declared foundation exists.
- Mapper purity had no role-specific rule. Model rules blocked obvious
  mechanisms but still allowed outward application behavior and ambient time or
  randomness.
- Pricing is the clearest vertical HTTP slice, but its policies, use cases,
  ports, and repositories depended on application types stored in
  `@pressly/contracts`; its repository serialized `Date` values before the
  protocol edge; its CLI duplicated missing response schemas.
- Data-only declarations were mislabeled as ports in Orders persistence and
  Production scheduling. The Users canonical-source transaction adapter was
  presented as a feature despite being an integration persistence mechanism.
- Large capability families remain in Auth workforce, Orders incoming proposal,
  and Production history. They require bounded follow-up migrations, not a
  repository-wide move in one patch.

### Architecture decision

- Compile one immutable module architecture definition through a generic typed
  factory and consume it from both lint and repository validation.
- Treat a capability as the default application ownership unit and a declared
  foundation as a narrow acyclic dependency shared by multiple capabilities.
- Keep known application data and `Date` values in module models. Validate and
  serialize only at HTTP, event, webhook, browser, file, or persisted-JSON
  boundaries.
- Use Ports and Adapters with a functional core and imperative shell. A port is
  required behavior, not a namespace for commands and result shapes.
- Introduce a reusable design pattern only when a typed functional factory or
  compiler captures repeated semantics. Do not add classes, registries, empty
  roles, or framework layers to satisfy a label.

### Worktree boundary

- Pre-existing changes under `apps/processor`, the deleted
  `docs/seo-skill.md`, `apps/web/public/marketing`, and
  `docs/agents/07/10/*.png` are user-owned and excluded.
- This refactor does not alter laundry-production policy or durable domain
  memory.

## T1 — Compile declarative module architecture

### Implemented

- `moduleArchitecture.define(...)` compiles an immutable definition of module
  groups, modules, roles, foundations, directed foundation dependencies, and
  serialized-contract boundary roles into pure queries.
- ESLint and the repository architecture tests now consume that single
  definition instead of maintaining parallel lists.
- Definition validation rejects invalid identifiers, duplicates, unknown
  dependencies, unknown contract-boundary roles, and foundation cycles.
- The architecture rules now distinguish capability repositories from
  foundation implementation files and keep representation mappers synchronous,
  deterministic, and mechanism-free.
- Pricing declares `controller` and `mapper` as its only roles allowed to
  import `@pressly/contracts`; this boundary is enforced for import, export, and
  dynamic-import syntax.

### Verification

- `pnpm typecheck:architecture` passed.
- `VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test/module-architecture.factory.test.mjs tooling/test/architecture-boundaries.test.mjs`
  passed in the final form: 2 files, 121 tests.
- Scoped `git diff --check` passed.

## T2 — Prove the boundary model through Pricing

### Implemented

- Pricing application commands, results, catalog data, and `Date` values now
  belong to module `*.model.ts` and `*.port.ts` files.
- Pure Pricing mappers translate module-owned values into serialized contract
  results only at the controller edge.
- `defineRequestBoundary(...)` pairs Zod validation with a typed handler,
  installs the canonical parsed values for intervening authorization, and
  fails closed if middleware replaces or mutates those values before execution.
- Request-boundary fingerprints reject cyclic, non-plain, symbol-keyed,
  accessor-backed, non-finite, and otherwise non-canonical schema output.
- `sendValidatedApiResult(...)` presents and validates success values before
  sending them and normalizes presenter or response-contract failures into the
  shared `AppError` language.
- The CLI consumes the authoritative Pricing result schemas instead of
  redeclaring them.

### Verification

- HTTP lint and typecheck passed; its 5 test files and 46 tests passed with two
  workers.
- Contracts, Pricing, and CLI lint and typecheck passed.
- Contracts passed 135 tests, Pricing passed 26 tests, and CLI passed 36 tests
  with two workers and sequential workspace execution.
- Pricing policies, ports, repositories, and use cases contain no
  `@pressly/contracts` imports; an architecture test rejects future leaks.

## T3 — Correct semantic file ownership

### Implemented

- Orders aggregate data moved from `order-aggregate.port.ts` to
  `order-aggregate.model.ts`.
- Production scheduling data moved from `production-scheduling.port.ts` and
  `online-placement.port.ts` to corresponding `*.model.ts` files.
- The canonical-source User database adapter moved from a misleading feature
  directory into the declared Users `persistence/` foundation.
- Production workspace actionability policy was separated from pure
  representation mapping, and the repository now supplies the already-derived
  due bucket to the mapper.

### Verification

- Orders, Production, Users, and API lint and typecheck passed.
- Orders passed 35 tests, Production passed 195 tests, Users passed 5 tests,
  and API passed 192 tests with two workers and sequential workspace execution.
- No stale business-module references to the renamed files remain; the
  similarly named computation scheduling port is a distinct owned port and was
  retained.

## T4 — Split oversized capability families

### Implemented

- Auth workforce behavior is now traversable as `workforce-invitations`,
  `workforce-memberships`, `workforce-access`, and `workforce-security`.
  Shared authorization and lifecycle language lives in the declared
  `workforce-domain` foundation; shared database mechanics live in
  `persistence`.
- Orders incoming-proposal behavior is split into independently invocable
  propose, close-source, list, accept, reject, and restore capabilities. The
  retained `incoming-order-proposal` foundation owns only the shared aggregate,
  exact-source identity, persistence validation, lock order, transition graph,
  and resolution replay workflow.
- Production history is split into `list-production-history-activity`,
  `list-production-history-plans`, `list-production-history-runs`, and
  `load-production-history-run`. The `production-history` foundation owns only
  shared history models, cursor construction, and persistence language.
- The central architecture declaration registers every capability and
  foundation explicitly. Repository validation now rejects missing, stray,
  misspelled, overlapping, or empty top-level module areas.

### Verification

- Auth lint, typecheck, and build passed; 27 files and 140 tests passed.
- Orders lint, typecheck, and build passed; 11 files and 40 tests passed.
- Production lint, typecheck, and build passed; 67 files and 245 tests passed.
- Affected API and Worker checks passed: API passed 29 files and 197 tests;
  Worker passed 10 files and 66 tests.
- The architecture compiler and repository boundary suites passed 2 files and
  121 tests with two workers.

## T5 — Contain contracts at real boundaries

### Implemented

- Webhook Ingestion now owns ingest, claim, recovery, dead-event, and source
  binding models. It has zero `@pressly/contracts` imports and no Contracts
  package dependency; the API, Worker, and CLI decode and map at their actual
  process boundaries.
- Auth application data has been moved inward so only controllers and pure
  mappers retain serialized contract imports.
- Pricing and Production now enforce the same module-wide boundary: only
  controllers and pure mappers may import serialized contracts. Users,
  Webhook Ingestion, Production Policy, and Scheduling Computation admit no
  contract imports. Access Control admits the Pricing HTTP guard only.
- Orders application and persistence language is module-owned. Its sole
  contract import is the `order-outbox.mapper.ts` codec at the persisted and
  cross-process JSON boundary.
- Production application commands, results, read models, and ports are
  module-owned across the complete module. API and Processor adapters consume
  those application types and serialize `Date` and readonly collections at the
  actual protocol edge.
- The Production resource bootstrap now uses module-owned immutable manifest
  and result models. The CLI explicitly maps the validated file contract into
  the application model and validates/maps the result back to its serialized
  contract.
- The due-date bucketing/filter policy moved out of persistence and into the
  declared `production-policy` foundation.
- `defineRequestBoundary(...)` carries runtime-schema proof into typed handlers,
  and `defineBoundCursor(...)` centralizes the repeated bounded-cursor pattern
  where the serialized format is compatible. The signed backlog cursor remains
  local because it has materially different integrity semantics.

### Verification

- Webhook Ingestion passed lint, typecheck, build, and 11 tests. Its affected
  API, Worker, CLI, and Contracts checks passed (197, 66, 36, and 136 tests).
- Auth, Orders, Pricing, Production, Users, Access Control, Production Policy,
  and Scheduling Computation passed their module-wide lint, typecheck, unit,
  and build gates.
- A filesystem and import audit found no business contract imports outside the
  declared controller, mapper, outbox-codec, and guard roles; no sibling
  capability imports; no self-imports through a module package export; and no
  business-module imports inside `packages/contracts`.
- One intentionally selected Production repository integration test could not
  connect to local Postgres at `127.0.0.1:55434`; the package's normal unit gate
  excludes `*.int.test.ts`. This is an environmental limit on database proof,
  not a passing integration result and not an observed behavior failure.

## V1 — Prove repository architecture and behavior

### Verification

- `pnpm test` passed all 49 Turbo tasks under
  `VITEST_MAX_WORKERS=2` and `turbo --concurrency=2`; the subsequent tooling
  run passed 14 files and 242 tests.
- `pnpm lint` passed all 27 Turbo lint tasks plus browser and architecture
  lint.
- `pnpm typecheck` passed all 48 Turbo tasks plus browser and architecture
  TypeScript checks.
- `pnpm build` passed all 27 Turbo build tasks, including API, Worker, CLI,
  Control, Processor, and the Next.js Web production build.
- `git diff --check` passed.
- Database-backed integration tests are not included in this closure claim
  because local Postgres was unavailable at `127.0.0.1:55434`.

## T6 — Close architecture evidence

### Closure

- `docs/architecture.md` now distinguishes capabilities, declared foundations,
  application models, ports, pure mappers, and serialized boundary contracts.
- Reusable patterns are introduced only through typed functional factories or
  compilers when semantics repeat. No mandatory class hierarchy, pattern
  catalog, empty role files, or speculative registry was added.
- The final architecture definition, ESLint rules, and repository tests consume
  one immutable declaration rather than parallel configuration.
- No product behavior, laundry-production policy, deployment state, or durable
  domain memory was changed.
- Remaining API request casts outside the migrated Production and module HTTP
  slices are named follow-up debt; this package does not misrepresent them as
  proof-carrying request boundaries.
- Final Stateworks validation and lifecycle verification passed from the
  `stateworks/work/done/module-architecture-refactor/` package.
