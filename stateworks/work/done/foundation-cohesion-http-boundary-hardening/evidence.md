# Evidence

## Work

- Work ID: `foundation-cohesion-http-boundary-hardening`
- Started: 2026-08-05
- Branch: `agent/module-architecture-refactor`
- Starting worktree: three user-owned MFA signature-cleanup edits and the
  untracked `docs/lectures/repo-traversing.md`.

## T0 - Baseline

### Foundation ownership

The architecture compiler validates declared feature-to-foundation edges,
foundation dependency cycles, legal roles, and filesystem placement. It does
not validate whether a foundation has more than one semantic consumer.

MFA is the clearest diagonal consumer matrix: its eight persistence operations
are divided among five feature leaves and no operation is used by two leaves.
The broad repository also fabricates a completed-session-shaped value during
enrollment confirmation only to reduce it to a boolean, proving that the
umbrella abstraction is distorting application meaning.

The same table-oriented pattern exists in Identity workforce stores, Webhook
Ingestion stores, the publish-only half of Pricing persistence, and several
Control and Processor capability facades. Conversely, shared idempotency,
locking, transition, audit, and continuity-bearing language remain valid
foundations when multiple leaves require the exact same semantics.

The placement rule is based on the consuming feature set `C(operation)`:

```text
|C(operation)| = 1
  -> feature-local port and implementation

|C(operation)| >= 2 and exact semantics are shared
  -> narrow foundation candidate

same storage table but different application intent
  -> separate feature-owned implementations

one atomic application transition
  -> keep the transaction together in its owning feature repository
```

### HTTP boundary

The baseline has 56 `catchAsync` invocations, 54
`defineRequestBoundary` definitions, and 45 legacy `validateRequest` call
sites. Express 5 already observes returned handler promises and forwards
rejections, so `catchAsync` is obsolete compatibility code rather than an
application algebra.

The request boundary itself is earned: it parses unknown values once, carries
typed input across authentication and authorization middleware, fingerprints
the parsed input, and fails closed when intervening middleware mutates it. The
target construction owns parsing and handling together while preserving those
properties.

One finite Promise reaction cannot create microtask starvation. The relevant
performance costs are unnecessary asynchronous Zod parsing and the bounded,
synchronous fingerprint traversal. This work removes the former and retains
the latter until measurement justifies another design.

## T1 - Foundation cohesion compiler

Architecture definitions carry an explicit `reuse | continuity` basis. The
compiler observes source imports, derives immutable sorted direct and
transitive consumer sets, and treats manifest consumer edges as exact
allowlists rather than unverified declarations. It rejects unearned
foundations, invalid continuity declarations, multiple port files in one port
foundation, dependency cycles, and adapter ownership that does not match the
source graph.

An adapter `implements` edge now requires direct AST proof from a type-only
port import used in a variable or property annotation, an implemented function
parameter or return, a class `implements` clause, or `satisfies`. A bare import,
type-alias indirection, or `as` assertion is not proof. An unproven edge cannot
earn adapter reuse or contribute a semantic adapter-to-port edge to transitive
cohesion.

Architecture ESLint permits exactly one exported runtime constructor in each
`*.usecase.ts` file and rejects exported multi-callable operation facades. The
deterministic report is exposed through `pnpm architecture:cohesion`.

Final proof:

- `pnpm architecture:check`: passed with all eight live `implements` edges
  observed from real type conformance.
- `pnpm architecture:cohesion`: 107 foundations, all `earned-reuse`.
- `pnpm lint:architecture`: passed.
- `pnpm typecheck:architecture`: passed.
- `VITEST_MAX_WORKERS=2 pnpm exec vitest run tooling/test`: 18 files and 222
  tests passed, including positive and negative conformance fixtures.

## T2 - Canonical HTTP boundary

`catchAsync`, `AsyncRequestHandler`, `validateRequest`, and
`defineRequestBoundary` were removed from live Apps, Modules, and Packages.
`defineValidatedController` now owns synchronous parsing and the paired
controller. It exposes the ordinary `validate -> handle` pair and typed
per-location validators for staged scope authorization. Every configured
location must be validated exactly once.

A private request-keyed record carries the parsed values. A deterministic
fingerprint detects replacement or nested mutation before handling and fails
closed; it does not claim that Express request values are physically
immutable. Request schemas must evaluate synchronously and purely. A throwing
or asynchronous schema is normalized to
`request_schema_evaluation_failed`. Declarative per-location
`invalidRequest` descriptors preserve established response codes and safe
messages without restoring route-local parser helpers.

Mutation routes that authorize route scope before inspecting command bodies
now use this order:

```text
authenticate
  -> validators.params
  -> authorize
  -> validators.body
  -> handle
```

Canonical Orders tests prove malformed unauthorized bodies remain `403`.
Control workforce tests prove malformed resource identifiers retain their
existing `422` contract. Controllers return their promises directly to
Express 5, and the final API middleware remains the one unexpected-error
observer. Executable Stateworks tooling constructs pre-install throwables
through the package-owned tooling error factory.

Final proof:

- HTTP package: build, lint, typecheck, and 6 files / 64 tests passed.
- API package: 31 files / 208 unit tests passed.
- API request-boundary suite: 11 tests passed, including real Express 5
  synchronous throw, asynchronous rejection, validation rejection, and
  single-observer behavior.
- Canonical command and proposal route suites: 16 tests passed, including
  authorization-before-body precedence.
- Live legacy request/error-wrapper references: zero.

## T3 - Identity feature ownership

The broad MFA, session, invitation, membership, access, and workforce-security
stores were removed. Each application leaf owns its port and repository.
Narrow reused database primitives retain explicit owners for actor and member
reads, locking, receipts, audit, transitions, locations, roles, and pure
persistence translation. Enrollment confirmation no longer fabricates a
completed-session result shape.

The three pre-existing MFA edits were preserved and composed into the canonical
boundary form:

- `begin-mfa-enrollment.route.ts`
- `begin-mfa-enrollment.usecase.ts`
- `complete-mfa-challenge.usecase.ts`

Final proof:

- Identity build, lint, source typecheck, and test typecheck passed.
- Identity unit suite: 41 files / 148 tests passed.
- Identity PostgreSQL suite: 7 files / 37 tests passed with one worker.
- Integration coverage proves invitation issue/replay/rollback, membership
  suspension with atomic session and ledger writes, access grant/revoke with
  atomic session reduction, and selected session revoke/replay.
- Repository architecture checks reported no Identity cohesion violation.

## T4 - Remaining module ownership

The remaining table- and facade-shaped ownership was split by application
verb and semantic authority:

- Pricing retains the genuinely reused current-price reader while plan and
  publish persistence lives in the owning leaves.
- Users has independent `list-users` and `get-user` leaves.
- Orders has independent list/get queries, complete/cancel lifecycle commands,
  and release/withdraw fulfillment commands.
- Production has independent preview/commit backlog leaves and create/update
  shift leaves.
- Webhook Ingestion owns binding, inbox, dead-event, retry, and quarantine
  persistence in the consuming leaves.
- Control replaces manage facades with verb-object leaves and narrow ports.
- Processor replaces broad identity/effect facades with independent query
  leaves while retaining only proven shared operational identity language.

Composition connects sibling capabilities through narrow ports; feature leaves
do not import siblings. Explicit `main.ts` and `public.ts` surfaces replace
compatibility re-exports. All 130 `*.usecase.ts` files occupy 130 distinct
feature leaves and expose exactly one runtime declaration. Fifty-nine empty
legacy slice directories were removed after confirming they contained no
files.

Final focused proof:

- Orders: 17 files / 44 unit tests and 1 file / 16 PostgreSQL tests passed.
- Pricing: 8 files / 29 unit tests and 3 files / 7 PostgreSQL tests passed.
- Users: 4 files / 8 unit tests and 1 file / 6 PostgreSQL tests passed.
- Webhook Ingestion: 9 files / 16 unit tests and 4 files / 8 PostgreSQL tests
  passed.
- Production: 89 files / 423 unit tests and 16 files / 35 PostgreSQL tests
  passed.
- Control Experience: 5 files / 12 tests passed.
- Processor Experience: 4 files / 7 tests passed.

## T5 - Durable rules

The consumer-set placement rule, continuity exception, exact manifest
allowlist, real adapter-to-port conformance, one-use-case-per-leaf rule,
serialized-contract boundary, throwable ownership, canonical HTTP algebra, and
bounded concurrency are documented in:

- `docs/architecture.md`
- `docs/module-architecture.md`
- `docs/security/application-controls.md`
- `docs/plan/lpms-state-transitions.md`
- `AGENTS.md`

`package.json` exposes the deterministic `architecture:cohesion` report.
Checked-in Turbo entrypoints use `--concurrency=2`, unit tests set
`VITEST_MAX_WORKERS=2`, and database integration remains single-worker.

The user-owned `docs/lectures/repo-traversing.md` remained untouched.

## V1 - Repository verification

The final verification sequence ran serially from a clean generated-output
state:

- `pnpm clean`: 26/26 clean tasks passed.
- `pnpm build`: 28/28 build tasks passed after the final repair.
- `pnpm format:check`: passed.
- `pnpm lint`: 28/28 workspace lint tasks plus browser and architecture lint
  passed.
- `pnpm typecheck`: 50/50 workspace tasks plus browser and architecture
  typecheck passed.
- `pnpm test`: 51/51 workspace tasks passed; the tooling suite passed 222/222.
- `pnpm test:int`: DB 88, Identity 37, Users 6, Orders 16, Pricing 7, Webhook
  Ingestion 8, Production 35, and API 1 integration tests passed.
- `pnpm test:lpms:e2e`: 55 API tests and the 275-test Processor dependency path
  passed.
- `pnpm test:browser:smoke`: 9/9 Chromium production-image journeys passed.
- `pnpm stateworks:validate` on the completed network: valid, 7 tasks.
- `pnpm stateworks:verify` with the completed state: done, no stop reasons,
  zero next-ready tasks.
- `git diff --check`: passed.

Structural audits found:

- zero live package-root imports from Contracts, DB, or Errors;
- zero native throwable construction in live source outside Errors;
- zero live legacy HTTP wrapper or validator references;
- zero obsolete source references or unresolved relative imports;
- zero empty non-generated module directories after cleanup.

The reported `grep -RnlF` command was read-only. It exposed a stale ignored
Production declaration rather than changing the repository. A package clean
removed it, and the exact symbol remains absent after a fresh Production build.
