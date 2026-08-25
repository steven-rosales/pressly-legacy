# Pressly Cellular Architecture Refactor Evidence

## Activation and baseline

- Activated: `2026-08-21T18:35:47-04:00`.
- Baseline commit: `f0d38b7d6b8a5576f62760bd984439def4351a1e` on `main`.
- Governing plans:
  - `docs/plan/refactoring-cell.md`
  - `docs/plan/refactor-code-quality.md`
- Governing current architecture documents:
  - `docs/architecture.md`
  - `docs/module-architecture.md`
- Required context loaded:
  - `stateworks/memory/index.yaml`
  - `stateworks/memory/domains/steven-collaboration/context-pack.md`
  - `stateworks/memory/domains/laundry-production/context-pack.md`
  - current active and queued Stateworks work
- Existing user-owned dirty paths excluded from incidental edits:
  - `.gitignore`
  - `.agents/skills/refactor/`
  - `docs/agents/08/`
  - both governing plan documents
- Existing active LPMS production-readiness work remains at its live-vendor H1
  gate. Existing Control/workforce work remains incomplete. Their prior
  repository and deployment evidence is not evidence for this refactor.

## Reconciled plan decisions

1. Use `experiences/` consistently; add `topology/`; retain one ordinary
   `tooling/` directory only for executable repository tooling.
2. `systems/access` owns business-account and location scope identity alongside
   workforce access authority. Customer profiles remain in Customers.
3. Retain `platform/kernel`; use `platform/cells` only for declarative cell and
   catalog primitives.
4. Split `packages/auth`: credential mechanisms become `platform/auth`, while
   Pressly roles, capabilities, workforce membership, business scope, and
   location scope belong to Access.
5. Keep one global ordered Drizzle migration ledger and runner while moving
   schema source ownership into systems.
6. Generated catalogs are checked deterministic source. A catalog may import
   public assembled cells selected by topology; a generic host imports the
   catalog and platform mechanisms only.
7. Keep legacy and cellular architecture enforcement side by side until the
   final legacy module is removed. The custom compiler is deleted in T8, not
   when the skeleton is introduced.
8. Preserve package names and current app entrypoints until replacement hosts
   are ready, then update Docker, Compose, CI, smoke, health, and release paths
   atomically.
9. The advance-stage pilot preserves current behavior rather than literal
   illustrative values from the target plan: two existing routes,
   `production:stage`, aggregate lock ordering, current work-event receipt and
   live-revision notification, and no new outbox messages or location mutex.

## Completion matrix

| Obligation                                                            | Planned evidence owner                                | Status                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| External/protocol/distributed behavior freeze                         | T1 characterization and PostgreSQL fixtures           | V1 committed                                     |
| Cell algebra and code-quality boundary                                | T2 platform/cells tests                               | T2 committed; final technical proof complete     |
| Pure facts-to-decision functions and immutable mutation plans         | T3-T7 cell decision specifications                    | T3-T7 committed; T8 technical audit complete     |
| Explicit effect dependencies and linear transaction protocols         | T3-T7 executor specifications                         | T3-T7 committed; T8 technical audit complete     |
| Typed expected failures and standard unexpected error channel         | T3-T7 contract/executor tests and lint                | T3-T7 committed; T8 technical audit complete     |
| No generic abstraction before stable semantic repetition              | T8 source audit and architecture checks               | T8 committed                                     |
| Generic HTTP and jobs hosts                                           | T2, T5, T6 host tests and import graph                | T8 committed                                     |
| Topology, static catalogs, clients, explain map                       | T2 topology tests and freshness gate                  | 181 operations; generated/explain proof complete |
| Advance-stage full-cell definition of done                            | T3 differential, PostgreSQL, HTTP, Processor evidence | T3 committed                                     |
| Production and Processor migration                                    | T4 system/experience gates                            | T4 committed                                     |
| Ingress, Orders reaction, Worker migration                            | T5 flow, lease, replay, dead-letter gates             | T5 committed                                     |
| Remaining systems, experiences, CLI, browser and HTTP hosts           | T6 affected and five-image gates                      | T6 committed                                     |
| Contract and schema source decentralization                           | T7 compatibility, migration and ownership gates       | T7 committed; final technical proof complete     |
| Legacy architecture/compiler deletion                                 | T8 searches and final enforcement gates               | T8 committed                                     |
| Pure decision, executor, contract and boundary test layers            | T3-T7 colocated cell tests                            | T3-T7 committed; 15-point index complete         |
| Real PostgreSQL write-cell integration and rollback                   | T1 and T3-T7 one-worker integration gates             | V1 matrix 108 files / 897 tests passed           |
| Differential migration scenarios retained as conformance tests        | T3-T7 equivalence/conformance evidence                | permanent target-only conformance passed         |
| Cross-system flows without cross-system transaction assumptions       | T5-T7 flow tests                                      | T5-T7 committed; V1 restore/flow proof complete  |
| Focused Processor, Control and customer browser workflows             | T4, T6 and V1 browser gates                           | V1 smoke 10/10 and full E2E 11/11 passed         |
| Version, idempotency, outbox, lease and rollback conformance          | T1, T3, T5 and V1 distributed gates                   | V1 local distributed proof complete              |
| Static purity, schema, private-cell and uniqueness rules              | T2 and T8 enforcement tests                           | T8 committed                                     |
| Migration CI gates and constrained concurrency                        | T2 and V1 scripts/workflow audit                      | V1 local workflow/concurrency proof complete     |
| One-path feature integration ergonomics                               | T8 fixture feature and architecture-explain proof     | T8 architecture-explain proof complete           |
| Every migrated cell satisfies all 15 named definition-of-done bullets | T3-T7 per-cell evidence index                         | 2,715 outcomes; 1,998 met + 717 N/A; zero unmet  |
| Complete code-quality, concurrency and testing matrix                 | V1 full repository evidence                           | V1 committed                                     |
| Stateworks closure without external-proof overclaim                   | T9 completed report and lifecycle verification        | T9 archived; `done: yes`; no stop reasons        |

No implementation completion claim is made at activation.

## Current architecture baseline

The refactor inventory script scanned 65,156 files without truncation. The
current ownership surface contains 1,156 files under `modules/`, 900 under
`apps/`, 363 under `packages/`, 72 under `tooling/`, and 528 detected test
files. These counts are navigation evidence, not correctness proof.

The legacy enforcement baseline passed before source migration:

```text
pnpm architecture:check       passed 2026-08-21
pnpm lint:architecture        passed 2026-08-21
pnpm typecheck:architecture   passed 2026-08-21
```

The legacy gates remain required for unmigrated `modules/**` until T8.

## T0 - Reconcile authority and establish the completion matrix

Implemented transitional normative authority in:

- `docs/architecture.md`, section `2A. Transitional Cellular Authority`;
- `docs/module-architecture.md`, section `0. Transitional Placement Authority`.
- `AGENTS.md`, section `Active Cellular Migration`, with every legacy rule
  retained for unmigrated modules and target placement made explicit.

The documents distinguish legacy and target placement, define the exact target
owners and dependency direction, preserve one Drizzle ledger, require static
generated catalogs, forbid dual writes, and retain legacy enforcement until
its deletion criteria are met.

Verification on 2026-08-21:

```text
git diff --check -- docs/architecture.md docs/module-architecture.md
pnpm exec prettier --check docs/architecture.md docs/module-architecture.md
pnpm exec prettier --check AGENTS.md
```

Both commands passed. T0 is committed; T1 and T2 may proceed in parallel.

## T1 test database baseline repair

The dedicated local `pressly_test` volume predated changes to historical
migrations: its `drizzle` ledger had 59 rows while
`public.order_source_snapshots`, created by migration 0024, was absent. This
made the Production reset harness fail before an advance-stage test ran.

Only the disposable `pressly_test` database was rebuilt. Both its `public` and
separate `drizzle` schemas were dropped, then the checked-in single migration
ledger was applied through `@pressly/db`. Neither the development database nor
any production/external database was touched.

Post-rebuild readback:

```text
public.order_source_snapshots exists
drizzle.__drizzle_migrations rows: 40
```

## T2 Docker workspace discovery groundwork

The API and Worker dependency stages no longer enumerate every workspace
manifest. Both fetch the complete pinned lockfile before source copy, then run
a frozen offline install after `COPY . .`. Adding a target workspace therefore
does not require another Dockerfile manifest entry.

Preserved:

- API and Worker runner commands;
- Worker healthcheck path and stop signal;
- image/service topology;
- frozen-lockfile enforcement; and
- every Turbo builder entrypoint at `--concurrency=2`.

Verification on 2026-08-21:

```text
tooling architecture-boundary tests: 73 passed
BuildKit static Docker checks: API and Worker passed
API dev dependency install: all 31 workspace projects discovered offline
API builder: 24 of 24 package builds passed
Worker builder: 15 of 15 package builds passed
```

`pnpm fetch` is experimental in pnpm documentation, so the repository pins
pnpm 10.33.2. The fetch is deliberately full-workspace, matching the previous
broad install rather than pretending to compute a host-specific closure.

## T1 - Freeze external and distributed behavior

The legacy advance-stage boundary now has direct characterization at the
protocol and PostgreSQL layers.

Preserved and pinned:

- the literal `/start` and `/complete` routes and absence of a generic
  transition route;
- `production:stage` authorization;
- authenticate, params validation, authorization, body validation, then handle;
- serialized commands, success/result union, expected failure statuses, and
  invalid-success-response behavior;
- aggregate optimistic conflict semantics;
- exact same-key replay and different-payload idempotency conflict;
- exactly one `work_event` and one live revision for one committed command; and
- rollback when a late machine-assignment invariant fails after the stage
  update begins.

Current evidence on 2026-08-21:

```text
Production decision/controller/HTTP tests: 16 passed
advance-stage real PostgreSQL tests:       4 passed, one file, one worker
API access-control tests:                  5 passed
Production dependency-aware typecheck:    19 of 19 Turbo tasks passed
focused ESLint and diff checks:            passed
```

The required route validation-order correction was made before freezing the
pilot. No route, body contract, capability, outbox event, schema, location
mutex, or business transition was added. T1 is committed.

## T3 groundwork - extract the advance-stage decision

The canonical `production.advance-stage.v1` facts-to-decision function now
lives under `systems/production/cells/floor/advance-stage`. It is independent
of PostgreSQL, clocks, randomness, process state, logging, network, and crypto.
Confirmation hashing/matching is supplied as an existing pure policy
capability so exact confirmation semantics remain unchanged.

The legacy use case now delegates all deterministic branching to that decision
while retaining the only live replay checks, aggregate locks, transaction,
repository mutation, `work_event`, live-revision trigger, and post-commit
signal. This is extraction before authority cutover, not a second writer.

Current evidence on 2026-08-21:

```text
pure decision specifications:             11 passed
Production-system build/typecheck/lint:   passed
Production dependency-aware typecheck:    21 of 21 Turbo tasks passed
Production unit suite:                     434 passed
advance-stage PostgreSQL suites:           11 passed across 4 files
API LPMS flow:                              1 passed
legacy and target architecture gates:      passed for the current extraction
```

One existing identity-sensitive lifecycle assertion detected an initial
copying difference. The decision now passes through the exact run and shift
policy objects, preserving reference identity as well as values. T3 remains
incomplete until the inactive cell shell, differential executor proof, one
binding cutover, Processor integration, and legacy-leaf deletion are done.

## T2 - Introduce cellular primitives topology catalogs and dual enforcement

Implemented inactive target infrastructure:

- `@pressly/cells` separates immutable build-time declarations from
  dependency-bound executable cells through `declare*Cell` and `bindCell`;
- staged HTTP surfaces validate authorization scope from the request head
  before body/full-input decoding and accept only opaque authenticated context;
- `@pressly/topology` validates owners, operation IDs, source/assembly
  metadata, contract versions, authorization staging, routes, jobs, events,
  and experience uses;
- generated HTTP/job artifacts are typed async catalog factories. They import
  explicit owner assembly factories and accept owner-keyed argument tuples, so
  build-time topology never constructs database-bound executors;
- generated client catalogs and architecture maps remain static mechanical
  artifacts;
- deterministic generate, freshness-check, and explain CLIs are installed;
- `@pressly/http-host` and `@pressly/jobs-host` are inactive generic
  interpreters with no business imports or handwritten domain registrations;
- dependency-cruiser 18.2.0, eslint-plugin-boundaries 7.2.0, target lint, small
  topology tests, and the legacy compiler run together; and
- workspace discovery, root TypeScript references, lockfile importers, API and
  Worker Docker dependency stages support the target package families.

The HTTP host order is request context, authentication, validated head/scope,
authorization, body parser, authenticated cell-context mapping, full input
decode, one execute, and presentation. A direct 401 test proves authentication
failure exposes neither scope-validation nor body-validation distinctions.
The jobs host delegates polling, leases, heartbeats, retry, dead letters, and
shutdown to one injected execution platform and creates no queue.

Current combined evidence on 2026-08-21:

```text
pnpm architecture:check:
  legacy architecture compiler             passed
  target builds                             8 tasks passed
  dependency-cruiser                        46 modules / 82 edges / 0 violations
  dependency-rule negative/positive fixtures 5 passed
  topology tests                            10 passed
  generated freshness                       passed
pnpm lint:architecture                      passed legacy + cellular
HTTP host tests                             7 passed
Jobs host tests                             6 passed
target dependency-closure typecheck         14 tasks passed
API Docker builder                          24 package builds passed
Worker Docker builder                       15 package builds passed
```

The generated deployment topology is deliberately empty: no target cell or
generic host is runtime-authoritative yet. T2 is committed; T3 owns the first
catalog/composition cutover.

## T3 inactive cell shell and initial differential proof

The target Production package now owns an inactive, fully declared
`production.advance-stage.v1` shell:

- versioned input/output/failure contracts wrapping the current Production
  wire schemas;
- a linear executor with exact pre-lock and post-lock replay checks, explicit
  facts/decision/mutation/work-event protocol, and post-commit signal timing;
- exact `/start` and `/complete` POST surfaces, `production:stage`, `64kb`,
  optimistic expected version, required idempotency, no location concurrency
  key, no emitted messages, and the existing `production.advance_stage`
  observability label; and
- a static declaration separated from dependency-bound runtime assembly.

Expected `ProductionFailure` data is classified only after transaction
rollback. Owned AppError values keep their existing throwable identity and
status; they are not silently converted into expected cell outcomes. HTTP
presentation maps typed failures back to owned AppErrors so the outer error
boundary retains tracing and observability.

Focused target evidence:

```text
decision, contract, executor and declaration tests: 31 passed
Production-system typecheck/lint/build:               passed
dependency-aware legacy Production typecheck:         23 tasks passed
```

The migration-only equivalence package executes legacy and target shells from
separate reset fixtures against real PostgreSQL. Five scenarios currently pass
for ordinary start, confirmation/no mutation, stale version, identical replay,
and late rollback. Each observation compares outcome channel, state delta,
work events/idempotency receipt, live revision, and the absence of outbox
messages.

The initial bridge named above has now been removed. The target runner imports
only public `@pressly/production-system` executor, native repository,
idempotency, stored-event and policy APIs. The one remaining legacy input is
the broader shared `productionRules` lifecycle policy, which is explicitly
owned by the full Production migration in T4.

## T3 native persistence, exact boundary, and static registration

The pilot now owns native PostgreSQL behavior under
`systems/production/cells/floor/advance-stage`:

- execution locks the Production aggregate in the established order and uses
  the current central schema only as a temporary T7 boundary;
- a result-aware unit of work rolls back typed late conflicts without throwing
  expected-failure sentinels;
- legacy-owned `ConflictError` values, invariant failures, and unexpected
  database failures retain their throwable channel and exact AppError status;
- canonical work-event idempotency, replay, receipt, live-revision behavior,
  and post-commit `batchFrozen(stage_start)` signaling are local to the cell;
- early-start and early-completion confirmation hashing/matching are now
  cell-owned and byte-for-byte characterized; and
- synchronous
  `makeProductionSystem({ db, ids, clock, signals?, observeUnitOfWork? })`
  exposes `cells.advanceStage` without import-time I/O or a service locator;
  its intrinsic Production rules are now system-owned rather than injected.

The HTTP algebra now carries optional declarative invalid-request descriptors.
The generic host retains business-neutral defaults, while advance-stage
declares the exact legacy `invalid_params_type` and `invalid_body_type`
AppErrors with public `{ location, issues }` details. Missing authenticated
actor context remains a 401 boundary failure rather than a body-validation
failure.

Real PostgreSQL evidence on 2026-08-21:

```text
Production-system unit specifications:       40 passed
native Production PostgreSQL specifications: 7 passed, one worker
differential PostgreSQL matrix:               8 passed, one worker
HTTP host specifications:                     8 passed
topology specifications:                      12 passed
Production-system dependency typecheck:       25 of 25 Turbo tasks passed
architecture and architecture lint:           passed
```

The differential matrix includes ordinary success, confirmation without
mutation, stale version, sequential replay, late rollback, concurrent distinct
keys sharing one expected version, concurrent identical-key replay, and
concurrent same-key/different-payload conflict. Both concurrent runners prove
two pre-lock misses before allowing the leader to commit. Each committed case
asserts one work event, one receipt, live revision `0 -> 1`, no outbox message,
and exactly one signal after transaction commit.

The checked topology now selects `production.advance-stage.v1` under
`system:production`, with `experience:processor` as a consumer. Generated HTTP
catalog, client catalog, architecture map, and job catalog are fresh. The
architecture explanation resolves the target owner/assembly, both literal
POST routes, `production:stage`, required transaction, optimistic concurrency,
required idempotency, no emitted/consumed messages, no jobs, and the Processor
consumer.

## T3 single-writer API cutover and legacy deletion

The API now mounts `productionModule.cells.advanceStage` through the generic
catalog host immediately before the broad `express.json({ limit: '64kb' })`
middleware. The mounted dependency mapping reuses Processor authentication,
selects the existing `production:stage` authorization middleware by declared
capability, and reads the authenticated actor through the existing Access
boundary. The old `makeProductionRoutes` registration was removed first, so
the source tree contains one mounted writer and no dual-write interval.

Production memory and PostgreSQL composition expose the same target
`cells.advanceStage` surface. The PostgreSQL assembly applies the existing
result-aware transaction observation outside the native unit of work, retaining
the `production.advance_stage` committed, expected-rollback, and failed
telemetry classifications. Worker and CLI construct the same inert cell as
part of the shared application but do not mount or invoke it.

The complete nine-file legacy source leaf, its four leaf tests, and its legacy
module-architecture declaration were deleted after the target route became the
only owner. Repository search finds no executable import of the deleted
use case, repository, route, controller, mapper, model, port, or confirmation
policies. Shared stage-context, lifecycle-completion, and work-event foundations
remain because other unmigrated Production operations still own real uses.

The migration-only legacy runner was then removed. Its eight scenarios are now
permanent target-only conformance, retaining forced concurrency, state/event/
receipt/live-revision/no-outbox comparisons, rollback assertions, and
post-commit signal timing.

Post-cutover focused evidence on 2026-08-21:

```text
target API catalog + Production protocol tests: 8 passed
legacy Production unit suite after deletion:    419 passed
legacy Production PostgreSQL suite:              40 passed, one worker
target Production unit suite:                    40 passed
target Production PostgreSQL suite:               7 passed, one worker
target conformance matrix:                         8 passed, one worker
Production typecheck, lint and build:             passed
```

The remaining T3 work at that checkpoint was the Processor
generated-client/experience move and the combined post-generation architecture,
API, Processor, container, and Stateworks closure gates recorded below.

## T3 Processor experience and generated browser client

The Processor advance-stage browser boundary now has three explicit owners:

- topology generates import-free operation/version/method/path metadata at
  `generated/clients/processor.ts`;
- `@pressly/experience-processor` owns the typed request mapper and the pure
  attempt/confirmation idempotency workflow; and
- the Processor app retains fetch, CSRF, Web Crypto, storage, React state, and
  presentation effects.

The former handwritten advance-stage URL and idempotency operation strings are
absent from `apps/processor`. The generated source, emitted experience client,
and production Processor bundle contain no Production-system runtime, database,
Node crypto, executor, or assembly symbols. Topology compilation rejects
ambiguous multi-route structural selectors and freshness checking includes
per-experience client files.

Final T3 evidence on 2026-08-21:

```text
full repository typecheck:                     64 Turbo tasks + browser/tooling passed
full repository lint:                          37 Turbo tasks + browser/architecture passed
API unit suite:                                225 passed
API full-app HTTP boundary:                     24 passed
Production legacy-residual unit/integration:   419 / 40 passed
Production target unit/PostgreSQL:              40 / 7 passed
advance-stage target conformance:                8 passed
Processor experience:                            3 passed
Processor app:                                  275 passed
topology / dependency fixtures:                  13 / 5 passed
API dependency-aware build:                     24 packages passed
API Docker builder:                             27 packages, 39 workspaces passed
Worker Docker builder:                          17 packages, 39 workspaces passed
generated freshness, frozen offline install:    passed
```

A full-app test posts an unauthenticated payload larger than 64 KB to the live
advance-stage `/start` route and requires 401 rather than 413, locking actual
route ownership and authentication-before-body parsing. Existing Processor
session tests retain the cookie/CSRF boundary. Architecture explain resolves
the selected cell and Processor consumer, and repository search finds no
executable legacy advance-stage implementation.

The checked generated HTTP catalog is not yet the API's runtime constructor:
the transitional API composition catalogs `productionModule.cells.advanceStage`
directly. The selected cell is identical and there is one writer, but final
topology-authoritative host assembly remains a T6 obligation rather than being
overclaimed here.

T3 is committed.

## T4 inventory and migration sequence

The current Production/Processor cluster contains 32 remaining legacy
Production feature leaves but requires 36 replacement cells: freeze/unfreeze,
route preview/commit, and automatic/exact/overtime placement are independently
observable operations and must split. Together with the migrated pilot and
Production live feed, the target cluster contains 38 Production operations.

Seven current HTTP reads are Processor experience projections that shadow
duplicate legacy Production routes. Their system queries must become headless
public capabilities while the Processor experience retains the deployed route;
selecting both would correctly fail topology duplicate-route validation.

T4 begins with one serial shared Production model/PostgreSQL spine, followed by
inactive parallel batches for commands/order routing, queries/history/Processor
projections, scheduling, streaming/live synchronization, and Processor browser
relocation. One integration owner controls `system.ts`, topology, generation,
API composition, and serial per-operation cutovers. Streaming requires an
explicit SSE surface/host decision because the current finite-response cell
algebra cannot represent it. No product behavior, event, table, or distributed
protocol change is bundled into these moves.

### T4 shared Production language spine

`@pressly/production-system/model` is now the semantic owner of the complete
52-rule immutable Production vocabulary, lifecycle graphs and decisions, plus
the cross-aggregate execution and stage-context types proven across multiple
operations. Twenty-five superseded legacy language sources were deleted and 15
detailed specifications moved with their owner; 61 remaining legacy and
verification consumers import the explicit target model subpath.

The rule factory body and every compiled policy/graph value retain identity as
well as behavior. `makeProductionSystem` now assembles its intrinsic
`productionRules` internally instead of accepting replaceable business rules
from a composition root. Algorithms, scheduler registry, projections, schema,
and PostgreSQL helpers did not move: no second target cell yet proves a shared
technical adapter shape.

Current shared-spine evidence:

```text
target Production unit specifications: 195 passed
legacy Production residual unit tests:  283 passed
target / legacy PostgreSQL:                7 / 40 passed, one worker
target and legacy typecheck/lint/build:  passed
architecture and architecture lint:     passed
```

Two executable migration matrices now make the remaining work explicit rather
than relying on directory counts. The command matrix covers 14 target write
operations and their route, authorization, lock, replay, event and signal
requirements. The query matrix covers 12 reads, five Production-owned routes,
seven Processor-owned shadow routes, filters/cursors/order/`asOf`, SQL
semantics, and identity fallback behavior. Root `verify:refactor` now includes
both matrices and a serialized one-worker `test:systems:int` gate.

### T4 representative command and query checkpoint

The first post-pilot command and query are implemented under the Production
owner:

- `production.set-order-priority.v1` owns its pure operational-access decision,
  versioned contract, executor, idempotency identity, native PostgreSQL
  repository, work-event envelope, and exact PATCH surface; and
- `production.list-history-plans.v1` owns its versioned filter/cursor contract,
  pure projections, repeatable-read PostgreSQL query, exact GET surface, and
  typed cursor/location failures.

Real-PostgreSQL differential verification found no state or protocol drift.
Set-priority passes eight scenarios: success, missing order, stale version,
archived-order policy rejection, same-version race, identical replay,
different-payload idempotency conflict, and late work-event rollback. The
observation includes outcome, order state, work event and receipt envelope,
live revision, outbox absence, and signal absence. History-plans passes six
scenario groups covering boundary defaults/normalization, full projection,
all filters, descending microsecond ordering, exact cursor bytes and filter
scope, `asOf`, invalid-cursor precedence, missing location, and read-only state.

After those gates, the generated HTTP catalog became the API's runtime
authority over the already-assembled Production owner. It now selects
advance-stage, set-priority, and history-plans without constructing a duplicate
system. The legacy set-priority and history-plans route registrations were
removed before generation, so each deployed route has one handler. A review
found and corrected one inactive-cell boundary drift before completion:
set-priority now preserves the legacy body-then-params validation precedence
and authorizes after complete valid input.

Current focused evidence:

```text
set-priority PostgreSQL differential:       8 passed, one worker
history-plans PostgreSQL differential:       6 passed, one worker
target Production unit specifications:     238 passed
topology specifications:                    19 passed
API catalog/full-app boundary subset:        37 passed
target/API typecheck and generated freshness: passed
```

The legacy source leaves and differential runners are still being removed at
this checkpoint. The above records single deployed route authority, not final
cell completion.

### T4 subscription and event-stream foundation

The cellular algebra now distinguishes finite cells from `subscription` cells
with a versioned event contract and `event-stream` surface. The generic HTTP
host owns SSE framing, exact bounded event names, authentication and staged
authorization, heartbeats, session expiry, abort/error/shutdown cleanup, and
connection/event/failure telemetry. It preserves the deployed pending-shutdown
race (ordinary empty response, no false ready frame) and `write(false)`
behavior.

`production.subscribe-changes.v1` owns the subscribe-before-revision race,
buffered revision/resync precedence, current live revision lookup, PostgreSQL
LISTEN feed, and ready/change/resync presentation. The static topology selects
it under Production, Processor consumes import-free generated stream metadata,
and the separate generated event-stream catalog is fresh. The live target
route remains unmounted at this checkpoint while API source/feed composition
and browser cutover are completed.

```text
generic HTTP/event-stream host specifications: 18 passed
Production subscription specifications:       14 passed
cell/topology/generated typecheck/lint/build:   passed
cellular dependency graph:                     167 modules, 538 dependencies, zero violations
```

### T4 representative leaf deletion and permanent conformance

The set-priority and history-plans legacy leaves, leaf tests, module manifest
declarations, repository bindings, application methods, and route/controller
composition are deleted. Memory and PostgreSQL composition expose the target
cells directly; LPMS and residual Production callers invoke
`cells.setOrderPriority.execute` and `cells.listHistoryPlans.execute` without a
compatibility wrapper. Repository search finds no legacy runtime/source caller.

The migration-only legacy runners and `@pressly/production` verification
dependencies are gone. The same eight command and six query scenario groups
are permanent target conformance and pass against canonical `pressly_test` at
one worker.

```text
residual Production unit/PostgreSQL:       283 / 40 passed
target Production unit/PostgreSQL:         260 / 13 passed
set-priority permanent conformance:          8 passed
history-plans permanent conformance:         6 passed
API LPMS end-to-end:                         1 passed
Worker and CLI typecheck:                  passed
architecture and architecture lint:       passed
```

The root lock now contains the command/query verification importers and all
new experience/generated/API edges. A frozen offline install completed across
41 workspace projects.

### T4 live-feed and Processor transport cutover

The API process now constructs the Production-owned PostgreSQL change feed,
passes its narrow source capability into `makeProductionSystem`, and mounts
the generated event-stream catalog through the generic host. The API retains
start/close lifecycle, Processor authentication/capability middleware, session
expiry extraction, and concrete metric/log sinks. Existing connection,
active-connection, event, feed-failure and resync metric identities remain; a
bounded additive `api.sse_failures {reason}` counter covers generic host
failures.

The old API SSE route, PostgreSQL feed adapter, and their duplicate tests were
deleted after the generated route was mounted and a full-app test proved
authentication prevents source subscription/revision reads. The target feed,
cell, generic host, and API adapter specifications retain the detailed wire and
lifecycle proof.

Processor now receives generated metadata through experience-owned mappers for
set-priority, history-plans, and subscribe-changes. Fetch, EventSource, cookies,
CSRF, abort signals, and browser lifecycle effects remain app-owned. The three
handwritten URLs are absent from Processor source.

```text
API unit suite after live deletion:          225 passed
API full-app/event-stream focused subset:     30 passed
Processor experience:                          6 passed
Processor app:                                277 passed
Processor focused adapter/composition:         14 passed
Processor cellular dependency graph: 206 modules, 694 dependencies, zero violations
generated freshness and topology:             passed
```

### T4 authenticated context boundary

The cell manifest now separates authentication from authorization and declares
immutable, operation-specific authenticated context requirements. The generic
HTTP host authenticates first, performs any synchronous request prevalidation,
then awaits the host-owned context resolver before complete contract decoding
and after-input authorization. Terminal authentication or authorization
responses stop the pipeline before context lookup or execution.

The API adapter maps only two declared tokens and fails closed on unknown
requirements:

- `authenticated-actor` resolves the existing Production actor identity; and
- `allowed-production-location-ids` performs the existing asynchronous Access
  lookup only for the location-list operation.

Production receives the resulting opaque context, never an Access dependency
or Express response. `production.list-locations.v1` therefore preserves the
legacy order of authenticate, validate query, resolve allowed locations, and
execute, including unrestricted `null` and explicit empty-scope semantics.

```text
generic HTTP host specifications:              20 passed
topology specifications:                       22 passed
API full unit suite:                           226 passed
Production target unit specifications:         315 passed
cell/host/topology/generated/API typecheck:    passed
```

### T4 floor-command and core-query batch

Four floor commands now have cell-owned decisions, contracts, executors,
idempotency, locked PostgreSQL repositories, work-event/live-revision effects,
typed expected rollback, and post-commit signals:

- `production.assign-stage-machines.v1`;
- `production.freeze-batch-membership.v1`;
- `production.unfreeze-batch-membership.v1`; and
- `production.reconcile-batch-progress.v1`.

The real-PostgreSQL differential matrix passed 53 observable scenarios with no
legacy/target drift. It covers every reachable policy and confirmation
failure, identical replay, divergent key reuse, same-version races, late
rollback, final aggregate state, work events, receipts, live revision, outbox
absence, and signal timing. Each of the four legacy Express registrations was
removed before its generated catalog selection, leaving one deployed writer.

Three non-shadow Production queries are likewise assembled and selected:

- `production.list-locations.v1`;
- `production.list-orders.v1`; and
- `production.list-history-runs.v1`.

Thirteen new real-PostgreSQL differential cases found no drift across defaults,
filter normalization, exact cursor bytes and scope, deterministic ordering,
due buckets, external display references, repeatable-read aggregates, `asOf`
timing, authorization-derived scope, and complete before/after read state. The
three legacy route registrations were removed before generation. Legacy leaf
deletion and Processor generated-client relocation remain in progress at this
checkpoint.

```text
floor-command PostgreSQL differential:         53 passed, one worker
complete command PostgreSQL gate:               61 passed, one worker
new query PostgreSQL differential cases:        13 passed, one worker
complete query verification package:            32 passed
topology/generated/API architecture gate:      passed
cellular graph:                  320 modules, 1234 dependencies, zero violations
API unit suite after seven route cutovers:      226 passed
```

### T4 floor and core-query deletion plus preview cutover

The four floor legacy leaves are now deleted, including their application
methods, repository slots, PostgreSQL adapters, module declarations, leaf
tests, and a three-file execution foundation that had no consumer after the
move. Legitimate residual callers now invoke the target cells directly. The
53-case differential became permanent target conformance; exact source/path
searches find no legacy floor implementation or compatibility alias.

The three core-query legacy leaves are also deleted. Memory and PostgreSQL
application composition now provide real `listLocations`, `listOrders`, and
`listHistoryRuns` cells, and the LPMS application-composed flow invokes the
cell directly. Their 13 differential branches are permanent target-only
conformance. Central wire schemas remain temporarily in Contracts and database
schemas remain in the single migration ledger, as required until T7.

Processor now receives generated operation metadata through experience-owned
clients for all four floor commands and all three core queries. It preserves
query omission/defaults, exact cursor and filter encoding, request aborts, and
the deployed response schemas. Fetch, cookies, Web Crypto, and UI orchestration
remain browser-app effects; source and emitted bundles contain none of the
removed handwritten routes, Production runtime, database code, Node crypto, or
cell executors.

`production.preview-order-route.v1` is additionally assembled and selected
after five real-PostgreSQL legacy/target scenarios matched exact proposals,
canonical hash bytes, ordering, policy failures, read-only state, and signal
timing. Only the preview registration was removed from the bundled legacy
router; commit-order-route remains its sole writer and was not modified. The
Processor preview call now also uses generated metadata.

A telemetry audit corrected the earlier set-priority adapter so its native
result unit of work is decorated as `production.set_order_priority`, matching
the explicit observability declaration and finite metric vocabulary.

```text
floor permanent PostgreSQL conformance:        53 passed, one worker
query verification including preview:          24 PostgreSQL passed, one worker
residual Production after query deletion:      239 unit / 37 PostgreSQL passed
Processor experience/app:                      18 / 278 passed
Processor cellular graph:       315 modules, 954 dependencies, zero violations
API unit suite including LPMS direct cells:     226 passed
preview legacy/target differential:               5 passed
Observability package:                           29 passed
architecture and generated freshness:          passed
```

### T4 admission and intake command deletion

`production.change-admission.v1` and
`production.record-order-intake.v1` now own their decisions, versioned
contracts, exact body-before-params HTTP mapping, idempotency envelopes,
location/row locking, PostgreSQL mutations, bag replacement, work events, live
revision, rollback, and bounded transaction observations. Ten admission and 13
intake legacy/target PostgreSQL scenarios matched exact outcomes and persistent
observations before cutover.

One proposed intake fence was rejected during review: deployed SQL uses the
production order version as its compare-and-swap predicate, while the current
intake version only determines the successor. The target and migration
inventory were corrected to that exact behavior instead of bundling an
unrequested hardening change.

For each operation, the legacy route registration was removed before topology
generation. The API catalog maps the existing `production:admission` and
`production:intake` capabilities and authenticated actor context. Processor
uses experience-owned generated clients; neither handwritten route remains in
browser source or bundles.

After target activation, 14 legacy sources and seven tests were deleted along
with repository/application/memory compatibility slots. Faithful target memory
cells preserve the LPMS application-composed flow. Both migration differentials
are now permanent target-only conformance, and the verifier no longer depends
on legacy Production. The unused legacy route-security fields for priority,
admission, intake, and location-scope lookup were removed.

```text
admission legacy/target then permanent PG:      10 passed, one worker
intake legacy/target then permanent PG:          13 passed, one worker
complete command PostgreSQL conformance:         84 passed, one worker
residual Production unit/PostgreSQL:             219 / 36 passed
Processor experience/app:                        20 / 278 passed
API unit and LPMS direct-cell flow:               226 / 1 passed
Worker / CLI:                                     77 / 40 passed
architecture graph:            423 modules, 1717 dependencies, zero violations
```

### T4 scheduling inventory and create-shift deletion

An executable scheduling inventory now covers 12 previously unenumerated
operations: 11 commands and one query, with 11 HTTP routes and one headless
composition command. It explicitly splits placement into automatic, exact,
overtime-confirmation, and headless attempt operations, rather than retaining
the legacy multi-operation leaf. The safe migration order is load-schedule,
publish-config, shift mutations, schedule lifecycle, then placement.

`production.create-shift.v1` is the first scheduling cell. It owns its pure
window decision, strict request/result contract, exact body-before-params HTTP
mapping, idempotency receipt, single transaction, generated IDs, work event,
live revision, and result-UoW telemetry. It deliberately receives no clock:
both legacy and target read the wider owner clock zero times.

Six PostgreSQL legacy/target scenarios matched success, invalid window, exact
replay, divergent key, generated shift-ID collision, event-append rollback,
rows, receipt, revision, and outbox absence. After catalog and generated-client
cutover, all seven legacy sources and their application/repository/memory slots
were deleted. The verifier is permanent target conformance and no longer
depends on legacy Production.

```text
scheduling inventory:                            6 unit checks passed
create-shift legacy/target then permanent PG:    6 passed, one worker
residual Production unit/PostgreSQL:             219 / 36 passed
Processor experience/app:                        21 / 278 passed
architecture graph:            455 modules, 1886 dependencies, zero violations
```

### T4 change-resolution deletion and source-closed single authority

`production.change-order-resolution.v1` now owns both resolve and restore,
including source preconditions, participation/review guards, pending-placement
clearing, restored source projection, double replay checks, scheduling and row
locks, CAS, work events, receipts, live revision, rollback, and transaction
telemetry. An independent audit found and fixed one malformed historical
receipt edge where the first target draft healed data that legacy left
untouched.

Twenty-nine real-PostgreSQL scenarios then matched every result, expected
failure, persistent state, event, receipt, revision, outbox, race, late CAS,
and rollback observation. The route moved to the generated catalog and the
Processor experience client uses generated metadata.

The source-closed Worker orchestration was redirected in the same cutover: its
narrow legacy `Result` port maps into `cells.changeOrderResolution.execute`.
This prevents a hidden second writer while preserving its review-reason
mapping. The seven legacy sources and four tests were then deleted, and the 29
scenarios became target-only conformance.

```text
change-resolution permanent PostgreSQL conformance: 29 passed
complete command PostgreSQL conformance:            113 passed, one worker
residual Production unit/PostgreSQL:                200 / 32 passed
source-closed/composition focused:                   13 passed
API / Worker:                                      226 / 77 passed
architecture, generated freshness, lint:           passed
```

### T4 inactive scheduling-cell proof batch

Seven additional scheduling operations now have complete, isolated target
implementations but remain intentionally absent from public assembly,
topology, generated clients, API/Processor composition, and runtime authority:

- `production.load-schedule.v1` is a narrow read-only projector;
- `production.publish-scheduler-config.v1` preserves the deployed no-lock,
  latest-version allocation and unique-version race behavior;
- `production.update-shift.v1` owns its lifecycle/version mutation;
- `production.replace-shift-selection.v1` preserves before/after-lock replay,
  audited no-ops, ordered replacement and conditional plan supersession; and
- `production.create-schedule.v1` owns its deterministic proposal, snapshot,
  draft persistence and current-plan supersession flow;
- `production.accept-schedule.v1` preserves double replay, warning identity
  versus sorted persistence, proposal/snapshot checks and the accepted
  schedule CAS; and
- `production.start-schedule.v1` atomically materializes the complete run,
  batch, stage, membership, assignment and order-attempt graph.

Each leaf has operation-owned contracts, decisions where behavior requires
them, an executor, native PostgreSQL adapter and focused tests. The command
leaves retain exact work-event, receipt, live-revision, rollback, race and
post-commit-signal behavior; load-schedule remains read-only. Repeated
supersession semantics across update-shift, replace-selection and
create-schedule are evidence for a later Production-owned mechanism, but their
different lock and mutation graphs do not yet justify a shared adapter.

No differential comparison or single-authority cutover is claimed for this
batch. Those gates remain mandatory before selection and legacy deletion.

```text
load-schedule focused unit/PostgreSQL:              6 / 2 passed
publish-config focused unit/PostgreSQL:            21 / 3 passed
update-shift focused unit/PostgreSQL:              29 / 10 passed
replace-selection focused unit/PostgreSQL:         35 / 8 passed
create-schedule focused unit/PostgreSQL:           18 / 6 passed
accept-schedule focused unit/PostgreSQL:           28 / 6 passed
start-schedule focused unit/PostgreSQL:            24 / 7 passed
target package typecheck/lint/build:                passed
architecture and generated freshness:              passed
temporary PostgreSQL databases:                    force-dropped and absent
```

### T4 manage-resources CLI cutover and deletion

`production.manage-resources.v1` now owns the headless Production resource
bootstrap transaction. Twelve legacy/target PostgreSQL scenarios matched the
exact result, stored resources, receipt, live revision, rollback and telemetry
observations. The comparison deliberately retained deployed quirks instead of
silently hardening them: array-order-sensitive hashing, audited fresh-key
no-ops, the same-key race loser, malformed historical receipts and the
location-business-ID false-convergence edge.

The CLI now injects `application.cells.manageResources.execute`. File and
environment reads, manifest composition, production-preview then
source-binding-preview ordering, the two apply calls, stdout/stderr and exit
status remain app-owned. The CLI maps the target operation's validation and
conflict data to the existing 400 and 409 application errors at that boundary.

After the CLI gate passed, the legacy Production model, policy, port,
repository, use case, tests, module declaration, public types, application
method, repository slot and memory compatibility operations were deleted. The
12-case verifier is permanent target-only conformance and no longer depends on
legacy Production. Exact source/path/symbol searches find no residual runtime
owner.

```text
manage-resources legacy/target then permanent PG:  12 passed, one worker
complete command PostgreSQL conformance:          125 passed, one worker
residual Production unit/PostgreSQL:              195 / 31 passed
CLI typecheck/unit/lint/build:                     42 unit, all gates passed
architecture graph:              524 modules, 2243 dependencies, zero violations
topology/rules/generated freshness:               22 / 5 / passed
```

### T4 load-schedule generated-route cutover and deletion

`production.load-schedule.v1` now owns the schedule-proposal read. Four
legacy/target PostgreSQL scenarios matched the complete nested proposal,
ordering, missing and cross-location concealment, read-only state and the
existing historical-v1 limitation: both implementations reject a v1 stored
output-plan object even though the outer wire schema admits its algorithm
label.

The legacy Express registration was removed before topology selected the
target GET. The generic API catalog preserves authentication, parameter
validation, location-scoped `production:read` authorization, exact 200/404/400
responses and no actor-context lookup. Processor now delegates through an
experience-owned client built from generated metadata while fetch, cookies,
abort behavior and UI state remain app effects.

After the API and browser boundaries passed, the seven-file legacy leaf,
contract-mapper test, module declaration, repository/application slots and
direct method were deleted. Accept-schedule and start-schedule retain their
independent private transactional schedule loaders; those are distinct
capabilities, not compatibility aliases. The four-case verifier is permanent
target-only conformance and no longer depends on legacy Production.

```text
load-schedule legacy/target then permanent PG:      4 passed, one worker
scheduling verification PostgreSQL:                10 passed, one worker
residual Production unit/PostgreSQL:               194 / 31 passed
API / Processor:                                   228 / 279 passed
Processor browser graph:          345 modules, 1035 dependencies, zero violations
architecture graph:               570 modules, 2465 dependencies, zero violations
topology/rules/generated freshness:                22 / 5 / passed
```

### T4 inactive Processor-shadow query batch

Five additional Production reads now have complete inactive, headless cells.
Their HTTP routes remain intentionally owned by the existing Processor
experience until the corresponding experience-cell composition is migrated:

- `production.list-history-activity.v1` preserves its filter-bound
  microsecond cursor, allowlisted audit projection and clock-before-read order;
- `production.load-history-run.v1` returns the complete ordered run,
  membership-episode, stage, lineage, statistics and bounded activity graph;
- `production.list-order-control.v1` preserves legacy non-transactional
  multi-read consistency, DST-aware due buckets, filters, cursor and
  server-authoritative command capabilities;
- `production.load-board.v1` owns the read-only repeatable-read operational
  board snapshot and pure next-action projection; and
- `production.preview-order-backlog.v1` preserves the checksum cursor,
  complete safety evidence, all classification groups, canonical v2 snapshot
  hash and snapshot-before-clock order.

Production returns only operational IDs and fallback references. Customer,
source and canonical audit identity enrichment remains Processor-experience
work. The list-activity/load-run/board cells keep their exact legacy read-only
transactions; list-order-control deliberately does not invent one. Preview
and the future commit command have a likely shared cursor/snapshot/classifier
seam, while board and workspace have a likely shared snapshot/projector seam;
neither mechanism is promoted until the second target consumer proves exact
reuse.

One preview verification invocation accidentally used the shared fallback test
database. It is not counted as evidence. The complete query verifier was rerun
on a new template0 database, passed, and that database plus the focused preview
database were force-dropped and verified absent.

```text
list-activity focused unit/PostgreSQL:             18 / 5 passed
load-history-run focused unit/PostgreSQL:          10 / 3 passed
list-order-control focused unit/PostgreSQL:        16 / 4 passed
load-board focused unit/PostgreSQL:                14 / 4 passed
preview-backlog focused unit/PostgreSQL:           14 / 3 passed
complete target Production unit:                       746 passed
corrective query verification:                    13 unit / 24 PG passed
architecture graph:               642 modules, 2780 dependencies, zero violations
temporary evidence databases:                     force-dropped and absent
```

### T4 publish-config cutover and after-input authorization correction

`production.publish-scheduler-config.v1` now owns scheduler-config
publication. Seven legacy/target PostgreSQL scenarios matched semantic
failures, exact replay and divergent reuse, latest-plus-one versioning,
configuration rows, work events, receipts, live revision, no outbox and late
rollback. The deployed operation deliberately has no scheduling lock: a
deterministic real race proved both contenders choose the same next version,
one commits, and the unique-version loser remains the existing unexpected 503.

Boundary proof found a generic-host ordering defect before activation: the
first after-input implementation resolved authenticated actor context before
authorization, while legacy validates the request, authorizes location scope,
then reads the actor in the handler. The cell/catalog/host algebra now supports
a staged after-input scope decoder. Publish-config therefore preserves body
then params validation, `production:schedule` authorization, actor lookup,
full decode and execution in that order; terminal denial performs no actor
lookup or execution. A separate audit is applying this correction to every
previously selected after-input route.

The legacy route was removed before topology selection. Processor now uses an
experience-owned generated client; fetch, cookies, Web Crypto and UI behavior
remain app-owned. After API and browser gates passed, the legacy source/test
leaf, module declaration, application/repository/memory slots and direct
callers were deleted. The seven-case verifier is permanent target-only
conformance and no longer depends on legacy Production.

```text
publish-config legacy/target then permanent PG:     7 passed, one worker
scheduling verification:                           10 unit / 17 PG passed
residual Production unit/PostgreSQL:               193 / 31 passed
API / Processor:                                   232 / 280 passed
Processor browser graph:          456 modules, 1303 dependencies, zero violations
architecture graph:               645 modules, 2802 dependencies, zero violations
topology/rules/generated freshness:                22 / 5 / passed
```

### T4 selected-route after-input authorization audit

The publish-config discovery was audited across every topology-selected finite
HTTP operation. Fifteen after-input routes now declare a context-free exact
request validator plus a validated path-scope decoder. The generic host order
is consistently:

```text
authenticate -> body parser -> exact legacy validation -> authorize location
-> resolve authenticated context -> full contract decode -> execute/present
```

This covers assign-machines, admission, order resolution, create-shift,
freeze/unfreeze, history plans/runs, list-orders, load-schedule, route preview,
publish-config, reconcile-progress, record-intake and set-priority. Advance
stage remains deliberately before-input, the subscription uses its SSE host,
list-locations has authentication but no authorization, and headless/inactive
cells have no finite route to stage.

The reusable platform mechanism is parser-agnostic `http.validatedPathScope`;
each leaf still owns its schema and exact body/query/params precedence. A
generated-catalog table guards all 15 declarations. Real actor-command and
context-free-query tests prove authorization denial performs no context lookup,
full decode or execution, while invalid inputs retain exact 400/422 status and
public details before authorization.

```text
HTTP host:                                         20 passed
selected HTTP/cell focused:                       61 passed
API full/focused catalog:                    234 / 8 passed
Production full unit:                            752 passed
architecture graph:              645 modules, 2806 dependencies, zero violations
topology/rules/generated freshness:               22 / 5 / passed
```

### T4 update-shift cutover and deletion

`production.update-shift.v1` now owns shift-window mutation, schedule
supersession and its post-commit signal. Nineteen legacy/target PostgreSQL
scenario groups plus two lock-order proofs matched outcomes, shift/schedule
state, receipts, live revision, no outbox, clock/IDs and signals. The two
variants both preserve location advisory lock, shift row, then current schedule
row ordering. Target-only bounded `production.update_shift` transaction
telemetry is additive; legacy had none.

Before selection the HTTP surface joined the staged after-input path, so body
and params validation plus `production:schedule` authorization precede actor
context. The legacy route was removed before topology generation. Processor
now delegates through an experience-owned generated client while its port, UI,
fetch, cookies and Web Crypto workflow remain unchanged.

After the API/browser gates passed, the legacy leaf/tests, module declaration,
composition imports, repository/application/PostgreSQL/memory slots and direct
callers were deleted. The verifier is permanent target-only conformance and no
longer depends on legacy Production. Exact executable searches retain only
canonical wire-schema names and historical inventory provenance.

```text
update-shift permanent conformance:                21 passed, one worker
scheduling verification:                           13 unit / 38 PG passed
residual Production:                              187 unit / 29 PG passed
Experience / Processor / API:                  25 / 281 / 238 passed
API, Processor, Worker, CLI typechecks:             passed
architecture/topology/generated/lint:                passed
temporary databases:                 force-dropped and verified absent
```

### T6-T8 pre-implementation authority and deployment audit

Three independent read-only traversals mapped the remaining Access/Control,
Orders/Customers/Pricing, host/deployment and contract/schema work. They did
not change product code or advance any pending live, vendor, pilot or human
gate in the separate Control and LPMS Stateworks packages.

Those two active packages still contain executable gates and source anchors
for the legacy Access, Customers, Orders and Experience packages that T6-T8
must remove. The T6, T7 and T8 write allowlists therefore name the exact LPMS
and Control work packages. Reconciliation is limited to successor anchors and
commands; their independent statuses, human gates and historical evidence
remain unchanged.

T6 currently contains 25 Identity operations, five Customers operations,
23 Control Experience operations, two effectful Authorization scope queries,
53 relevant Access/Control/Processor HTTP bindings, twelve non-T5 Orders
operations and three Pricing operations. The generic host cannot preserve
those boundaries with a single authenticate callback: it needs opaque,
generated profiles for public, bearer, Control-cookie and Processor-cookie
authentication; parser phase; origin/CSRF; content type and body limit; rate
limits; no-store; context; and capability evaluation. CLI requires an actual
surface/catalog rather than a relocated handwritten registry.

Behavior-preserving decisions are now explicit in `network.yaml`:

- do not silently bind sessions to an app realm, change lifetime/audit/
  idempotency behavior, or reorder malformed and unauthorized failures;
- preserve atomic incoming-proposal acceptance through a narrow versioned
  Customers capability executed in the Orders transaction, with no peer
  schema import;
- preserve the current absence of Stripe, billing and payment authority and
  the existing DB-versus-Web Pricing fallback mismatch;
- keep `production_locations` physically unchanged through T6 while Access
  owns scope facts and Production owns live-revision meaning; and
- build candidate hosts and pass Chromium plus the complete five-image smoke
  before atomically switching entrypoints. No second listener, poller,
  browser root or CLI registry is permitted.

T7 maps 356 current central Contracts consumers, 59 tables and eight enums. Owner
factories must compose the existing FK graph at topology; systems receive only
their own tables/capabilities. The physical `packages/db` migration path and
all forty historical SQL files remain immutable. The historical journal is
version 7 with indices `0, 2..40`; index 1 must not be repaired. T7 will add an
ordered journal timestamp plus SQL-byte SHA-256 verifier because the current
Drizzle and restore checks do not detect mutation of already-applied history.

To avoid a table migration during the refactor, Access will own the
`production_locations` table source while topology injects a transaction-bound
live-revision capability into Production. This preserves the work-event
transaction without a peer-schema import or physical split. Multi-schema read
adapters must be removed through system capabilities before schema source
moves.

Deployment truth is also frozen: five image names, service names, ports,
health contracts, Caddy-only ingress, same-origin API behavior, Worker
heartbeat, `five-image-v1` release fields, migration-first deploy and exact
rollback metadata. Current host packages are libraries rather than process
entrypoints, topology does not yet model hosts/images, generated jobs are
empty, and browser/CLI hosts do not exist. T6 therefore builds inactive
candidates and switches every path-bound Docker/CI/Compose/smoke/release
reference in one coordinated cutover; T8 deletes only inert legacy runtime.

Baseline migration identity captured by the audit:

```text
central Contracts consumer files:                          373
database objects:                            59 tables / 8 enums
migration journal:                   version 7 / 40 entries / idx 0,2..40
journal SHA-256:        18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered migration tree: 4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
current topology:                  42 operations / 35 HTTP / 1 SSE / 0 jobs
```

### T4 placement cutover and phase closure

The final legacy scheduling bundle is deleted. Three independent HTTP cells
now own automatic placement, manager-exact placement and overtime
confirmation. A fourth headless `production.attempt-automatic-placement.v1`
cell owns the zero/one/multiple-started-run composition command; it remains
unselected because no actual runtime consumer exists. The three real routes
are topology-selected and generated.

Twenty-seven public legacy/target PostgreSQL scenarios matched all four
operations, canonical algorithm and hash bytes, run-cardinality branches,
existing/new/rejected/confirmation outcomes, replay/divergence at both
checkpoints, same/different-key races, stale/frozen and every reachable CAS,
event and receipt rollback, exact ID/clock order, live revision, no outbox and
signal timing. The four native target suites pass forty-five cases. Permanent
target-only conformance retains all twenty-seven scenarios.

Generated Experience clients now back the three Processor-facing HTTP
operations and the generic API catalog owns their routes. The legacy
place-order leaf, route, repository, memory/test wiring and placement-only
algorithm/foundation owners are deleted. The remaining legacy Production
module contains only the two T5-bound reaction capabilities. Its apply-only
command/SQL mechanisms are feature-owned; apps consume the public target
system signal type; Worker owns the legacy failure presentation needed until
its queue cutover. Both architecture systems are green without compatibility
aliases or fan-in exemptions.

The closing T4 matrix ran from the final tree. Every target PostgreSQL file,
including five previously implicit fixed-default suites, ran on explicitly
bound template0+migrated databases with one worker and verified teardown. Root
typecheck, lint, build, all non-verifier unit tasks, tooling, architecture,
generated freshness and frozen offline install are green. Chromium smoke
built disposable API, Control and Processor production images, started the
local HTTPS topology, passed all nine owner/manager/operator/session/CSRF/
customer-order/mobile smoke cases, and removed every project container,
network and volume.

Only four pre-existing user-owned `.agents/skills/refactor/**` files remain
outside root Prettier; every cellular migration path is formatted. T4 is
committed. The already-proven apply-fulfillment-demand and source-closed
target cells move to runtime authority only in T5 so the Worker never has two
consumers for one queue.

```text
placement focused native / public parity / conformance: 45 / 27 / 27 passed
scheduling verification PostgreSQL:                   9 files / 153 passed
Production-system PostgreSQL:                        38 files / 253 passed
Production-system unit:                                    1025 passed
root Turbo unit / tooling:                            63 tasks / 371 passed
root typecheck / lint / build / architecture:                    passed
cellular graph:                 866 modules, 4096 dependencies, zero violations
Chromium production-image smoke:                              9 / 9 passed
temporary databases and Compose resources:       verified removed / absent
```

### T5 S1 inactive generic jobs mechanism

`@pressly/jobs` now owns the business-neutral durable delivery and execution
mechanisms required by the existing Worker: opaque claims, invoke versus
complete-without-invoke versus reject resolution, manifest-owned attempt
limits, the deployed rounded plus/minus 25 percent exponential jitter,
retry/dead-letter decisions, lease-loss handling, cooperative timeout and
cancellation, independent sequential queue passes, busy/idle poll behavior,
process-progress heartbeat, best-effort observation and aggregate shutdown or
peer failures.

The cell algebra now requires each job surface to present its own expected
failure as code, safe message and retryability. Catalog generation carries
that presenter mechanically into the generic jobs host, so platform and host
never switch on Pressly operation or queue identity. The inactive Production
apply reaction presents typed failures as permanent while thrown AppErrors
remain available to the later app-injected unexpected-failure classifier.

This is mechanism only. Topology and the generated job catalog are unchanged;
the Worker still runs both legacy handlers. T5 S3 must supply app-owned queue
adapters, bind one generated registration, remove exactly its legacy handler,
and preserve one sequential process and process heartbeat.

```text
platform/jobs unit:                                2 files / 17 passed
hosts/jobs unit:                                    2 files / 7 passed
Production-system unit:                           236 files / 1025 passed
topology verification / generated freshness:             38 / passed
scoped graph:                    30 modules / 71 edges / zero violations
typecheck / lint / build / Prettier / frozen install:            passed
```

### T5 S2 inactive Orders outbox authority

`@pressly/orders-system` now owns the durable Orders-outbox language and five
inactive headless cells: measure backlog, claim, complete, retry and
dead-letter. The shared producer contract is the exact deployed
`fulfillment_demand_changed.v1` payload. Persistence preserves candidate
ordering, `FOR UPDATE SKIP LOCKED`, attempt increment and expired-lease
reclamation, worker ownership fences, backlog-age semantics and one-statement
terminal transitions.

Public legacy/target PostgreSQL equivalence found no behavioral drift. In
particular, schema-invalid JSON remains a claimed invalid delivery for the
Worker to dispose, while only an injected non-JSON row-mapper fault rolls back
the whole claim transaction. The direct-call NaN lease quirk is preserved and
the serialized boundary still rejects it. The five cells remain absent from
topology, generated catalogs, apps and Production, and the legacy Orders
runtime is unchanged. T5 S3 now owns the single-binding `order_outbox` cutover
and subsequent legacy deletion.

```text
Orders-system unit:                              11 files / 50 passed
Orders-system native PostgreSQL:                   1 file / 11 passed
legacy/target outbox differential:                  1 file / 9 passed
unchanged legacy Orders unit / PostgreSQL:             49 / 19 passed
scoped graph:                    67 modules / 212 edges / zero violations
three template0+migrated databases:              force-dropped / absent
typecheck / lint / build / Prettier:                         passed
```

### T6 phase closure: remaining-system cutover and legacy deletion

T6 is committed on the independently verified source snapshot
`f8e52ed00c7fb097048cacf5c6c7f5d2cf9ff75123112b0e8eccc29a0fa9bb92`.
The API now constructs one target owner graph and mounts one generated HTTP
catalog. The CLI runs one generated program/catalog. Control, Processor and
Web consume generated browser operation metadata through Experience-owned
clients. Generic HTTP, CLI, jobs and browser hosts contain no Pressly domain
switches.

The final topology contains 181 operations, 101 HTTP routes over 100 operation
IDs, 70 HTTP profiles, 12 CLI commands, one SSE subscription and two jobs in
webhook-before-outbox order. Owner counts are Access 30, Control 50, Customer
11, Customers 5, Ingress 14, Orders 19, Pricing 3, Processor 12 and Production 37. Generated browser inventories are Customer 12, Control 38 and Processor 43.

The commercial legacy roots `modules/business/{users,orders,pricing}` and the
security/Experience roots
`modules/security/{identity,authorization}` plus
`modules/experience/{control,processor}` are absent. `packages/auth` remains
only as the target authentication/authorization language and exports exactly
those two subpaths; credential mechanisms live in `platform/auth`, while
Access owns password and identity policy. Recovery copies of removed ignored
and tracked artifacts are retained at:

- `/tmp/pressly-t6-commercial-legacy-artifacts.ATkGNW`;
- `/tmp/pressly-t6-security-legacy-artifacts.xuKo7n`.

The final browser gate found two boundary defects that narrower proof had not
exercised. Strict Control presentation rejected peer-only Customer and
Workforce fields leaked by spread projection, and codec-bearing mutation
bodies decoded timestamps during pre-validation before the cell contract
decoded them again. The correction uses explicit allowlist projections,
returns true Access Workforce summaries and preserves validated raw JSON until
the one contract decode. Focused regressions and the permanent
Access-Experience verifier now exercise the real owner supersets and
codec-bearing order/grant bodies. No public behavior was relaxed.

```text
frozen offline workspaces:                                      55
clean / build / typecheck / lint tasks:           51 / 51 / 84 / 53
non-PG test-file executions / tests:                 637 / 3,344
tooling files / tests:                                 22 / 371
cellular graph:                   1,631 modules / 7,487 edges / zero
topology / architecture rules / freshness:              53 / 5 / passed
PostgreSQL files / tests:                               108 / 902
PostgreSQL residual DBs / matching connections:              0 / 0
browser smoke / full E2E:                              10/10 / 10/10
five-image production release-B and rollback:                 passed
Docker teardown containers / networks / volumes / images: 0 / 0 / 0 / 0
production proof report SHA-256: 633b89d5ff90e760672042fcf4abe4192880f42746986d778a1c00e03d965982
```

PostgreSQL verification ran every current system, permanent verifier, flow,
DB integration and retained API integration suite at one worker, using fresh
`template0` databases, explicit migration/runtime role separation and no
shared `pressly_test`. Browser and production-topology proof built fresh API,
Web, Worker, Processor and Control images; proved local-only Caddy HTTPS,
authentication, MFA, cookies, CSRF, API and Worker restarts, signed and ignored
Ingress events, Orders projection, a complete four-stage Production run,
five-image release B and rollback to release A; then removed every project
container, network, volume and image.

LPMS remains `done:no` with its independent H1 `human_action_required` gate.
Control remains `done:no`. T6 relocation did not advance either package's
human, vendor, deployment or pilot evidence.

### T7 implementation-ready contract and schema ownership audit

The post-T6 read-only audit makes T7 source-observed rather than folder-led.
Central Contracts currently has 36 source files (27 payload files and nine
indexes), 6,475 lines, 16 tests and 356 external references. Production is the
largest direct consumer; mixed contract files must split by semantic producer
rather than move wholesale. Access owns auth/workforce meaning, Customers owns
customer meaning, Orders owns Orders and fulfillment-demand messages, Pricing
owns Pricing, Ingress owns Cents and webhook ingestion, Production owns
source-neutral production results, and Processor/Control/Customer Experiences
own their realm-specific compositions and wire projections. UTC ISO and
SHA-256 validation move to Codec.

The central DB schema has seven source files describing 59 tables, eight
enums, 657 columns, 108 indexes, 144 checks, 100 foreign keys and three
explicit composite primary keys. Twenty-five foreign keys cross future owner
boundaries. Owner factories must preserve those exact objects and `NO ACTION`
actions in this order:

1. Access scope tables (`business_accounts`, `production_locations`);
2. Customers using the Access business reference;
3. Access identity/workforce using the Customers user reference;
4. Orders and Pricing;
5. Production;
6. Ingress;
7. one topology flattening with 59-table/eight-enum uniqueness guards.

Only topology may import owner schema factories. Systems receive their own
table set and narrow structural reference columns; no system imports a peer
schema. `production_locations` remains one Access-owned physical table.
Orders receives a transaction-bound Access location-facts capability;
Production receives canonical scope reconciliation, actor query-plan and
live-revision capabilities. The existing work-event trigger remains the only
revision increment, preventing a double advance.

`packages/db/src/migrations` remains the sole ledger and deploy workdir. The
40 SQL files, 39 snapshots and version-7 journal with indices `0, 2..40` are
immutable; T7 creates no migration SQL. Baseline hashes are:

```text
journal SHA-256:       18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered tree SHA-256:  4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
```

T7 will move Codec physically under `platform`, introduce the PostgreSQL
mechanism package while leaving DB as migrations/ledger custody, add a strict
SQL-byte ledger verifier for fresh, upgrade and restore paths, land owner
contracts and schema factories in parallel, and perform one atomic canonical
schema/consumer cutover. The deployment topology must remain
181/101/1-SSE/2-jobs/12-CLI/3-Experiences/70-profiles throughout. No T7 source
was changed by this audit.

### T6 S6b inactive Orders HTTP boundaries

Ten single-realm order-management cells now own their exact inactive HTTP
surfaces: proposal list/accept/reject/restore; Order create/correct/complete/
cancel; and fulfillment release/withdraw. Canonical get/list remain headless
for the Control Experience.

Each surface preserves its path, method, 64 KiB global conditional parser,
bearer authentication, query/path validation, location-scoped
`orders:manage` authorization, body validation, business/principal context,
201 create versus 200 responses, strict success envelope and typed failure
presentation. S1c is adopted positively: declared JSON is parsed before auth,
non-JSON is permitted, and typed failures invoke the central API observation
provider before their single response.

The app-wide `api_global` limiter remains an outer process boundary, so route
profiles do not bind it again. The verifier records the outer limiter in the
legacy trace and proves no double-limit profile provider. No route is selected
yet and the handwritten API remains authoritative.

```text
Orders unit / focused HTTP:                 21 files / 91 / 4 passed
Orders verifier unit / HTTP map:              2 files / 9 / 7 passed
scoped graph:                 146 modules / 700 edges / zero violations
cellular architecture rules:                              5 passed
live selected Orders HTTP operations:                           0
typecheck / lint / build / Prettier:                         passed
```

### T6 S6c inactive complete API target composition

The future API graph now constructs each cellular owner once: Access,
Customers, Orders, Pricing, Production and Ingress systems plus Customer,
Control and Processor Experiences. Customer capabilities are injected into
Orders in the caller transaction; Orders and Production capabilities are
injected into Ingress; Experience cells receive only public execute
capabilities. The candidate has no legacy Identity, Authorization, Users,
Orders, Pricing or Experience import and remains unmounted.

Its exact HTTP inventory is 101 routes with 100 operation profiles: 53
Access-facing authentication and administration routes, ten Orders routes,
three Pricing routes and 35 Processor/Production routes across 34 operations.
Advance Stage owns the one second route. All fifteen middleware, twelve
context, two authorization and two expected-failure provider tokens have
concrete app-owned registrations. Context fragments resolve sequentially in
declared order; missing cookie contexts stay empty so operation-owned input
mapping retains its exact session-versus-challenge failure code.

Orders and existing Production routes retain the deployed
Processor-cookie-or-bearer provider. Control authentication does not hide
CSRF; its profile owns exact origin and CSRF explicitly. One deliberate
security-order correction is now named before activation: on mutating Control
administration and Control/Processor logout, a bad origin plus a missing
cookie rejects the origin first. Valid-origin missing-cookie behavior remains
unchanged. This reduces credential-state disclosure and replaces the legacy
session-first ordering only for that combined invalid request.

The invariant-only invitation caveat also remains explicit. If a supposedly
valid loaded bootstrap session violates its contract by omitting `sessionId`,
both implementations revoke and throw, but the legacy Express path can also
attach a cookie-clear header before throwing. No reachable expected input
differs, and no runtime audit artifact or throwable-header mechanism was
added.

```text
Access / Processor owner cells:                         30 / 12
API routes / operation profiles:                       101 / 100
API unit / Access unit / Processor unit:          283 / 142 / 64 passed
Access native PostgreSQL:                                  5 passed
provider token coverage:                     15 / 12 / 2 / 2 complete
architecture / cellular lint / scoped graph:                  passed
live target catalog mounts:                                       0
```

### T6 S6d generated HTTP catalog cutover

The API now constructs the target owner graph once, constructs the generated
HTTP catalog once and mounts the profiled host once. All 101 routes are served
from 100 selected operations through seventy topology profiles. Fifteen
middleware, twelve context, two authorization and two expected-failure
provider tokens resolve at the app edge through one shared rate store. The
app retains exactly one outer `api_global` limiter.

Health, Helmet/CORS, request context/metrics, Production signals, raw Cents
256 KiB verification/encryption/ingestion, retained dead-letter administration,
generated Production SSE and final not-found/error handling remain process
owned. Cents precedes the generated catalog. Dead-letter replay retains
conditional 64 KiB parsing before target Processor authentication. Production
retains its change source, signals and result-unit transaction observation.
Only the app-owned Processor operational SQL adapter remains for T7.

The cutover found one final representational gap instead of changing the wire
silently. Required-content-type profiles may now carry immutable wire-safe
415 presentation data. The topology assigns the deployed
`unsupported_media_type` code and JSON-required safe message to all fifteen
required-JSON routes, including Pricing; the generic host's default remains
unchanged for every other deployment. Compiler validation, deterministic
generation and host tests cover the new data.

The named origin-first correction remains deliberate: a mutating bad-origin
request with no cookie rejects origin before session state. Valid-origin
missing-cookie behavior, operation-specific cookie-context failures,
multi-cookie serialization, Control profile-owned CSRF and Processor
cookie-or-bearer precedence all have executable mounted proof. The impossible
invitation cookie-clear caveat remains proof-only.

Legacy API Authorization, Control, Order-management and Processor-session
trees, capability composition, handwritten profile/catalog wrapper and their
superseded tests are deleted. API manifests and test aliases have no legacy
Identity, Authorization, Users, Orders, Pricing or Experience edge.
`@pressly/auth` remains only for authentication/authorization language.

```text
generated HTTP routes / operations / profiles:           101 / 100 / 70
provider tokens middleware/context/authz/observer:       15 / 12 / 2 / 2
API unit / isolated PostgreSQL:                             160 / 2 passed
HTTP host / topology:                                        31 / 53 passed
scoped graph:                    151 modules / 477 edges / zero violations
cellular graph:                1630 modules / 7483 edges / zero violations
typecheck / lint / build / architecture / freshness:              passed
```

### T6 S7 inactive generic CLI mechanism

Cells and topology now describe CLI commands as immutable surfaces rather
than a handwritten app registry. The manifest owns a versioned command ID and
tokenized name, positional and typed/repeatable options, bounded UTF-8 stdin
and TTY policy, prompt policy, opaque context and capability requirements,
and exact success/failure/invalid streams plus allowed exit codes. The
compiler rejects malformed syntax/presentation, duplicates, unknown runtime
names and prefix ambiguity; generated output assembles each selected owner
once.

`@pressly/cli-host` is domain-free. It resolves injected argv, prompt, stdin,
stdout, stderr, exit and signal effects plus staged context/capability
providers, and fails closed on malformed catalogs or presenters. No real
command is selected yet, so the existing app registry remains the sole
runtime authority.

The generic algebra was then extended only where source characterization
earned it. A frozen program manifest owns exact global and namespace help and
unknown-command bytes. A neutral interactive driver owns frames, tones and
keys while the host retains decode, staged authorization and selected-cell
execution. Explicit `maxBytes: null` records the one deliberately unbounded
owner-password stdin contract. Repeated booleans remain idempotently true,
repeated string options retain order, and namespace-first options may precede
the action without treating their values as command tokens. Options before
the namespace remain invalid as deployed.

Twelve inactive candidates now compile together: seven Auth workflows, three
Pricing workflows, Access-owned owner bootstrap and one Control-owned
Production bootstrap composite. The composite preserves 1 MiB file
validation and preview-preview/apply-apply sequencing across Production and
Ingress. The Pricing driver preserves plain/JSON versus interactive progress,
confirmation and escape behavior. Exact app-owned URL, secure session-file,
HTTP client, database/file lifecycle and Ink terminal adapters remain the
last preselection slice. The binary, direct bootstrap scripts and generated
registry still have one legacy authority and must switch atomically.

```text
CLI host unit / topology unit:                            25 / 53 passed
Control CLI / Access candidate tests:                     37 / 142 passed
compiled candidate commands / program:                 12 / one exact program
cellular architecture rules:                                  5 passed
cellular graph:             1626 modules / 7460 edges / zero violations
live CLI commands / owner imports:                              0 / 0
typecheck / lint / build / freshness / Prettier:            passed
```

### T6 S7b generated CLI registry cutover

The generated catalog is now the only CLI registry. It contains twelve
commands under `control.pressly-admin-cli.v1`: seven Auth, three Pricing,
Access-owned owner bootstrap and the Control-owned Production bootstrap
composite. The live app filters that one generated catalog into the
`pressly-admin`, `bootstrap:owner` and `bootstrap:production` process
entrypoints; no second feature registry or direct business implementation
remains.

Control owns Auth/Pricing command mapping, the Production preview-preview then
apply-apply sequence, exact plain/JSON presentation and neutral interactive
frames. Access owns the lazy owner-bootstrap assembly and PostgreSQL operation.
The app owns URL/environment resolution, secure session-file lifecycle,
bounded manifest file IO, one-connection database lifetime, stdin/stdout,
signals, client cleanup and the Ink terminal adapter. Help, unknown-command,
invalid-option, output-before-close and primary-error precedence bytes remain
exact.

The old feature/shell registry, duplicated bootstrap implementation and
mapper, legacy-only tests and CLI dependencies on legacy Identity and Money
are deleted. Invalid bootstrap smoke proves neither thin entrypoint opens a
database before its selected command passes argv validation. Owner native
proof uses a unique template0 database and verifies force-drop absence.

```text
generated / live CLI commands:                              12 / 12
pre-deletion legacy-target / permanent runtime:          27 / 33 passed
CLI host / Control / Access unit:                     25 / 38 / 144 passed
Access native PostgreSQL:                                      6 passed
global / Auth / Pricing help bytes:                    1184 / 618 / 565
cellular graph:             1630 modules / 7483 edges / zero violations
typecheck / lint / build / architecture / freshness:            passed
```

No production-bootstrap apply or external API mutation was used as parity
evidence. The proof covers local contracts and lifecycle; operational use
still requires the caller's authorized environment and inputs.

### T6 S8 inactive credential mechanism authority

`@pressly/auth-platform` now owns only reusable credential/session mechanisms
through explicit subpaths: password hash/verify, token issue/hash, TOTP,
secret-box encryption, recovery codes, session CSRF proof and cookie parsing.
It has no root export. Access is now its first runtime consumer and imports
only the exact password, recovery-code, secret-box, token and TOTP subpaths.

The ownership audit deliberately excluded password-strength composition,
identity/session lifecycle, TTL and login-window choices, roles, capabilities,
resources, scopes, DB persistence, audit meaning, origins, realm CSRF domains,
cookie policy and all environment/configuration decisions. Default mechanism
errors are neutral; optional injected factories reproduce the existing Access
password and MFA error envelopes for the later cutover without putting email
or MFA language in platform. The exact 16-character lowercase/uppercase/
number/symbol policy and ordered violation type now live in Access language
with exactly two behavioral consumers: owner bootstrap and invitation
acceptance.

Access injects thin legacy-exact failure factories at assembly for password
hashing, password verification, invalid MFA keys and invalid encrypted
envelopes. The platform defaults stay mechanism-neutral. Target Access has
zero `@pressly/auth/credentials` imports and retains `@pressly/auth` only for
authentication and authorization language. No behavior drift was found.

Differential/security proof cross-verifies Argon hashes, wrong-password and
fault behavior; fixed HMAC vectors and random token lengths; recovery-code
format/normalization/hash; fixed-clock TOTP URI/window/counter; AES-GCM
cross-decryption, envelopes, tamper and random IVs; CSRF domain separation and
constant-time verification behavior; and source-observed Control/Processor
cookie parsing. No behavior drift was found.

```text
auth-platform verifier:                         4 files / 28 passed
Access unit / isolated PostgreSQL:                   138 / 4 passed
Access public verifier unit / PostgreSQL:                4 / 1 passed
legacy Auth baseline:                          16 files / 64 passed
cellular architecture rules:                              5 passed
scoped graph:              309 modules / 1243 edges / zero violations
live auth-platform system consumers:                           1 Access
typecheck / lint / build / Prettier:                         passed
```

### T6 S1c conditional parsing and expected-failure observation

The profiled host now represents the final two protocol facts found by the
auth Experience audit. Request-body policy distinguishes mandatory content
type from parse-if-matching. Conditional mode permits missing or nonmatching
media types, but invokes the same parser and limit at the declared phase for
matching JSON, preserving malformed-body and 413 behavior. Required mode
retains its 415 contract for Pricing and other JSON commands.

Profiles may also name an opaque expected-failure observer. When a cell
returns failure and its presenter produces a valid response, the host invokes
the observer exactly once with operation, provider, request, read-only
response context, raw failure and status before the single send. Success does
not observe; presenter throws stay on the normal Express error path; observer
faults are isolated and cannot replace or duplicate cookie/status/envelope
output.

The generic mechanism is complete and inactive. The auth and Orders owners
must adopt the two new profile fields and remove their explicit no-selection
gates before topology binding; no live profile was added by S1c.

```text
HTTP host unit / topology unit:                         30 / 50 passed
Access Experience verifier:                       2 files / 7 passed
cellular architecture rules:                                  5 passed
scoped graph:                  55 modules / 121 edges / zero violations
live HTTP profiles / CLI commands:                           0 / 0
typecheck / lint / build / freshness / Prettier:            passed
```

### T6 S4 inactive Pricing authority

`@pressly/pricing-system` now owns exactly three inactive cells: public catalog
load, side-effect-free change planning and transactional change publication.
The cells preserve response envelopes, canonical dates, metadata projection,
failure/status/details presentation, 16 KiB write bodies, author context and
body-derived `pricing:<service>:global` authorization scope.

The target retains every observed Pricing quirk. Empty catalogs are valid.
Publish has no idempotency receipt: the first publish succeeds and replay is a
`pricing_change_has_no_changes` policy rejection. The service advisory lock
and current pricing-set UUID are the concurrency/version fence; publication
archives the old set, writes the full replacement and items, and records actor
audit in one rollback-safe transaction.

Legacy public-router/target PostgreSQL proof found no drift in catalog, plan,
publish, replay, audit, replacement items or injected-audit rollback. The DB
seed versus Web static fallback mismatch remains intentionally unchanged:
delivery is 495 cents versus 0, and Hang Dry is 295 cents versus 395. No
Stripe, payment, billing, checkout or new pricing data was introduced.

The first native run incorrectly reused the shared test database and was
rejected as evidence. The complete five-test target suite was rerun on a
process-unique template0 database with all migrations, explicit runtime/reset
URLs and exact-name force-drop/absence verification. Pricing remains
unselected while pre-auth validation is completed in the HTTP profile host.

```text
legacy Pricing unit / PostgreSQL:                         29 / 7 passed
target unit / native PostgreSQL:                           7 / 5 passed
verifier unit / legacy-target PostgreSQL:                  4 / 2 passed
scoped graph:                  54 modules / 168 edges / zero violations
unique native and conformance databases:          force-dropped / absent
typecheck / lint / build / freshness / Prettier:            passed
```

### T6 S5 inactive Access-facing Experiences

Realm-specific presentation now lives above Access rather than overloading
one system operation with incompatible transports. Customer owns eleven
general bearer routes, Control owns eleven Control-cookie authentication
routes plus one headless resolver and twenty-seven administration routes, and
Processor owns four server-only Processor-cookie routes. All 53 HTTP cells
have strict contracts and exact paths, methods, observed 4/8/16/64 KiB
limits, validation phases, request-rate providers, origin/CSRF, no-store,
context, authorization, envelopes, trace IDs and cookie mutations.

S1b turns the original repeated-cookie, request-rate and validation-order gaps
into positive generic-host proofs. Control and Processor preserve independent
`Set-Cookie` fields rather than concatenating them. The profiled-host test
executes request rate, parsing, origin, validation/context and execution in
order and verifies no-store plus multi-cookie presentation.

S1c now represents both narrower protocol facts rather than leaving blockers.
Eighteen nominally bodyless operations use conditional parse-if-JSON behavior:
declared malformed JSON is rejected, while missing and non-JSON bodies pass.
Eight Control/Processor session and invitation operations declare the exact
cookie-failure observer. All prior blocker lists are empty; selection remains
zero only because the atomic topology/API/legacy cutover has not happened.

The Control resolver preserves the legacy two-query short circuit by calling
Access grants first and locations only for the single chosen business. The 27
administration cells inject only narrow public Access, Customers and Orders
execute capabilities. Public differential proof covers all 23 legacy Control
operations; it found and fixed owner capability ordering and the invitation
MFA missing-cookie code before acceptance.

One invariant-only distinction remains outside reachable successful inputs.
If a supposedly valid bootstrap session violates its own contract by omitting
`sessionId`, both paths revoke and throw, but the old Express response also
clears a cookie before throwing. A headless throwable cannot carry that
header. This is not selected silently: the atomic cutover must either accept
the impossible-path distinction or first add an explicit throwable-header
mechanism.

```text
Customer / Control / Processor HTTP cells:                 11 / 38 / 4
Control headless resolver / total Control cells:                 1 / 39
Customer / Control / Processor package tests:              2 / 10 / 53
Access-Experience verifier tests:                                  17
focused files / tests:                                      80 / 218
scoped graph:                 341 modules / 1384 edges / zero violations
cellular architecture rules:                                      5 passed
live selected Access Experience operations:                             0
typecheck / lint / build / Prettier:                             passed
```

### T6 S5b browser-host entrypoint cutover

Three process-neutral browser lifecycle owners are now the live app
entrypoints. The Customer host owns only idempotent injected instrumentation
startup and teardown: Next retains React Server Components, hydration,
routing, global errors, `onRouterTransitionStart` and Strict Mode. Control and
Processor each mount once through an isolated React DOM lifecycle with
explicit environment injection, single-root reservation, deterministic
startup, cleanup, HMR disposal and observed failure normalization. They do not
depend on each other.

The browser hosts import no system, Experience, contract, generated catalog or
topology package. Source readback finds one host start per app, zero
app-authored `createRoot` or `hydrateRoot`, one Sentry initialization and one
PostHog initialization. Existing production Dockerfiles and Turbo dependency
closure built the new hosts without a Docker, Compose or CI change.

The production-image Chromium harness now includes Web behind local HTTPS. It
proves server-rendered HTML, an explicit hydrated client interaction and a
same-document Next navigation in addition to all nine existing Control and
Processor authentication, session, journey and mobile cases. Two earlier
diagnostic runs correctly failed on assertions made before hydration; the
final test waits for and exercises a client dropdown before checking the
single-document navigation. Every isolated project was fully removed.

```text
Customer / Control / Processor host tests:              11 / 12 / 12
Control / Processor / Web app tests:                    87 / 293 / 55
scoped graph:                     53 modules / 64 edges / zero violations
cellular architecture rules:                                      5 passed
Chromium production-image smoke:                               10 / 10 passed
smoke residual containers / networks / volumes / images:       0 / 0 / 0 / 0
typecheck / lint / build / freshness / Prettier:                 passed
```

### T6 S5c generated browser-protocol cutover

All three browser applications now consume operation metadata from the
checked topology rather than retaining a second route registry. Control uses
its 38 generated Experience operations through six feature-owned browser
clients. Processor uses four generated authentication operations and exactly
the four incoming-proposal Orders operations present in its UI port. Web uses
the public Pricing operation through a Customer Experience browser client.

The app-owned request adapters still own fetch, cookies, CSRF token state,
unauthorized notification, abort signals, Next request caching and error
observation. Experience clients own path rendering and strict owner wire
decoding. Serialized dates remain UTC strings at the browser boundary. The
Control destination allowlist stays Experience-owned, including invitation
bootstrap destinations.

Web retains React request caching, one-hour revalidation with the `pricing`
tag and Docker `staticOnly` behavior. The deliberate product-data mismatch is
unchanged: DB delivery/Hang Dry are 495/295 cents while the Web static fallback
remains 0/395. Processor's six server-only Orders operations were not exposed
to its browser simply because target cells exist.

The two handwritten Processor auth/Orders adapters and six Control
route-building factories/tests are deleted. Control keeps only the UI port
declarations required by views and models. Residual scans find no migrated
handwritten route strings, old factory imports, deleted Processor adapter
names or Date-return wire drift.

```text
generated Customer / Control / Processor inventories:       12 / 38 / 43
Control / Processor / Web app tests:                       66 / 294 / 59
Control / Processor / Customer Experience tests:            38 / 67 / 4
Access / Pricing / topology verifier tests:                  20 / 5 / 53
scoped graph:                     82 modules / 124 edges / zero violations
typecheck / lint / production builds / freshness:                    passed
```

An intentionally broad diagnostic also exposed an existing
`control-app.tsx` to `workspace-content.tsx` UI import cycle outside the
changed client slice. Official architecture rules and the changed-slice graph
are green; the cycle remains explicit input to final T8 enforcement rather
than being silently expanded into this protocol cutover.

### T6 S6 inactive complete Orders authority

`@pressly/orders-system` now owns all nineteen T5/T6 operations. The twelve
new inactive cells list, accept, reject and restore incoming proposals; create,
correct, complete and cancel canonical Orders; release and withdraw
fulfillment; and get/list canonical Orders. None is selected or exposed in a
host.

The assembly boundary is explicit. `makeOrdersIntegrationSystem` owns only the
seven Customer-independent T5 intake/outbox cells used by Worker and durable
flow verification. Full `makeOrdersSystem` composes that owner with the twelve
T6 cells and requires three versioned Customers capabilities. It never
constructs Customers or imports its root, schema or cells.

Proposal acceptance invokes exact-source Customer resolution inside the
existing Orders transaction after the same command/source/proposal locks and
exact-order check. Create/correct invoke Customer existence at their legacy
reference-check points. Canonical get/list compose the Customer relation,
join, projection and search plan into the same SQL statement before unchanged
cursor ordering and limit.

The differential found and fixed one real target leak before acceptance:
canonical detail exposed persistence-only item id, businessId and orderId.
The projector now emits only canonical item fields. Complete public outcomes
and durable state then matched across all scenarios; no remaining semantic
drift was found.

```text
Orders-system unit:                            20 files / 87 passed
Orders verifier unit:                           1 file / 2 passed
T6 native / legacy-target PostgreSQL:                  7 / 4 passed
existing T5 Orders PostgreSQL:                           19 passed
legacy Orders unit / focused PostgreSQL:              34 / 15 passed
Worker unit / durable caller PG:                66 / 10 / 8 / 18 passed
Orders production graph:    122 modules / 571 edges / zero violations
explicit temporary databases:                8 force-dropped / absent
typecheck / lint / build / Prettier:                         passed
```

### T6 S1b complete realm-neutral HTTP protocol

The profiled HTTP host now covers the three protocol facts that initially
blocked auth and Pricing Experience selection. `HttpResponse` supports
lossless scalar or repeated header values, including two independent
`Set-Cookie` fields. Profiles distinguish unauthenticated request/IP rate
limiting from authenticated identity limiting. They also declare whether the
surface validator runs before authentication, after authentication or after
authorization.

Validation is memoized per request and never moves context-dependent input
construction, contract decoding or after-input authorization ahead of
authentication. This preserves Pricing's malformed-body-before-bearer order
and the auth realms' exact parser/validation points without exposing actor
context early. Tests cover all three validation phases, both rate-limit
classes, repeated cookies, staged scope, decoded-input authorization,
compatibility rejection and deterministic generation.

The candidate remains inactive. Customer and Control profile constructors
compile against the completed algebra, while Processor presentation is still
being written. The live topology remains at 65 operations, 35 HTTP routes,
two jobs in webhook-before-outbox order and zero profiles/bindings; its route
digest is unchanged.

```text
HTTP host unit / topology unit:                         26 / 44 passed
cellular architecture rules:                                  5 passed
scoped graph:                  99 modules / 290 edges / zero violations
live profile declarations / bindings:                         0 / 0
live route digest: 03878a4bca88395d383b56139f9f7eeeac56dd614bf49765ad229663e864f0d8
typecheck / lint / build / freshness / Prettier:            passed
```

### T6 S2b Customers-to-Orders transaction capabilities

Customers now exposes the remaining bounded same-database seams needed before
Orders can stop importing Customer schema. `customers.customer-exists.v1`
checks exact business and Customer identity inside the caller's transaction.
`customers.canonical-order-customer-read.v1` contributes only the immutable
Customer relation, projection, exact join, combined Order-display-plus-
Customer search predicate and nullable row projector required by canonical
Order reads.

The read plan exports no Customer table, generic executor or query-builder
escape hatch. Orders will retain its query, due/id cursor, ordering and limit,
while topology injects the Customer-owned plan into the same SQL statement.
This preserves the current joined snapshot and pre-pagination search rather
than replacing them with a second public Customer call. T7 may replace the
physical relation without changing the versioned capability.

```text
Customers unit / verifier unit:                          14 / 2 passed
native PostgreSQL / conformance:                        10 / 7 passed
scoped graph:                  61 modules / 229 edges / zero violations
temporary databases:                       4 force-dropped / absent
typecheck / lint / build / Prettier:                         passed
```

### T6 S3 inactive Access authority

`@pressly/access-system` now owns all twenty-five Identity operations, the
five Authorization policy families and five effectful scope queries. Its 30
headless cells are real declarations and bindings—17 commands and 13
queries—rather than a parallel ID registry. Twenty require transactions, ten
are partitioned, four optimistic and eight idempotent. Public assembly also
exposes canonical policy/resource construction and the transitional
`production_locations` ancestry/visibility reads without importing another
system.

Access boundary contracts serialize every Date to canonical UTC ISO and
decode it back to the application model. They reject native Dates and offset
timestamps on the serialized side, explicit undefined, cycles, non-finite
numbers and non-plain values. The contract catalog is derived from the 30
declarations. All cells remain inactive and surface-free because the same
Access behavior is presented through distinct general-bearer, Control-cookie
and Processor-cookie realms; those 11, 38 and 4 routes are now a separate
Experience migration slice.

Public comparison covers 2,432 paired policy decisions, all five scope queries,
capability projection and seventeen bootstrap/workforce operations. Session
PostgreSQL parity covers bootstrap, login, load, challenge rejection, revoke
and reload. No behavior drift was found.

The three added scope cells preserve the legacy Control and Processor splits rather
than hiding it in one wider query: effective active grants are loaded first,
Control requires exactly one owner/manager business, and only then are active
locations loaded for that business. Processor loads active Production locations
through the exact active-business inner join and business/name order before its
Experience-owned capability projection. This keeps the no-business and
multi-business paths from performing the location read while retaining the
exact active-window, membership, business, slug and location ordering rules.

```text
Access unit:                              40 files / 142 passed
public conformance / session PG:                        4 / 1 passed
native PostgreSQL:                                          5 passed
Access credential graph:     309 modules / 1243 edges / zero violations
temporary databases:                       3 force-dropped / absent
typecheck / lint / build / Prettier:                         passed
```

### T5 S3 order-outbox single-binding cutover and deletion

`production.apply-fulfillment-demand.v1` is now the only `order_outbox`
business handler. The generated catalog contains exactly that one job
registration. The Worker binds it once after the still-legacy
`webhook_ingestion` pass inside one generic sequential loop and one process
heartbeat; startup rejects any catalog cardinality/identity mismatch and any
runtime attempt limit other than the declared eight.

The Worker-owned delivery adapter preserves durable invalid-event rejection,
non-wash-fold completion, the exact projection hash and mapped command,
`external_estimate` normalization, bag count and
`order-outbox:<eventId>` idempotency. Queue adapters preserve lease fences,
complete/retry/dead-letter presentation and fail-open backlog sampling after
the complete pass. Production consumes the exact Orders-owned public message
contract object; its duplicate descriptor is gone.

The five legacy Orders outbox leaves, legacy Worker projection job/mapper and
legacy Production apply-demand leaf/wiring/tests are deleted. Both migration
proofs are permanent target-only conformance and their temporary legacy
dependencies are removed. A real generated-registration/app-adapter flow
proves that a crash after the Production commit but before acknowledgement is
reclaimed and replays one durable effect.

Cancellation now signals but awaits a non-cooperative invocation before
withholding acknowledgement. This intentional wait-for-settlement correction
prevents database shutdown from racing a detached mutation; redelivery remains
safe. Typed failure presentation also carries a business-neutral category and
status so terminal Worker reporting retains validation/conflict/not-found/
external-service meaning without a business switch in platform or host.

```text
Worker unit:                                      13 files / 90 passed
platform jobs / jobs-host unit:                          19 / 7 passed
Orders-system unit / native PostgreSQL:                  82 / 19 passed
legacy Orders unit / PostgreSQL:                         39 / 15 passed
Production-system unit:                                     1025 passed
legacy Production unit / PostgreSQL:                      13 / 5 passed
Orders outbox / apply-demand conformance:                 10 / 30 passed
crash-after-commit-before-ack flow:                            1 passed
cellular graph:                1062 modules / 4926 edges / zero violations
six template0+migrated databases:                  force-dropped / absent
typecheck / lint / build / architecture / Prettier:              passed
```

### T5 S4 inactive Ingress state authority

`@pressly/ingress-system` now owns all thirteen source-neutral durable Ingress
operations: receipt capture/link/purge, inbox ingest/claim/measure/complete/
retry/dead-letter/list/replay, and source-location resolve/reconcile. Every
cell is headless and inactive. The system composes only strict contracts,
operation executors and adapters over the existing shared PostgreSQL tables;
no API, CLI, Worker, topology, generated catalog or legacy binding changed.

Public legacy/target verification covers all thirteen operations plus
two-worker claim fencing, crash-window replay, invalid stored-payload rollback,
ignored-event state, quarantine lifecycle, inactive binding lookup and exact
database failure presentation. No behavioral drift was found. The later live
cutover still needs one Ingress-owned process-inbound-event reaction, the
source-specific Cents adapter, target Orders proposal/source-close cells and
the one-and-only `webhook_ingestion` queue binding.

```text
Ingress-system unit/contracts:                       16 files / 54 passed
Ingress-system native PostgreSQL:                      1 file / 11 passed
legacy/target Ingress differential:                     1 file / 9 passed
cellular graph:                 1023 modules / 4738 edges / zero violations
topology / cellular rules:                                  38 / 5 passed
fresh template0+migrated databases:                  force-dropped / absent
typecheck / lint / build / architecture / Prettier:              passed
```

### T5 S4-S5 webhook reaction cutover contract

The post-shadow audit established the exact remaining runtime boundary. The
API must retain content-type validation, a raw 256 KiB body, timestamped HMAC
over the raw bytes, JSON parsing only after authentication, Cents
normalization, optional AES-256-GCM receipt capture, durable ingest, receipt
link and the deployed 202 envelope. Capture-before-ingest and
ingest-before-link crash windows remain deliberate and exact redelivery heals
both.

The missing deployable unit is one Ingress-owned
`ingress.process-inbound-event.v1` reaction on `webhook_ingestion`. Its input
contains only the claimed durable event; worker ID, attempt and recovered-lease
facts remain in the app-owned queue receipt. The reaction owns source/subject
dispatch and the exact submitted-versus-terminal downstream sequence through
narrow injected target Orders proposal/source-close and Production
source-closed capabilities. Unsupported states acknowledge without parsing;
expected input and Orders failures are permanent; the deployed Production
not-found outcome remains retryable `production_projection_pending`.

The audit also found two generic-runtime defects before activation. Queue
maintenance must run fail-open after the complete pass, including failures,
and cancellation must signal but await a non-cooperative database mutation
instead of racing away and closing its pool. Both are now required T5 gates.
Per-source webhook processing latency remains app-owned presentation around
the generated invocation. T5 scope was expanded to the exact API, CLI,
Production composition, generated architecture, verifier and package files
needed for atomic cutover/deletion. No database migration or second process is
required.

```text
target job order:     ingress.process-inbound-event -> production.apply-demand
durable queue order:                      webhook_ingestion -> order_outbox
process model:                 one sequential loop -> one progress heartbeat
legacy deletion gate:      two generated registrations / zero legacy handlers
```

### T5 S4b inactive Ingress processing reaction

Ingress now owns the inactive `ingress.process-inbound-event.v1` reaction and
the producer-owned `ingress.webhook-event-ready.v1` internal contract. The
ingest declaration emits and the reaction consumes the same contract object.
Its job declaration targets `webhook_ingestion`, requires event-ID
idempotency, partitions by source plus subject/event identity, and carries the
deployed eight-attempt bounded-jitter/retained-dead-letter policy.

The strict reaction payload excludes worker, attempt and recovered-lease
mechanics. Source-specific Cents parsing reuses the canonical
`@pressly/contracts/cents` schemas; only decision, identity, weight and
downstream command mapping remain leaf-owned. The executor preserves ignored
subjects/statuses, stored payload/identity/revision failures, exact active
binding lookup, submitted proposal mapping, terminal close-before-Production
sequencing, the retryable Production projection-pending quirk, and permanent
Orders/input presentation. It has only narrow structurally injected
capabilities and imports no peer runtime, model, cell or schema.

The public boundary now explicitly separates the thirteen-cell
`makeIngressStateSystem` used by state-only API/CLI/verifiers from canonical
`makeIngressSystem`, which requires the narrow downstream capabilities and
adds the reaction as cell fourteen. Neither assembly is selected by topology
or used by an app yet, so the deployed legacy Worker remains the only
`webhook_ingestion` consumer.

```text
Ingress-system unit/contracts:                    21 files / 107 passed
Ingress native / legacy-target PostgreSQL:                    11 / 9 passed
unchanged legacy Worker ingress characterization:   3 files / 30 passed
scoped graph:                   126 modules / 469 edges / zero violations
typecheck / lint / build / Prettier / frozen install:          passed
topology / cellular rules / generated freshness:       38 / 5 / passed
three template0+migrated databases:                  force-dropped / absent
```

### T5 S4c inactive Orders intake authority

Orders now owns and assembles the inactive headless
`orders.propose-incoming-order.v1` and
`orders.close-incoming-order-source.v1` cells. Shared source identity,
proposal/tombstone/canonical lookup and transition persistence is owned by the
precise incoming-order model/PostgreSQL seam earned by these two consumers;
the leaves do not import each other.

Public legacy/target PostgreSQL proof found no product drift. Proposal
validation, source advisory locking, canonical -> tombstone -> existing
proposal precedence, generated identity replay and exact stored bytes match.
Close preserves its one clock read and one transaction, source then proposal
lock order, tombstone-before-canonical behavior, lifecycle outcomes, command
hash/idempotency/event bytes and canonical fulfillment return. Same-source
races and fail-closed corruption match. A first cast-based pseudo-rollback
test was rejected and replaced with a valid-command transition-insert fault
after tombstone creation and proposal CAS, proving the entire mutation rolls
back in both implementations.

Both cells remain absent from topology, generated catalogs, apps, hosts and
the live Worker. The legacy Orders intake implementation remains until the
single `webhook_ingestion` binding cutover.

```text
Orders-system unit:                               19 files / 82 passed
incoming-intake native / differential PostgreSQL:          8 / 8 passed
remaining legacy Orders unit:                     15 files / 39 passed
cellular graph:                1062 modules / 4926 edges / zero violations
topology / cellular rules / generated freshness:       38 / 5 / passed
three template0+migrated databases:                  force-dropped / absent
typecheck / lint / build / architecture / Prettier:              passed
```

### T5 S4d inactive Production source-closure authority

`production.resolve-source-closed-fulfillment.v1` is now explicitly public
and assembled headlessly in `makeProductionSystem`. Its leaf-owned candidate
reader is composed through a narrow structural capability to the already
assembled change-order-resolution cell; it imports no sibling implementation
and adds no independent cross-system transaction or signal path.

Twenty public legacy/target PostgreSQL cases found no behavior drift across
missing/location/fulfillment lookup, every review reason, already-resolved,
exact and divergent receipt replay, same- and distinct-key races, late CAS,
event rollback, outer database mapping and owned AppError preservation. Full
order/demand/event/live/outbox state, clock/ID use, the nested command,
transaction telemetry and zero signals match. The target remains absent from
topology/generated output and the legacy Worker/source leaf remains the sole
live binding until S5.

```text
source-closed public differential PostgreSQL:                 20 passed
Production-system unit:                       236 files / 1025 passed
cellular graph:                1062 modules / 4936 edges / zero violations
topology / cellular rules / generated freshness:       38 / 5 / passed
two template0+migrated databases:                    force-dropped / absent
typecheck / lint / build / architecture / Prettier:              passed
```

### T5 S4e API and CLI Ingress state cutover

The API and production-bootstrap CLI now construct
`makeIngressStateSystem`; neither imports the legacy Ingress package. The
Cents route receives only ingest/capture/link executes and retains content
type, raw 256 KiB parsing, HMAC, normalization, optional encrypted capture,
durable ingest, receipt link and 202 ordering. Dead-list/replay receive only
their exact target cells and retain Processor authentication, Production
resource authorization, cursor/privacy/envelope/status/failure behavior.

The CLI injects only reconciliation execute and preserves the deployed
non-atomic order: Production preview, binding preview, Production apply, then
binding apply. Production replay still returns its original created
operations with `replayed:true`; binding reconciliation independently returns
`noop`. No behavior drift was found. The legacy Ingress package remains only
for the live Worker until the queue cutover.

```text
API / CLI unit:                                  269 / 44 passed
focused Cents/dead/CLI protocol:                  97 + 4 passed
Ingress native / differential PostgreSQL:            11 / 9 passed
cellular graph:                1062 modules / 4936 edges / zero violations
topology / cellular rules / generated freshness:       38 / 5 / passed
typecheck / lint / build / architecture:                     passed
seven explicit databases:                         force-dropped / absent
```

The first native/differential invocation used names without the required
`_test` suffix and was safely refused before executing a test. Corrected fresh
template0+migrated databases passed; the catalog query over all seven exact
names returned zero rows.

### T5 S4f inactive Worker webhook queue adapter

The Worker now has an inactive app-owned adapter for the generated Ingress
reaction. It maps one target claim into a business-only
`WebhookEventReadyV1` payload and an opaque receipt containing event, worker,
attempt, recovered-lease and source facts. Queue code owns claim recovery,
complete/retry/dead fences, lease-loss presentation, terminal reporting and
fail-open backlog-then-quarantine-purge maintenance. A narrow registration
wrapper preserves per-source processing latency around the actual generated
invocation.

The generic retry boundary now passes its already-computed delay to the queue,
eliminating a second clock read and preserving the exact logged delay. Tests
cover batch continuation, every transition and lease-loss branch, recovery,
maintenance cadence/fail-open behavior, exact receipt/payload mapping,
failure presentation and a two-registration webhook-first/outbox-second
single-loop/heartbeat shape.

The adapter remains unreferenced by Worker bootstrap and generated output
still contains only the live `order_outbox` job, so no second webhook handler
exists before S5.

```text
target webhook adapter focused:                     4 files / 18 passed
full Worker unit:                                  17 files / 108 passed
platform jobs / jobs-host unit:                           19 / 7 passed
cellular graph:                1062 modules / 4936 edges / zero violations
typecheck / lint / build / architecture / Prettier:              passed
```

### T5 S4g webhook cross-system flow conformance

The actual deployed legacy Worker path and the complete target path matched
across seventeen real-PostgreSQL scenarios before cutover. The permanent suite
now runs target-only against the actual generated two-entry job catalog,
jobs-host registrations, full Ingress/Orders/Production owners, app-owned
queue/delivery/latency adapters and generic sequential runtime; it contains no
test-local catalog or legacy package/runner.

Coverage includes submitted proposals, duplicate and crash-before-ack
redelivery, ignored subjects/statuses, all permanent stored-event failures,
terminal-before-submitted tombstones, accepted-before-Production retry,
resolved/already-resolved/review-required source closure, unexpected retry,
attempt-eight dead letter, expired lease recovery, all three transition lease
losses, batch continuation, post-pass backlog/purge, transition rollback and
same-source concurrency. The earlier order-outbox crash flow was also hardened
to self-provision its own database.

```text
webhook target conformance / outbox redelivery:               17 / 1 passed
full flow-verification PostgreSQL:                        2 files / 18 passed
actual generated job catalog entries:                                  2
three unique template0+migrated databases:             force-dropped / absent
lint / typecheck / build / Prettier / diff check:                  passed
```

### T4 start-schedule cutover and deletion

`production.start-schedule.v1` is now the only schedule-start writer. The
target boundary gained exact staged scope decoding and preserves
authentication -> body -> params -> `production:start` -> actor/full decode.
Its private accepted-schedule loader now consumes canonical system-owned
scheduling JSON and model types without importing a sibling cell.

Twenty-eight public legacy/target PostgreSQL scenarios matched the complete
two-batch, eight-stage, four-assignment and eight-attempt graph; exact ID
allocation; sequential and concurrent replay/divergence; lifecycle, snapshot,
selection, coverage and window guards; every order/run/receipt/JSON rollback;
work-event receipt; live revision; no outbox; clock reads; and post-commit
signal behavior. Added native tests reach same-key second-check divergence,
the different-key race and corrupt persisted scheduling rows.

Topology now selects the target cell. The Processor uses an Experience-owned
generated client and the API generic catalog owns the route. Legacy route,
application/repository/security/memory wiring, seven source files and four
start-only tests are deleted. Permanent target-only conformance retains all
twenty-eight scenarios and the finite transaction token remains
`production.start_schedule`.

The result-aware target unit of work classifies typed failures as
`expected_rollback`; the deleted legacy unit recorded pre-commit failures as
committed and thrown late CAS as failed. Durable outcomes remain equal. One
initial conformance rerun misspelled the reset environment variable and was
safely refused; the correctly bound unique-database run passed and no shared
database was touched.

```text
start focused unit/native PostgreSQL:                 24 / 9 passed
legacy/target then permanent conformance:            28 / 28 passed
Production-system / residual Production unit:      1025 / 63 passed
Experience / Processor unit:                          48 / 289 passed
cellular graph:                 854 modules, 4059 dependencies, zero violations
temporary database:                   force-dropped and verified absent
```

### T4 replace-shift-selection cutover and deletion

`production.replace-shift-selection.v1` is now the sole shift-selection
writer. The parity audit found one boundary defect before activation: the
target HTTP surface lacked prevalidation and a validated path-scope decoder.
It now preserves authentication -> body -> params -> `production:schedule`
-> actor/full decode.

Twenty-three public legacy/target PostgreSQL scenarios matched the v0 create
and subsequent version CAS, canonical selection ordering, audited identical
no-op, current-plan supersession, before/after-lock replay and divergence,
same/different-key races, lifecycle/readiness guards, late CAS/receipt
rollback, work-event receipt, live revision, no outbox, and post-commit signal
timing. The otherwise unreachable invalid-current-plan policy branch remains
covered by the target decision tests.

Topology selects the target cell and generated Processor metadata. An
Experience-owned client replaces the handwritten URL/schema branch, while the
API catalog proves success, validation, denial, not-found and conflict
presentation. The legacy leaf, route, repository, tests, manifest,
composition and memory writer are deleted; residual callers execute
`cells.replaceShiftSelection`. Permanent conformance retains all twenty-three
scenarios.

The target result-aware unit of work reports expected failures as
`expected_rollback`; the removed legacy unit recorded ordinary returned guards
and CAS failures as committed and its thrown schedule CAS as failed. Durable
behavior is equal.

```text
replace focused unit/native PostgreSQL:               38 / 8 passed
legacy/target then permanent conformance:            23 / 23 passed
residual Production unit/PostgreSQL:                 61 / 12 passed
Experience / Processor / API focused:                1 / 15 / 10 passed
topology tests / generated freshness:                       38 / passed
temporary databases:                 force-dropped and verified absent
```

### T5 pre-implementation authority and cutover audit

A read-only traversal reconciled the T5 plan with the deployed Worker. There
are thirteen Webhook Ingestion capabilities, seven Orders capabilities in the
T5 subset, two queue jobs in one sequential Worker loop, three relevant API
routes and two remaining Production reaction capabilities. The target apply
reaction is assembled but unselected; the generated job catalog is empty.

The audit rejected both a second Worker and an operation-aware generic host.
The migration will retain one process and cut over one queue binding at a
time. `platform/jobs` may own only the observed loop, retry, dead-letter,
cancellation, lifecycle and telemetry mechanisms. App-owned queue adapters
retain raw Cents verification and Orders-event mapping; cell-owned job failure
presentation is propagated through generated registrations so neither host nor
platform switches on Pressly operation identity.

Current behavior also has no lease-renewal heartbeat: its heartbeat records
successful process progress after the composite pass. T5 must preserve that
fact rather than silently add claim renewal. The eight-attempt declaration
must become authoritative, or Worker startup must reject a conflicting
runtime value.

The original T5 write allowlist omitted Worker, API, CLI and the legacy module
bindings that its own atomic-cutover requirement must change. `network.yaml`
now names those exact transitional surfaces, the narrow `platform/cells` job
presentation seam, generated/topology package edges, root manifests and the
flow-verification surface. T5 remains pending until T4 commits.

### T4 canonical Production scheduling algorithms

Scheduling algorithms needed by more than one target leaf now have exact
Production-system owners rather than a legacy feature or registry acting as
their hidden authority. `fixed-pulse-planning` owns the capacity, ordering,
machine-selection, stage-window and FFD primitives; `fixed-pulse-demand-outlook`
owns the demand forecast; and `online-order-placement` owns the deterministic
v1 proposal. Legacy scheduling delegates import those authorities during the
remaining cutover window, and the old duplicate algorithm sources and tests
are deleted.

The system composition now supplies the real algorithms to workspace and
remaining-day forecast by default. Their accepted public differentials were
rerun without fixture schedulers, and all twenty-three cases remained equal.
The unchanged automatic, exact and overtime placement PostgreSQL suites also
remained green. Golden canonical JSON and hashes pin the wire-sensitive online
input, placement proposal and fixed-pulse schedule output, so later cleanup
cannot silently change idempotency or stored scheduling bytes.

```text
canonical model tests:                                  19 passed
legacy redirect algorithm tests:                        11 passed
workspace/forecast real-algorithm differential:      11 / 12 passed
target query / placement PostgreSQL:                 20 / 41 passed
Production-system unit:                                  998 passed
temporary database:                   force-dropped and verified absent
```

### T4 create-schedule canonical authority, cutover and deletion

`production.create-schedule.v1` now owns schedule proposal creation from the
HTTP boundary through PostgreSQL. Before activation, the target gained the
staged body-then-params authorization boundary, the real canonical
fixed-pulse-v2 algorithm, and strict scheduling input/output JSON validation
both before persistence and when reading database-returned rows. Post-commit
signal faults now retain the legacy `schedule_create_failed` mapping.

Twenty-two public legacy/target PostgreSQL scenarios matched real v2 output,
v1 and malformed replay behavior, divergence, selection changes, readiness
and window failures, same/different-key and cross-location races, every late
CAS/ID/event/corrupt-return rollback, signals, clock and ID order, work-event
receipt, live revision and no outbox. Golden canonical input/output bytes and
hashes are owned by the Production scheduling model.

Topology now selects the target cell. The Processor uses an Experience-owned
generated client, the API generic catalog preserves
body -> params -> `production:schedule` -> actor ordering, and the LPMS direct
caller uses `cells.createSchedule`. The legacy seven-file leaf, route,
repository, manifest ownership and duplicate algorithm/model/codec sources are
deleted. Scheduling verification is permanent target-only create conformance.

The result-aware unit of work intentionally records expected failures as
`expected_rollback`; the removed ordinary legacy unit of work had recorded
ordinary expected failures as committed and thrown CAS as failed. Durable
behavior is unchanged. Two remaining legacy algorithm findings are owned only
by the still-live placement bundle and therefore remain its deletion gate.

```text
create legacy/target then permanent conformance:         22 / 22 passed
Production-system / residual Production unit:          1012 / 67 passed
residual Production PostgreSQL:                                12 passed
Experience / Processor / API unit:                    47 / 288 / 250 passed
topology tests / generated freshness / architecture lint:          passed
temporary databases:                 force-dropped and verified absent
```

### T4 seven-query legacy deletion and permanent conformance

The Processor Experience query activation now has one authority all the way
through source ownership. The five remaining legacy Production query leaves,
their board/history foundations and now-unused due-date/order-list language
were deleted. Legacy application, composition, repository and memory query
slots are gone; residual integration callers execute the headless target cells
or assert the state they own instead of retaining duplicate read projectors.

The old Processor operational-order identity/audit feature stack and dormant
API Processor routers, mappers and tests were also deleted. Only the
session-access portion of the old Processor module remains for a later Access
migration. Query verification is permanent target-only conformance and no
longer depends on `@pressly/production`; its matrix anchors the Production
cells, Processor Experience, API adapter/composition and generated clients.

The final clean-database run exposed six residual Production PostgreSQL suites
that had inherited the deterministic business account from file order. Each
now resets and seeds that prerequisite locally. All six passed alone, then the
API adapter, all query conformance and the residual Production suite passed in
that order on the same database, proving the result is no longer order
dependent. No global setup or external preseed was introduced.

```text
query verification unit/PostgreSQL:                   13 / 77 passed
API adapter PostgreSQL:                                    2 passed
residual Production unit/PostgreSQL:                    71 / 12 passed
API / residual Processor unit:                         246 / 2 passed
legacy and cellular architecture/topology/freshness:          passed
temporary databases:                 force-dropped and verified absent
```

### T4 seven-query Processor Experience activation

The seven Processor projections now have one Experience-owned server slice at
`@pressly/experience-processor/server`: history activity, history run, order
control, board, backlog preview, workspace and remaining-day forecast. The
slice depends on narrow Production execution capabilities plus app-injected
canonical-order and bounded-audit facts. It contains no PostgreSQL, Drizzle,
system runtime or Node process dependency; the concrete cross-schema resolver
remains an API-owned transitional adapter.

Topology selects the seven headless Production cells as dependencies and the
seven Experience HTTP cells as the sole route owners. Generated browser
metadata includes Experience-owned HTTP cells without pretending they are
self-consumers, while headless and job-only cells remain excluded. API
composition passes both owners to the catalog and no longer mounts the two
handwritten Processor routers or five legacy Production query routes.

Seven browser clients now consume the generated Processor operation metadata
and canonical Contracts schemas. The Processor app injects them through its
existing port; handwritten URLs and response decoders are gone while browser
fetch, authentication, UI state and orchestration remain app-owned. The
remaining legacy query source deletion and permanent verifier conversion are
still running and are not claimed by this checkpoint.

```text
Experience / Processor / API unit:                  46 / 287 / 257 passed
API generic-host query coverage:                               35 passed
API identity/audit adapter PostgreSQL:                          2 passed
topology tests / selected route owner count:                 38 / 7 passed
cellular graph:                 836 modules, 3885 dependencies, zero violations
browser/server forbidden dependency audits:                    zero
temporary database:                   force-dropped and verified absent
```

### T4 list-order-control base-query cutover and deletion

The Processor order-control presentation now reads Production truth through
`cells.listOrderControl.execute`. The manual Processor route remains the sole
HTTP/identity/audit owner until the seven-route Experience batch lands, but
the underlying Production query is target-only. Authentication, strict query
then params validation, location-scoped `production:read`, the intentional
non-transactional mixed snapshot, identity/audit composition and final
Processor schema remain unchanged.

Exact boundary regressions preserve success, invalid/auth short-circuiting,
the plain typed-failure to 500 `unknown_thrown_value` quirk, thrown AppError
status/code and identity-resolution failure. The seven-case differential is
permanent target conformance.

The nine-file legacy leaf, four focused tests and the now-single-consumer
legacy `postgres/orders` and `language/resolution` foundations were deleted.
Composition/application/public/memory slots and two residual Production
callers use the target cell. With those deletions the legacy architecture
allowlist is green again; no single-consumer foundation was relocated merely
to bridge the migration.

```text
API unit:                                             247 passed
Production unit/PostgreSQL:                       151 / 23 passed
query verification unit/PostgreSQL:                13 / 77 passed
cellular graph:                  793 modules, zero dependency violations
topology/rules/generated freshness:                 37 / 5 / passed
architecture check/lint:                                  passed
temporary database:                   force-dropped and verified absent
```

### T4 commit-order-route cutover and deletion

`production.commit-order-route.v1` now owns the remaining route mutation.
Twenty public legacy/target PostgreSQL scenarios matched queued and in-flight
graphs, proposal/hash recomputation, double replay, every policy fence, same-
and different-key races, membership/attempt/batch/order/run CAS rollback,
receipt/live revision, no outbox and post-commit signals. Two missing native
branches were added before activation: divergent same-key commands after both
first receipt misses, and the actual attempt-row update CAS rollback.

The audit found and closed a live boundary drift shared with preview: semantic
policy failures now return the deployed 422 while malformed request input
remains 400. The cellular host intentionally retains the repository-wide
authenticate-before-route-parser protocol. Result-aware transaction telemetry
classifies typed failures as expected rollbacks rather than the legacy
committed/failed split, but preserves the deployed `production.route_order`
metric token.

The legacy route was removed before topology selected the target. Processor
now uses an experience-owned generated client; Web Crypto idempotency, UI
proposal state, authoritative refresh and fetch remain app-owned. Exact generic
catalog proof covers both command variants, staged `production:stage`, actor
ordering and 200/400/401/403/404/409/422 presentation.

After those boundaries passed, the seven-file legacy route-order leaf, its
dedicated tests and PostgreSQL suite, manifest entry, repository/application/
Postgres/memory slots and composition wiring were deleted. Commit verification
is permanent target-only conformance; preview-route query proof is target-only
and its migration origin is no longer a live leaf. The central contract,
target-shared proposal evaluator, signals and work-event mechanisms remain
legitimate owners.

```text
commit legacy/target then permanent conformance:    20 / 20 passed
target native commit PostgreSQL:                    18 / 18 passed
command/query PostgreSQL verification:             187 / 77 passed
residual Production unit/PostgreSQL:               121 / 18 passed
Experience / Processor / API:                    39 / 285 / 256 passed
architecture graph:              813 modules, 3812 dependencies, zero violations
topology/rules/generated freshness:                 37 / 5 / passed
temporary database:                   force-dropped and verified absent
```

The residual legacy PostgreSQL count used its historical deterministic
business-account baseline inserted into the unique database. It is cleanup
evidence, not a claim that those soon-to-be-deleted legacy fixtures are
self-contained.

### T4 inactive Processor server Experience boundary

The seven Processor-shadow routes now have an inactive server-only Experience
owner under the existing `@pressly/experience-processor/server` subpath. Each
route is an independent query cell with its exact path, validation precedence,
required authentication and staged `production:read` or
`production:override` scope. The root browser entry remains unchanged and does
not export or import server code.

The Experience owns identity-reference selection, deduplication, fallbacks,
bounded audit composition and pure Processor DTO projection. It consumes only
narrow Production outcome, canonical identity and audit ports; canonical
Production and Processor schemas remain the wire authority. Plain typed
Production failures deliberately retain the deployed 500
`unknown_thrown_value` presentation, while AppErrors propagate unchanged.

The API now has one inactive transitional adapter for the exact cross-schema
canonical resolver and ranked eight-row source/Orders/Production audit reads.
SQL and DB dependencies therefore remain app-owned and are absent from both
Experience browser and server graphs. Generic-host proof found and closed one
real boundary omission: backlog preview now declares the deployed 64kb body
parser. The API composition binds all seven target cell execute capabilities
but does not mount the Experience yet.

Topology compilation now keeps explicit Experience dependencies separate from
browser operations. Generated clients use a deterministic deduplicated union
of consumed surfaced operations and Experience-owned HTTP/event-stream cells;
headless and job-only owned cells remain absent, and ownership does not create
a false self-consumer.

Activation remains gated on canonical Production algorithm bindings for
workspace and remaining-day forecast. Until then, the handwritten Processor
routes remain the only mounted presentations.

```text
Experience full/focused server tests:               38 / 11 passed
API unit / focused generic host:                    256 / 4 passed
API adapter PostgreSQL:                                 2 passed
cellular graph:                 812 modules, 3798 dependencies, zero violations
topology/rules/generated freshness:                 37 / 5 / passed
browser/source/server forbidden dependency audits:             zero
temporary database:                   force-dropped and verified absent
```

### T4 apply-fulfillment-demand reaction proof

The remaining Production demand ingress now has a complete inactive reaction
cell. Its contract begins after the app-owned Orders mapping boundary: Worker
still owns durable outbox claiming, raw event validation, wash-fold filtering,
projection-hash and `order-outbox:<eventId>` identity construction, retry
scheduling, backoff and dead-letter effects. The cell declares the exact
external `fulfillment_demand_changed.v1` message, message-triggered
`order_outbox` job surface and deployed eight-attempt bounded-jitter/retain
policy, then accepts the mapped Production command.

Execution preserves the unusual but deployed order: transaction and replay
precede semantic validation; active location is checked before the location
and fulfillment advisory locks; an existing order is locked, the demand is
inserted or updated, then the order is locked again before create/update CAS
and the work-event receipt. Older and equal versions append audited events
without reading the clock, while divergence does not. Scheduled, finished and
resolved orders remain preserved as the demand projection advances. There is
no Orders outbox emission or signal.

The reaction remains unexported, unassembled and absent from topology. T5 must
bind the existing Worker mapper to the generated job registration and prove
claim/retry/dead-letter continuity before the legacy leaf is deleted.

```text
focused unit/PostgreSQL:                           39 / 13 passed
Production-system full unit/PostgreSQL:          978 / 244 passed
cellular graph:                 784 modules, 3646 dependencies, zero violations
topology/rules/generated freshness:                22 / 5 / passed
temporary database:                  force-dropped and verified absent
```

### T4 complete headless Processor-query authority proof

Load-workspace and remaining-day forecast now complete the seven-query
Processor-shadow authority matrix. Both are publicly exported and assembled as
headless Production cells with narrow injected scheduler capabilities; neither
imports a sibling cell or a legacy runtime.

The workspace differential found one real target defect before activation:
the shift projector spread its database row and leaked persistence-only
`createdAt` and `updatedAt` fields. The owner now emits exactly `id`,
`locationId`, `startsAt`, `endsAt`, `timezone`, `effectiveFolderCount`,
`status` and `version`. The unchanged raw comparison, rather than contract
encoding, now matches in all eleven scenarios. Selection precedence,
ambiguity, resources/config/schedule/run/board/demand/live projection,
identity conflict, read-only transaction, clock and intentionally unordered
workspace/pending arrays are covered.

Forecast matched all twelve raw legacy/target scenarios without product
changes. Proof covers strict Gregorian and leap-day validation, 23/25-hour DST
windows, all four groups and reason ordering, placement sorting, rejection and
overtime, lifecycle conflict, missing/inactive/sibling scope, the 501-row
bound, clock-first read-only transaction and complete durable state.

All seven underlying Production reads now have accepted public parity:
board, backlog preview, workspace, remaining-day forecast, history activity,
history run and order control. Their Processor-enriched HTTP presentation is
the next atomic Experience-owned cutover; the Production cells remain
headless.

```text
load-workspace legacy/target:                       11 / 11 passed
remaining-day forecast legacy/target:               12 / 12 passed
target native workspace/forecast PostgreSQL:        10 / 10 passed each
complete query PostgreSQL verification:                   77 passed
Production-system unit:                                  978 passed
temporary databases:                 force-dropped and verified absent
```

### T4 accept-schedule cutover and deletion

`production.accept-schedule.v1` now owns schedule acceptance. Fifteen public
legacy/target PostgreSQL scenarios matched v2 success, caller-order command
identity versus sorted persisted warnings, guard failures, replay/divergence,
same- and different-key races, late CAS and receipt rollback. Durable state,
work event, receipt, live revision, no outbox and no signal behavior were
equal. The target result-aware unit of work improves only telemetry
classification: expected failures and late CAS are expected rollbacks rather
than legacy committed/failed observations; genuine receipt failure is failed
for both.

Before selection, the HTTP surface joined the staged after-input boundary:
body then params validation, `production:accept` authorization, actor context,
full decode and execution. The API catalog authorizer gained the exact accept
capability mapping. The legacy route was removed, topology selected the target
cell, and Processor now uses an experience-owned generated client while fetch,
Web Crypto, UI state and idempotency remain app-owned.

After the API and browser gates passed, the seven-file legacy leaf, mapper
test, module declaration, application/repository/UoW/security/memory ownership
and replay cache were deleted. Direct LPMS callers use
`cells.acceptSchedule`. Start-schedule retains its distinct private loader.
The verifier is permanent target-only conformance and its temporary legacy
Production dependency is removed from both manifest and lockfile.

```text
accept legacy/target then permanent PG:            15 / 15 passed
scheduling verification unit/PostgreSQL:           15 / 53 passed
residual Production unit/PostgreSQL:               164 / 25 passed
Experience / Processor / API:                   27 / 284 / 246 passed
API LPMS focused:                                       1 passed
topology/rules/generated freshness:                 22 / 5 / passed
temporary databases:                  force-dropped and verified absent
```

### T4 backlog command and preview single-authority cutover

The backlog write and its reviewed preview are now both Production-system
owned. Nine public legacy/target PostgreSQL scenarios first matched the commit
operation across classification, ordering, audited no-op, cursor/hash fences,
replay/divergence, same- and different-key races, late CAS and both event and
aggregate receipt rollback. The legacy commit HTTP route was then unmounted,
topology selected the target writer, and Processor moved to an
experience-owned generated client. Fetch, Web Crypto and UI idempotency remain
app-owned.

After the generated API/browser boundary passed, the legacy commit leaf and
tests, composition/repository/memory slots and direct method were deleted. Its
permanent conformance now invokes the public target preview and commit cells,
so command verification no longer depends on legacy Production.

The headless preview then matched 22 public legacy/target executions covering
all four classifications, reason order, missing-location empty success, exact
cursor bytes/binding/tamper/limit independence, pagination, inclusive cutoff,
1/250 limits, v2 hash, generated time, read-before-clock and durable read-only
state. The Processor-owned route now calls
`cells.previewOrderBacklog.execute`; identity composition still runs only on
success. Exact deployed failure behavior is preserved: request validation is
400, a typed cursor failure thrown by the Processor route is normalized as the
existing 500 `unknown_thrown_value` quirk, and unexpected target database
failure remains 503.

The legacy preview leaf and tests were deleted together with the five backlog
cursor/snapshot/language foundations that had become single-consumer. Query
verification is permanent target-only for preview. The underlying system cell
remains headless and the Processor route remains the sole HTTP presentation.

```text
commit legacy/target then permanent conformance:      9 / 9 passed
command verification unit/PostgreSQL:               9 / 134 passed
preview legacy/target executions:                  22 / 22 passed
post-cutover query PostgreSQL:                         54 passed
residual Production unit/PostgreSQL:              167 / 25 passed
Experience / Processor / API:                   26 / 282 / 242 passed
cellular graph:                 766 modules, 3556 dependencies, zero violations
temporary databases:                 force-dropped and verified absent
```

### T4 online-placement cell batch and proven shared mechanism

The legacy placement bundle is now represented by three independent inactive
command cells: automatic placement, manager-exact placement and overtime
confirmation. Each retains its own contract, authorization, command/result
language, idempotency envelope and orchestration. Important deployed quirks
remain explicit: automatic confirmation replay can produce `replayed: true`
before the canonical HTTP presentation rejects it; exact placement performs
both replay reads inside its placement transaction; and overtime confirmation
first reads the stored proposal in a separate unlocked transaction before its
placement unit of work begins.

Source and real lock traces corrected two early inventory assumptions before
acceptance. All three routes require `production:override`, not
`production:queue`. Exact placement locks the run, order and sequence-ordered
batches; memberships, stages and assignments remain reads, and machines come
from the stored schedule snapshot. The final target cells match those
executable boundaries.

The three implementations then proved a precise reusable mechanism. The
Production model owns the online-placement proposal/context/mode/target
language. Production Postgres owns schedule decoding, the SQL-identical
automatic/overtime locked reader, placement mutation graph, pending outcome
and work-event persistence. Exact retains its materially different context
reader, while confirmation retains its first transaction, acknowledgement and
signals. Consumers import the owners directly with explicit type conformance;
there is no sibling import, generic shared directory or activation.

```text
automatic focused unit/PostgreSQL:                39 / 16 passed
exact focused unit/PostgreSQL:                    28 / 10 passed
overtime focused unit/PostgreSQL:                 41 / 15 passed
post-extraction focused aggregate:               111 / 41 passed
Production full unit:                                   938 passed
cellular graph:                 766 modules, 3542 dependencies, zero violations
non-spec source:             7178 -> 5837 lines (-1341, 18.7%)
temporary database:                  force-dropped and verified absent
```

### T4 headless query parity and Production-owned read models

Four Processor-shadow reads now have public Production owners and adversarial
legacy/target PostgreSQL proof while remaining headless and unselected. The
HTTP presentation and identity enrichment therefore stay with the Processor
experience until that boundary is migrated:

- list-history-activity matched seven scenarios after the differential found a
  real cross-run attribution drift. The target now preserves the legacy rule
  that a run-scoped order or demand event is attributed to the requested run,
  rather than a newer SQL-resolved run;
- load-history-run matched six scenarios across repeated order episodes, full
  graph ordering, statistics, activity and the 101-event boundary;
- list-order-control matched seven scenarios, including a deliberate mutation
  between its page and follow-up reads. The target preserves the legacy mixed
  non-transactional snapshot rather than inventing repeatable-read semantics;
  and
- load-board matched five scenarios covering the complete operational board,
  DST-aware due buckets, placement defaults and conflicts, concealment,
  read-only repeatable-read mode and clock-before-transaction ordering.

Source-observed duplication also produced two precise Production-owned read
models. `production-board` now owns the snapshot SQL and pure board projection
used by load-board and load-workspace; operation shells and transactions remain
local. `production-order-backlog` now owns the bound cursor, snapshot SQL,
classification and canonical hash used by preview and commit; their query and
command orchestration remain separate. There are no sibling-cell imports or
generic shared buckets.

```text
list-activity / load-run differential:             7 / 6 passed
list-order-control / load-board differential:       7 / 5 passed
query verification unit/PostgreSQL:               13 / 49 passed
production-board source reduction:        4120 -> 2088 lines (-49.3%)
preview-backlog source reduction:          2235 -> 1461 lines (-34.6%)
temporary databases:                 force-dropped and verified absent
```

### T4 PostgreSQL fixture isolation hardening

The Production-system PostgreSQL configuration briefly gained a global
business-account preseed. That helper masked fixture dependencies through file
order and violated the requirement that every integration suite own its
prerequisites, so it was removed before accepting aggregate evidence.

Each PostgreSQL spec was then run against a blank business root. Twenty-three
suites failed independently with the same location-to-business-account foreign
key violation; all now reset and seed their deterministic business account
before location or order rows. Four suites that already seeded the account now
also remove it during reset, preventing state leakage into following files.
No product implementation or product assertion changed.

The definitive run used a fresh template0 database with all migrations, one
Vitest worker, and no global setup. Every current Production-system PostgreSQL
file passed. Both audit databases were force-dropped and catalog absence was
verified.

```text
before per-file isolation:          16 failed / 19 passed files (7 masked)
independently affected suites:                              23
reset-only leakage fixes:                                   4
definitive isolated matrix:                  36 files / 231 tests passed
Production typecheck/lint/format:                         passed
temporary databases:                 force-dropped and verified absent
```

### T5 S5 single-binding webhook cutover, legacy deletion, and phase closure

The webhook pipeline now has one cellular authority from durable ingress to
Production projection. Topology selects all fourteen Ingress cells, the seven
T5 Orders cells, and the two Production reactions needed by the queues. The
generated job catalog contains exactly two registrations in executable order:
`ingress.process-inbound-event-job.v1` on `webhook_ingestion`, then
`production.apply-fulfillment-demand-job.v1` on `order_outbox`. Worker binds
each durable queue once and runs them through one generic sequential loop,
one lifecycle, and one process-progress heartbeat. It rejects a catalog shape
or runtime attempt limit that disagrees with the declared eight-attempt retry
policy.

Ingress owns receipt, inbox, quarantine, source-location binding, and inbound
event decisions. Orders owns incoming-source proposal/closure and the durable
fulfillment-demand message/outbox contract. Production owns source-closed
resolution and fulfillment-demand projection. Raw Cents verification,
claimed-delivery mapping, queue fences, retry/dead-letter effects, logging,
metrics, and process shutdown remain app-owned. The generic jobs platform and
host branch only on business-neutral delivery and presented-failure data.

API and CLI now construct the Ingress state owner directly. Worker constructs
one full Ingress owner plus one Orders and one Production owner. The legacy
`@pressly/webhook-ingestion` and `@pressly/production` packages, old Worker
webhook/projection runners, and legacy Orders intake/outbox leaves are
physically absent. Permanent Ingress, Orders outbox, Orders intake, Production
command, and cross-system flow verifiers are target-only. Active LPMS and
Control Stateworks packages point to the surviving system, generated,
Experience, API, Worker, and verifier authorities without rewriting their
historical evidence.

Pre-cutover public differentials found no domain or durable-state drift. The
jobs mechanism intentionally waits for an in-flight invocation to settle on
cancellation before closing resources, preventing detached mutations while
retaining redelivery by withholding acknowledgement. Existing transaction
telemetry differences from result-aware Production units remain explicit:
typed failures are expected rollbacks rather than the deleted legacy unit's
committed/failed classification.

The independent frozen-tree verification found and closed three structural
proof gaps before acceptance: Control and Processor lacked `clean` tasks, the
Postman duplicate-delivery proof named a stale target assertion, and the
equivalence verifier's package-root alias captured the new Orders contract
subpath. Every affected gate was rerun after its narrow correction.

```text
frozen source SHA-256: e0b011930b77a37d350f95c4b124035101addbff6ecb295c677652f4d9478f61
workspace install / clean / build:              46 / 42 / 42 passed
typecheck / lint / non-PG Turbo tasks:           73 / 44 / 71 passed
tooling tests:                                22 files / 371 passed
cellular graph:              1064 modules / 4939 edges / zero violations
topology / rules / generated freshness:            38 / 5 / passed
generated operation / job counts:                         65 / 2
Ingress / Orders / Production native PG:             11 / 19 / 253
command / equivalence PG:                               204 / 16
Ingress / outbox / cross-system flow PG:              9 / 10 / 18
reserved and self-provisioned databases:       force-dropped / absent
five-image production smoke and rollback:                       passed
smoke teardown containers / networks / volumes / images:  0 / 0 / 0 / 0
```

The Docker proof built API, Web, Worker, Processor, and Control, reached
healthy status behind Caddy with PostgreSQL, processed signed submitted and
ignored Cents events, survived independent API and Worker restarts, completed
one four-stage production run through authenticated commands, switched all
five apps to synthetic release B, rolled them back to release A, and removed
every project resource. It is local current-tree orchestration evidence, not a
claim of historical-binary compatibility or production capacity.

### T6 S1 inactive HTTP boundary-profile mechanism

The generic HTTP boundary can now describe the four deployed authentication
realms without importing domain code or switching on operation identity.
Cells own immutable, business-neutral profile data for authentication,
content types and parser phase, exact origin, CSRF, identity rate limiting,
no-store, context providers and authorization. Topology validates and binds
opaque provider tokens; generated HTTP entries contain profile metadata only
when explicitly bound.

The opt-in profiled host owns one fail-closed middleware order from request
context through parsing, authentication, authorization, context resolution,
execution and presentation. The existing mount rejects profiled entries and
the profiled mount rejects unprofiled or incompatible entries, preventing an
accidental partial cutover. Tests prove public/no-auth, bearer,
Processor-cookie and Control-cookie-plus-CSRF candidates, all three parser
phases, error preservation, no-store enforcement, duplicate/unknown/
ambiguous/incompatible bindings and deterministic generation.

The live topology remains intentionally unbound while Access, Customers,
Orders and Pricing are still shadow authorities. Its 65 operations, 35 HTTP
routes and exact webhook-before-outbox job order are unchanged; generated
source remained byte-current.

```text
HTTP host unit:                                  4 files / 23 passed
topology unit:                                           44 passed
cellular architecture rules:                              5 passed
scoped graph:                   47 modules / 98 edges / zero violations
live bound HTTP profiles:                                      0
live route digest: 03878a4bca88395d383b56139f9f7eeeac56dd614bf49765ad229663e864f0d8
typecheck / lint / build / freshness / Prettier:            passed
```

### T6 S2 inactive Customers authority

`@pressly/customers-system` now owns five inactive cells: create, update, get,
list and exact-source resolution. The owner retains command receipts,
idempotency hashes, optimistic versions, audit rows, duplicate-contact
signals, cursor binding and exact source/business conflict behavior. Public
legacy/target PostgreSQL proof found no semantic drift.

The system also owns versioned capability
`customers.resolve-exact-source-customer.v1`. Orders will pass its existing
caller transaction while Customers alone executes Customer SQL, preserving
atomic proposal acceptance without a peer-schema import. No topology or app
selects the new owner yet.

The consumer audit found four additional collaboration seams that must close
before Orders cutover. Create and correct validate Customer existence inside
their Orders write transaction. Canonical detail obtains its Customer in the
same joined statement. Canonical list combines Customer-field search with
Order ordering and pagination before applying the limit. Public Customer cell
calls cannot replace those facts without changing atomicity or snapshot/
pagination semantics, so a follow-up capability slice is active.

```text
Customers unit / inactive inventory:                      13 / 1 passed
native PostgreSQL:                                             8 passed
legacy-target PostgreSQL matrices:                             2 passed
scoped graph:                 57 modules / 212 edges / zero violations
temporary databases:                       3 force-dropped / absent
typecheck / lint / build / Prettier:                         passed
```

## T7 contract and schema source ownership closure

T7 moved serialized and PostgreSQL source authority to the semantic producer
without changing the deployed topology or physical database. Access,
Customers, Orders, Pricing, Production, and Ingress now publish explicit
contract and schema surfaces. Control and Processor own their cross-system
wire projections. Only topology imports the six owner schema factories and
composes the one Pressly schema; a permanent scan rejects future owner-schema
package imports anywhere else.

The central `packages/contracts` workspace is physically absent. Its complete
pre-deletion tree remains recoverable at
`/tmp/pressly-t7-contracts-legacy.75YDhY`. `platform/codec` owns the canonical
codec mechanisms. `platform/postgres` owns client, query, transaction, health,
testing, unit-of-work, and migration-ledger verification mechanisms.
`packages/db` has no runtime or schema exports and retains only the immutable
migration history, migration/restore verification entrypoints, and pricing
seed. Its retired compiled output remains recoverable at
`/tmp/pressly-t7-db-dist-retired-20260822`.

Topology composes exactly 59 tables and eight enums from 67 direct Drizzle
exports. The permanent descriptor proof pins 657 columns, 108 indexes, 144
checks, 100 foreign keys, three composite primary keys, and all 25 cross-owner
foreign keys with unchanged `NO ACTION` behavior. Drizzle Kit discovers all 59
tables from the dedicated topology entrypoint and reports `No schema changes,
nothing to migrate`. The three initially whitespace-sensitive check bodies
were made byte-identical to the existing snapshots; no migration SQL or
journal file changed.

The one historical ledger remains version 7 with indices `0, 2..40`, 40 SQL
files, and 39 snapshots. Fresh apply, actual N-1 `39 -> 40` upgrade,
completed-upgrade verification, dump/restore, the real DB runner, pricing
seed, and the full DB integration suite passed. The immutable identities are:

```text
journal SHA-256: 18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered tree SHA-256: 4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
```

Compatibility was converted from a temporary central oracle to permanent
owner-side descriptor and wire digests before deletion. The verifier pins 31
transferred descriptors, all 241 Production schemas, 31 Processor schemas,
15 Ingress schemas, 22 focused wire-behavior digests, every released owner
contract export, and the retired 114 direct plus eight table-case coverage
inventory. It found and closed two real owner drifts: Pricing catalog metadata
again defaults to `{}`, and Control CLI publish counts again reject negative
values.

The final source-level proof used one frozen working-tree overlay and preserved
it byte-for-byte through the Docker gates:

```text
frozen overlay SHA-256: 5d6395435db233722b5219c55d4e71939bdee0c6f63f6b160980729fabdd2593
offline workspace install:                                      55 passed
build / typecheck:                                      51 / 85 passed
cellular graph:                  1786 modules / 7824 edges / zero violations
topology / rules / freshness:                        75 / 5 / passed
non-PG Turbo / tooling:                       82 tasks / 371 tests passed
Control Experience / topology verification:         40 / 75 tests passed
owner and verifier PostgreSQL matrices:                    all passed
broken retired workspace links:                                      0
```

Production retained its deliberate non-transactional multi-read Order-control
semantics. Only the Access-owned location lookup runs in one short read-only
transaction; Production reads then run on the base database, and the permanent
mutation fixture still proves the legacy mixed snapshot. Production test
fixtures use six explicit synthetic peer-table references and no peer schema
factory; topology alone imports owner schema factories.

The production-shaped restore proof built the real API tools image, created an
encrypted backup, upgraded `39 -> 40`, restored public and Drizzle schemas,
verified roles and ledger hashes, exercised abort/resume and kill fences, and
left zero resources. The five-image smoke then started a clean migrated
topology, proved authentication, Cents intake, scheduling and all four stage
transitions, switched all five apps to release B, rolled back to release A,
and retained the completed run.

```text
restore backup SHA-256: 699e0d5748f36212ae7b23b94f559fddb8ccb54a5e364ffbadbb36d3d1be1333
restore log: /tmp/pressly-t7-restore-proof.j7Q8Re.log
smoke report SHA-256: b9dd65e2f427d8302f713288c54151eed68b6ee458ec45fae0e26f819df6ab87
smoke report: /tmp/pressly-v2-smoke-1000-3249134-report.json
restore/smoke containers, networks, volumes, images: 0 / 0 / 0 / 0
matching databases / connections: 0 / 0
```

This is local current-tree migration, restore, and deployment evidence. It
does not claim production deployment, historical-binary compatibility, vendor
acceptance, or capacity. LPMS remains human-blocked at H1 and Control remains
active; their network pointers now name the surviving owner contracts,
schemas, topology, and verifiers without changing either workstream's status
or historical evidence. Root formatting is green across the complete T7
overlay except four protected user-owned files under
`.agents/skills/refactor/**`, which were preserved exactly.

## T8 - Delete the legacy architecture and custom compiler

The implementation has one cellular architecture. The live `modules/`,
`packages/contracts`, `packages/auth`, and `tooling/architecture` roots are
physically absent. `packages/db` retains only migration-ledger custody and
associated runner, restore, verification, and seed tooling. Dependency
Cruiser, ESLint, TypeScript, topology tests, generated-freshness checks, and
owner-side conformance tests now provide the final enforcement. Legacy path
strings survive only where permanent absence tests or historical evidence
need to name what was retired.

The checked topology contains six systems and three Experiences. Its generated
inventory is exact:

```text
operations:                       181
HTTP surfaces / unique HTTP IDs: 101 / 100
boundary profiles:                 70
CLI commands / jobs:             12 / 2
event streams:                      1
Experiences:                        3
```

Architecture explain resolves every selected operation to its repository
paths plus owner, consumer, protocol, authorization, consistency, and
observability relationships. The migrated-cell definition-of-done index has
`181 * 15 = 2,715` outcomes: 1,998 are directly met, 717 are explicitly
semantic-not-applicable, and zero are unmet. It uses no operation-ID exception
list, and every recorded source reference exists.

The final ownership corrections are part of that proof:

- Access owns Pressly authentication and authorization language, including
  roles, capabilities, workforce membership, and business/location scope;
  `platform/auth` retains only business-neutral credential and cookie
  mechanisms.
- `packages/observability` contains only neutral metric mechanisms and
  algebra. Owner descriptors compose into a generated catalog with 45 metric
  names, all 181 operation IDs, all 181 operation names, and two job IDs.
- Non-test TypeScript contains zero non-null assertions. The only two nested
  `as unknown as` assertions are reviewed generic state-machine kernel cases,
  pinned by the assertion inventory and lint tests.
- Orders cell sources contain no direct query mechanism import. SQL is isolated
  in owning `postgres.ts`, `*.postgres.ts`, or `*.repo.ts` adapters, and the
  permanent verifier scans every production cell source rather than a named
  allowlist.
- The Processor browser journey covers login and single-location selection,
  board load, Sorting start and early-completion confirmation, an actual stale
  Washing update with `409` refresh behavior, and a finite event-stream EOF
  followed by native reconnect and authoritative resynchronization.

The last conformance reconciliation applied the later fail-closed persisted
result rule without changing Production source. Every stored Production
idempotency result is decoded through its owning cell output contract in
`systems/production/src/postgres/stored-cell-work-event.ts`. Three stale
permanent fixtures and their relevant PostgreSQL expectations were reconciled
in apply-fulfillment-demand, change-order-resolution, and manage-resources.
Schema-invalid stored results now return typed
`production_idempotency_conflict`; no-mutation, event, live-revision, and
retained-evidence assertions remain intact. The focused three-file PostgreSQL
replay passed 71 tests, the Commands package passed 10 files and 204 tests,
and the complete PostgreSQL matrix below passed 108 files and 897 tests.

Steven explicitly authorized replacement of the transitional architecture
section in `AGENTS.md`. The context and memory instructions remain unchanged;
the repository guidance now declares only the final cellular grammar, exact
dependency direction, owner-local persistence and schema rules, generated
artifact ownership, throwable ownership, and bounded concurrency. T8 is
committed.

## V1 - Prove repository behavior architecture and deployment parity

The final static proof used the implementation overlay before this
evidence-only ledger update:

```text
overlay SHA-256: 38e9d0c1865bcf9f990af23ba8703ddd405641edd5d60e8e3c95db4315e9329a
repository inventory:                                      4,985 paths
offline frozen install:                                  54 workspaces
clean / build:                                      50 / 50 tasks passed
typecheck:                               83 / 83 tasks plus browser passed
cellular graph:           3,059 modules / 12,109 dependencies / 0 violations
topology / topology verifier:            10 files / 92 tests in each package
architecture rules / generated freshness:             12 passed / passed
lint:                                 52 / 52 tasks plus browser and architecture
unit Turbo / tooling:                 84 / 84 tasks; 19 files / 292 tests
format / diff / architecture explain:                              passed
current and queued Stateworks networks:                 5 validate + verify
memory and delta validations:                                     32 passed
retired roots, manifests, broken symlinks, current-doc broken links:       0
```

The role-separated PostgreSQL proof used unique databases created from
`template0`, one Vitest worker, and forced teardown. The migration-ledger unit
passed 17 tests, then 19 PostgreSQL commands passed 108 files and 897 tests.
Fresh apply produced 40 applied migrations, 59 tables, and eight enums. All 22
temporary databases were force-dropped, with zero matching databases and zero
matching connections after teardown.

```text
PostgreSQL overlay SHA-256: 4c4cba19391c954e4db6e3e3ccfc5af59ea8c34be4bd1494e60a7f72e9b3c79e
journal SHA-256:            18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered tree SHA-256:       4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
ephemeral artifact root:   /tmp/pressly-v1-pg-4c4cba19-20260823-Rbn2sn
manifest SHA-256:           6764e12b558435ae191d1732e1d4f5122e463c80efe8f76a154ab39724a91a7e
```

Browser verification on the corrected implementation overlay passed the
10-test smoke suite and the full 11-test suite, including the new Processor
production journey. The captured logs have these identities:

```text
browser overlay SHA-256: 38e9d0c1865bcf9f990af23ba8703ddd405641edd5d60e8e3c95db4315e9329a
smoke log SHA-256:       94b46363a22a839564a27a3f7d3e11dae7f2dc605dae10bb9f6b781057efb466
full log SHA-256:        cb0e3bffe96af4ad5fc31a8f917b44e914126d119b06aa7cf01260368780c9f7
```

The production-shaped restore proof created an encrypted backup, exercised
the real API tools image, `39 -> 40` upgrade, role and ledger verification,
restore, abort/resume, and kill fences. Its immutable evidence identities are:

```text
restore backup SHA-256: 204505d46d492d2eb9d706d0600428ccce3dd9e0779d53ef0f52a869b54d29d2
restore log SHA-256:    9a2b654b2f1101e6769ea6c0bb50dfd4e3bf97518c36aba7c172252aa3e3e3d3
```

The five-image production-topology smoke built API, Web, Worker, Processor,
and Control, bootstrapped a clean database, exercised authentication, signed
Cents intake, scheduling, and all four Production stages, restarted API and
Worker, switched all five apps to synthetic release B, rolled all five back to
release A, and retained the completed run. Its report, log, and evidence
manifest identities are:

```text
report SHA-256:   a5988bc0f005f2bc27cf8626b15a886b8ba88b2d40d45ddddd10a27abe026dea
log SHA-256:      b0e72c51ed5c49e21bf99e71000bcbb8d66c47940095278b6a1f817cbc61c63d
artifact SHA-256: 1a695fd4964df2cfd79a72de8b5d86b1398eeef39a453294990c1bd1b547616b
```

The five-image proof left zero project or globally matching containers,
networks, volumes, and images, plus zero matching host databases and
connections. Artifact paths were ephemeral and may no longer be retained; the
hashes above identify the captured evidence and are not a durability claim.

V1 is committed as local technical proof. It does not prove a production
deployment, compatibility between two historical release binaries, live Cents
or other vendor acceptance, a human floor pilot, or production capacity. LPMS
therefore remains at its independent H1 human gate, and Control remains active.
T9 remains to record the final report and archive this completed work item.

## T9 - Close evidence and archive completed work

T8 and V1 are committed with current authoritative evidence. The final report
records the resulting ownership model, every completion-matrix proof, the
intentional fail-closed persisted-result correction, immutable migration
identities, and the boundary between local proof and external deployment,
vendor, capacity, and pilot evidence.

The archive transition changes only this work item's lifecycle files and exact
directory location. LPMS remains at H1 and Control remains active; neither
independent workstream's state, evidence, or human gates are advanced.

The completed package was moved exactly to
`stateworks/work/done/pressly-cellular-architecture-refactor`. Its network and
state validate and verify with `done: yes`, no stop reasons, and zero ready
tasks. The active source path is absent. Final formatting, architecture,
generated-freshness, link, residual, and independent-work preservation
readbacks are recorded by the closing verification run.
