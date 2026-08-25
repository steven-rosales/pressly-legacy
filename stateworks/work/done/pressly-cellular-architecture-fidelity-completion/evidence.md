# Pressly Cellular Architecture Fidelity Completion Evidence

## Activation

Steven rejected the prior compromise completion because the original target
tree and code-quality plan were not implemented literally. This corrective
work uses the two protected plan documents as acceptance authority. Green
broad tests and rewritten living documentation are not substitutes for exact
tree, ownership, operation-locality, or scenario evidence.

### Confirmed baseline deviations

- `modules/` is absent, but `apps/` and `packages/` remain registered source
  architecture roots.
- The target `platform/` mechanisms for config, Errors, HTTP, logging, money,
  observability, testing, and time remain under `packages/`.
- 181 selected operations resolve to fewer unique cell paths; multi-operation
  source files remain.
- Operation-local tests and real-PostgreSQL proof are incomplete outside the
  strongest Production slices.
- The prior 2,715-outcome DoD index can mark an obligation met from reference
  existence or an unrelated owner-level fallback instead of named behavioral
  scenarios.
- The prior completed Stateworks item is preserved as historical evidence of
  the incorrect completion claim; it is not acceptance authority for this
  corrective work.

## Completion Matrix

| Obligation                                                | Evidence                                | Status |
| --------------------------------------------------------- | --------------------------------------- | ------ |
| Exact target source roots                                 | final tree and workspace audit          | passed |
| No apps or packages source architecture                   | manifest/import/path audit              | passed |
| Platform mechanism consolidation                          | package and consumer gates              | passed |
| One operation, one unique cell                            | topology/source identity audit          | passed |
| Operation-local contracts/decisions/executors/persistence | semantic DoD                            | passed |
| Operation-local unit/contract/executor tests              | per-operation scenario matrix           | passed |
| Applicable write-cell PostgreSQL proof                    | one-worker real-PostgreSQL matrix       | passed |
| Experience-local state/component tests                    | Experience feature inventory            | passed |
| No heuristic/fallback completion evidence                 | negative verifier fixtures              | passed |
| Local protocol and deployment parity                      | conformance, browser, restore, smoke    | passed |
| Complete residue deletion                                 | source and output residue gates         | passed |
| No cross-System transaction or database access            | protected-plan seam audit               | passed |
| Honest Stateworks closure                                 | V1, final report, and done verification | passed |

## F0 - Restore the original plans as the acceptance authority

F0 freezes the protected plan documents, not the rewritten compromise docs, as
the acceptance contract:

```text
docs/plan/refactoring-cell.md SHA-256:
61e6c906ab3d0912aefa8123ae4363f86d18d5a365103beb0718a816531252ce

docs/plan/refactor-code-quality.md SHA-256:
21a6db90d6a44a414e8e18c8205a545aff6f1b6946b25268707c8bbee8c8cfdd

activation overlay SHA-256:
f5fcebf04d96ea01af9edd1e730283b56231ce00c3449b9c8dd37c105a05991d

HEAD: f0d38b7d6b8a5576f62760bd984439def4351a1e
```

The immutable migration baseline remains 40 SQL files, 39 snapshots, and the
version-7 journal. Physical relocation must retain the historical canonical
tree prefix used by the hash verifier so both identities remain exact:

```text
journal SHA-256: 18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered tree SHA-256: 4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
```

### Platform and package delta

Eleven `packages/*` workspaces remain. The literal disposition is:

- move Config, Errors, HTTP, Logging, Observability, Testkit, and Time to
  `platform/{config,errors,http,logging,observability,testing,time}` while
  preserving their package identities during consumer cutover;
- delete unused Money;
- absorb only live Kernel primitives into explicit `platform/cells`
  subpaths, rewrite 238 consumer files, and delete unused Option, Pipe, and
  Workflow APIs;
- move all 80 immutable migration-history files into
  `platform/postgres/migrations`, the runner into Postgres, process entrypoints
  into `tooling/postgres`, topology-dependent Drizzle config into topology,
  the Pricing seed into Pricing, and 21 database tests into
  `verification/migrations`; and
- move shared TypeScript configuration into `tooling/typescript` and remove
  the TS-config workspace after updating 58 extends paths and 50 manifests.

The final workspace has no `packages/*` importer, dependency-cruiser root,
TypeScript reference, lock importer, runtime path, or symlink. The one
`packages/db/src/migrations` string that remains in the migration verifier is
renamed and documented as a frozen historical hash identity, never a live
filesystem path.

### Apps and runtime delta

`apps/` contains 469 source files and 120 test files:

```text
API        39 source / 19 tests
Worker     19 source / 12 tests
CLI        10 source /  5 tests
Control    78 source / 19 tests
Processor 172 source / 43 tests
Web       151 source / 22 tests
```

The final architecture needs no app shell. Backend process lifecycle moves to
`hosts/{http,jobs,cli}`; owner/Experience construction becomes generated
topology runtime assembly. Control, Processor, and Web feature/presentation
code moves into the matching Experiences; generic browser startup stays in
browser hosts. Five Dockerfiles and packaging move to
`deploy/images/{api,worker,control,processor,web}` while image names, ports,
health, Caddy, release fields, and rollback behavior stay unchanged.

Current API/Worker business residue is not permitted to move into hosts.
Cents ingestion and dead-letter HTTP behavior move to Ingress; Production
live-revision and signal behavior move to Production; Orders/Ingress queue
capabilities and reaction mapping move to their owning cells. The hardcoded
two-job Worker executor is deleted in favor of generated registrations and the
existing generic durable-jobs mechanism.

### Operation and test delta

The selected topology has 181 operations but only 139 unique declaration
paths. Nine files contain 51 operations, so 42 unique cell paths are missing.
Physical cell-local gaps are:

```text
distinct contract file missing:     84 / 181
distinct executor file missing:     85 / 181
persistence adapter missing:         9 / 104 persistent operations
colocated operation test missing:  101 / 181
```

All 73 Experience-owned operations lack colocated proof. Processor has 35
browser feature leaves: 28 tests live in a mirrored `test/features` tree and
seven feature leaves have no matching feature test.

There are 69 real PostgreSQL-writing operations. Only 24 have cell-local real
PostgreSQL proof: 23 Production cells and Orders claim-outbox. The previous
verifier incorrectly classified six real writes as not applicable and credited
14 other writes through owner-level fallback.

The prior resolver assigned 2,521 test references through substring,
assembly-key, import-closure, and owner fallback matching. One Control CLI
operation received 180 mostly unrelated tests. The old DoD marks an obligation
met when a reference list is nonempty; it therefore cannot prove scenario
semantics.

F7 must replace that mechanism with executable typed operation proofs. Required
scenario keys derive from positive operation profiles. Cross-system tests are
recorded separately and never satisfy local proof. Every applicable write must
execute commit, expected-rejection/no-partial-write, unexpected-failure
rollback, same-payload replay, divergent-key conflict, same-key concurrency,
declared optimistic/partitioned race, and state-message atomicity scenarios.

F0 is committed. This evidence creates no exception to the original target and
does not advance the independent LPMS or Control workstreams.

## F1 - Consolidate generic mechanisms and eliminate packages

F1 moved every live neutral mechanism out of `packages/` and then removed the
workspace root. The resulting mechanism owners are `platform/auth`,
`platform/cells`, `platform/codec`, `platform/config`, `platform/errors`,
`platform/http`, `platform/jobs`, `platform/logging`,
`platform/observability`, `platform/postgres`, `platform/testing`, and
`platform/time`. The unused Money package was deleted rather than preserved as
an empty abstraction. Shared TypeScript configuration now lives under
`tooling/typescript`.

Kernel was dissolved into the smallest explicit Cells subpaths for Result,
ID-source, command-context, state-machine, and unit-of-work behavior. The
unused Option, Pipe, and Workflow APIs were deleted. Consumer imports were
rewritten directly; there is no compatibility package or alias.

PostgreSQL custody moved without changing the ledger identity:

```text
80 / 80 migration-history files byte-identical
journal SHA-256: 18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered tree SHA-256: 4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
Drizzle schema: 59 tables, no generated diff
migration verification: 20 files / 79 tests
fresh, upgrade, and restore proofs: 1 / 1 each
```

The immutable history is now in `platform/postgres/migrations`; the reusable
runner belongs to Postgres, process entrypoints belong to `tooling/postgres`,
the Drizzle composition belongs to topology, Pricing seed behavior belongs to
Pricing, and database proof belongs to `verification/migrations`. The one
remaining old-prefix string in `migration-ledger.ts` is explicitly named as a
frozen historical hash identity and is never resolved as a filesystem path.

Mechanical deletion proof:

```text
packages directory: absent
workspace package projects: 51
packages workspace importers: 0
packages lockfile importers or links: 0
@pressly/kernel dependencies/imports: 0
@pressly/db dependencies/imports: 0
@pressly/tsconfig dependencies/imports: 0
frozen offline install: passed
repository typecheck: 79 / 79 Turbo tasks plus browser and PostgreSQL tooling
dependency graph: 3,061 modules / 12,174 edges / 0 violations
topology verification: 10 files / 92 tests
topology duplicate verification: 10 files / 92 tests
architecture-rule verification: 1 file / 12 tests
generated freshness: passed
architecture lint: passed
```

Mechanism-owned unit proof also passed: Config 17, Errors 34, HTTP 64,
Logging 8, Observability 33, Testing 6, Time 21, Cells 9, Postgres 17, and the
broader platform consumer suites recorded by the scoped migration runs. Stale
ignored install/cache shells were moved recoverably to `/tmp`; none remains
under the repository `packages/` path.

F1 is committed. Living prose and historical work evidence that describe the
retired path are not runtime dependencies; current operational documentation
and active-work pointers remain an explicit F8 rewrite, while append-only
historical evidence stays historical.

## F2 - Move backend processes into hosts and topology

F2 removed all API, Worker, and CLI application workspaces. Generic process
lifecycle, protocol interpretation, and effects now belong to `hosts/http`,
`hosts/jobs`, and `hosts/cli`. Deployment-specific business construction is
explicit topology; compiler-owned executable bindings are isolated in the
`@pressly/generated-runtime` workspace. The base `@pressly/generated` package
is topology-free, so browser clients and server runtime bindings no longer
form a workspace cycle.

The HTTP migration did not park business routes in topology. Cents
normalization, signature policy, quarantine behavior, and the previously
handwritten endpoint are now an explicit Ingress source cell. This catalogs
one existing independently observable operation that the 181-operation F0
inventory had omitted; the exact topology is therefore 182 unique operation
IDs without adding an endpoint or changing business behavior. Production
signals belong to Production. The HTTP host owns Express, request parsing,
middleware execution, Sentry, environment/process lifecycle, and rate-limit
mechanisms; topology is Express-free and receives structural capabilities.

The canonical replay boundary now applies route-scope authorization before
body parsing. This is the explicit params -> authorization -> body -> handle
order required by current `AGENTS.md`; the relocated test records that
security-boundary correction rather than preserving the retired order.

Worker business code also moved to its semantic owners. Ingress owns inbound
event queue capabilities, Orders owns outbox queue capabilities, Production
owns fulfillment-demand delivery mapping, and Control Experience owns CLI
HTTP/session/bootstrap workflows. Hosts own polling, lifecycle, telemetry,
TTY, filesystem/session effects, environment, arguments, streams, and exit
behavior. Topology imports no host, filesystem, process, clock, ID, or random
source.

```text
apps source root: absent
apps lock/workspace importers: 0
workspace projects: 49
workspace dependency cycles: 0

HTTP host: 4 files / 31 tests
HTTP verification: 19 files / 164 tests
Ingress: 26 files / 128 tests

Jobs host: 7 files / 41 tests
CLI host: 3 files / 28 tests
Jobs verification: 2 files / 4 tests
CLI verification: 5 files / 33 tests, including live entrypoints
Orders owner proof: 22 files / 99 tests
Production owner proof: 240 files / 1,058 tests
Control CLI proof: 27 files / 96 tests
PostgreSQL cross-system flows: 2 files / 18 tests

deployment/CI/Compose/recovery tooling after deploy-root cutover:
10 files / 196 tests
dependency graph: 3,086 modules / 12,685 edges / 0 violations
architecture negative fixtures: 1 file / 12 tests
```

API and Worker Dockerfiles now live at `deploy/images/api` and
`deploy/images/worker`; service names, image names, ports, health, signals,
lease/retry/dead-letter behavior, CLI entrypoints, and the one-database
topology remain preserved. Old ignored backend app shells were moved
recoverably to `/tmp` only after scoped proof.

F2 is committed. F3 remains open until the Customer presentation and every
browser host satisfy the host -> generated/Platform-only boundary.

## F3 - Move browser applications into Experiences and browser hosts

F3 removed the remaining frontend app architecture. Control, Customer, and
Processor presentation, state, and browser-feature behavior now live in their
owning Experiences. Next.js, Vite, Nginx, browser startup, and browser
capability effects remain in generic browser hosts. Deployment images remain
under `deploy/images/{control,processor,web}`.

The mirrored Processor test tree was eliminated by moving 28 feature tests
beside their exact Experience owners. Seven Customer page and feature tests
were also moved beside their source. The stale generated Customer browser
request test became an owner-local transport test. The generated tree now
rejects unregistered handwritten TypeScript recursively.

The browser-source relocation exposed one real build defect: Tailwind no
longer scanned Customer Experience classes from the browser host. The host now
declares the exact Experience source. Both the desktop menu and mobile menu are
again selected by their intended responsive rules; the Web runtime smoke uses
an accessible, visible desktop interaction instead of forcing a hidden node.

Current executable proof:

```text
Processor Experience: 86 files / 356 tests
Customer Experience and host: 28 files / 93 tests
browser smoke: 10 / 10
full browser E2E: 11 / 11

smoke artifact:
/tmp/pressly-browser-e2e-smoke-final-20260823-003

full artifact:
/tmp/pressly-browser-e2e-final-20260823-001
```

The browser runs built all five production images, applied the exact 40-file
migration ledger, exercised Control and Processor authentication, CSRF,
workforce authority, Web server rendering and hydration, mobile containment,
and the Processor conflict/resynchronization journey. Each disposable Compose
project reported all tests passing and performed its own teardown.

F3 is committed.

## F4 - Make Access Customers and Pricing operations literal cells

Every selected Access, Customers, and Pricing operation now resolves to one
unique cell path. Applicable contracts, executors, persistence, and named
proof scenarios are local to the operation. Stable shared language remains
only under a precise System model, contract, capability, schema, or assembly
owner.

The canonical unit and PostgreSQL matrices passed:

```text
unit
  Access:     64 files / 334 tests
  Customers:   6 files /  30 tests
  Pricing:     4 files /  35 tests

PostgreSQL
  Access System:          18 files /  70 tests
  Access verification:     1 file  /   1 test
  Customers System:        5 files /  25 tests
  Customers verification:  2 files /   5 tests
  Pricing System:          2 files /   9 tests
  Pricing verification:    1 file  /   2 tests
```

Expected failures remain typed. Write operations prove commit, no-partial-write
rejection, rollback, replay, divergent reuse, declared races, and state/message
atomicity where applicable.

F4 is committed.

## F5 - Make Ingress and Orders operations literal cells

Ingress and Orders now expose one cell for each independently observable
operation. The previous shared declarations and executors were split without
changing inbox/outbox, lease, retry, dead-letter, idempotency, or delivery
behavior. Tests and executable operation proofs are local to their cells;
cross-System flow tests remain separate and do not certify local obligations.

The canonical unit and PostgreSQL matrices passed:

```text
unit
  Ingress: 42 files / 190 tests
  Orders:  58 files / 237 tests

PostgreSQL
  Ingress System:          14 files /  81 tests
  Ingress verification:     1 file  /   3 tests
  Orders System:           17 files / 113 tests
  Orders verification:      3 files /  19 tests
  Orders outbox:             1 file  /  10 tests
  Cross-System flows:        2 files /  18 tests
```

F5 is committed.

## F6 - Finish Production and Experience operation locality

Production has 39 selected operations, each with one unique cell path and
complete applicable proof. The three Experiences own 73 selected operations:
50 Control, 11 Customer, and 12 Processor operations. Their 18 declared
features carry explicit state and component proof paths:

```text
Control:    6 features / 7 state proofs / 7 component proofs
Customer:   2 features / 2 state proofs / 2 component proofs
Processor: 10 features / 12 state proofs / 12 component proofs
```

Production unit proof passed at 240 files / 1,328 tests. Its real-PostgreSQL
and permanent conformance matrix passed:

```text
Production System: 39 files / 543 tests
commands:          11 files / 212 tests
queries:           10 files /  77 tests
scheduling:         9 files / 153 tests
flows:              2 files /  18 tests
```

The query matrix runs serially against real PostgreSQL. Its owner-executed
capability traces now distinguish caller transactions from owner transactions,
and the same-key scheduling proof rejects divergent reuse as the declared
idempotency conflict.

F6 is committed.

## F7 - Replace heuristic definition of done with semantic evidence

The topology resolves exactly 184 selected operations to 184 unique cell
paths. Generated architecture evidence contains 522 local proof registrations,
798 named scenarios, and 1,270 explicit scenario claims. There are zero missing
finite failure claims and zero open contract gaps.

The verifier no longer awards credit through substring matching, import
closure, owner-level fallback, a bare path, or a cross-System test. An inline
literal `proveOperation` call in the exact cell directory is required.

Focused negative fixtures reject:

- a shared cell path;
- missing local contracts, executors, persistence, or scenarios;
- imported, owner-root, or cross-System proof;
- unproven PostgreSQL semantics;
- unjustified not-applicable claims;
- handwritten TypeScript in `generated/`; and
- stale generated catalogs or clients.

Topology and topology-verification passed at 19 files / 132 tests. The same
184-operation and semantic-evidence assertions also pass through the duplicate
architecture gate and generated-freshness gate.

Readback command used for the generated evidence counts:

```text
node --input-type=module - < generated/dist/architecture-map.js inspection
operations=184 proofs=522 scenarios=798 claims=1270
```

F7 is committed.

## F8 - Delete source residue and reconcile the final tree

The surviving source architecture contains only:

```text
hosts/
systems/
experiences/
platform/
topology/
generated/
verification/
deploy/
tooling/
docs/
stateworks/
```

There are 48 workspace projects. `apps/`, `packages/`, `modules/`, `infra/`,
the retired architecture compiler, compatibility exports, broken retired
workspace links, handwritten generated sources, compiled source siblings,
empty source shells, generic buckets, and live Python tooling are absent.

Living documentation and the brief/network files for independent LPMS and
Control work use current source pointers. Their chronological evidence remains
historical and their lifecycle states were not advanced.

Source residue, workspace, lockfile, current-documentation, generated-source,
symlink, and frozen-install audits passed before the runtime matrix. The
runtime gates then deliberately regenerated build, Turbo, Next, Playwright,
and test outputs.

After the last browser run, exactly 104 generated output targets were moved
recoverably to:

```text
/tmp/pressly-final-output-residue-20260823-final-001/repository
```

The moved tree is 2.8 GiB. Workspace and root `node_modules` were retained.
No Playwright MCP state was recreated after evacuation. The post-clean command
passed with this exact result:

```text
command: pnpm architecture:residue:outputs
exit: 0
summary: Final architecture and output residue audit passed.
```

The protected plan hashes remained unchanged after cleanup.

A final independent reachability audit then found three source files that the
path-based residue gate had not rejected. They were unused Processor UI
components copied from the retired app:

```text
experiences/processor/src/browser/components/ui/chart.tsx
experiences/processor/src/browser/components/ui/combobox.tsx
experiences/processor/src/browser/components/ui/direction.tsx
```

All three were deleted. Their otherwise-unused `recharts` and
`@base-ui/react` dependencies were removed from the Processor manifest and
lockfile. The same audit exposed one live Customer `Form` identity alias; it
was replaced by an owned typed wrapper without changing its provider
contract.

The symbol-ownership lint now rejects imported namespace-member aliases and
identity aliases that are declared privately and exported later. Focused
negative fixtures cover value, type, interface, and namespace-member forms;
the two exact framework-mandated Next/Sentry bindings remain explicit narrow
exceptions. Post-repair proof passed:

```text
architecture lint regression: 1 file / 16 tests
Processor Experience: 86 files / 356 tests
Customer Experience: 28 files / 93 tests
Processor and Customer typecheck: passed
complete architecture build: 30 / 30 tasks
dependency graph: 3,315 modules / 13,889 edges / 0 violations
topology verification: 19 files / 132 tests, repeated identically
repository lint: 47 / 47 workspace tasks plus browser, PostgreSQL tooling,
type-aware, and architecture lint
frozen offline lockfile verification: passed
```

Those final gates regenerated exactly 79 output paths. They were moved
recoverably to:

```text
/tmp/pressly-final-output-residue-20260823-final-002/repository
```

The second moved tree is 469 MiB. The final output-residue audit passed again
after that evacuation.

F8 is committed.

## H1 - Four protected-plan contradictions

The implementation preserves current behavior and the immutable ledger, but
four seams contradict literal rules in the protected plans:

1. Orders acceptance calls the Customer source-resolution capability inside
   the Orders transaction so customer creation and canonical Order acceptance
   retain one rollback boundary.
2. Canonical Orders reads consume a Customer-owned SQL join plan so filtering,
   search, ordering, pagination, and one-snapshot projections remain exact.
3. Production resource reconciliation reads and writes Access's canonical
   location row inside the Production transaction so the location, resources,
   scheduler configuration, receipt, work event, and revision roll back
   together.
4. Immutable migration `0017_production_live_revisions.sql` increments the
   Access-owned `production_locations.live_revision` from Production-owned
   `work_events`.

The protected plans simultaneously require:

- no cross-System transaction or database access;
- preserved transaction, query, rollback, and browser-visible behavior; and
- the byte-identical, ordered 40-file migration ledger.

Removing these seams requires a material ownership, projection, process,
transaction, or migration redesign. Preserving them requires four named,
bounded deviations. General implementation authorization does not choose
between those outcomes.

On 2026-08-24 Steven explicitly selected literal plan boundaries. He
authorized material ownership, transaction, query, process, table, and
migration redesign; confirmed that non-Pricing data has no user-compatibility
obligation; and authorized destructive replacement of that schema. Pricing is
the one protected database surface because the public Web displays it. Steven
also required the final proof to compose every Docker image and exercise
Control, Processor, Web, and the complete endpoint topology in Chromium with
representative seeded data.

H1 is committed. O2A through O2E now implement and prove that decision before
V1 or T9 can close.

## V1 - Current runtime proof and withheld completion

The complete local runtime matrix is green on the current architecture:

```text
pnpm test:int
  passed the migration, six-System, permanent conformance, outbox,
  command, query, scheduling, and flow PostgreSQL matrix at one worker

bash deploy/aws/lightsail/restore-postgres-proof.sh
  passed encrypted N-1 restore, 39 -> 40 upgrade, role checks, exact approved
  release gating, abort/resume, rename-boundary recovery, quarantine, and
  durable service-fence proof
  log: /tmp/pressly-restore-proof-final-20260823.log

pnpm docker:production:smoke
  passed all five images, fresh migration/bootstrap, Caddy-only ingress,
  authenticated Processor lifecycle, API and Worker recovery, release-B
  switch, release-A rollback, and exact disposable-resource teardown
  report: /tmp/pressly-v2-smoke-final-20260823-002-report.json

pnpm test:browser:smoke
  10 / 10 passed
  artifact: /tmp/pressly-browser-e2e-smoke-final-20260823-003

pnpm test:browser:e2e
  11 / 11 passed
  artifact: /tmp/pressly-browser-e2e-final-20260823-001
```

The production topology report records 40 applied migrations, one completed
four-stage run, healthy API and Worker recovery, all five images switched and
rolled back together, and zero remaining project containers, networks, or
volumes. It is local proof, not a production deployment or historical-binary
compatibility claim.

Protected-plan hashes remain exact:

```text
refactoring-cell.md:
61e6c906ab3d0912aefa8123ae4363f86d18d5a365103beb0718a816531252ce

refactor-code-quality.md:
21a6db90d6a44a414e8e18c8205a545aff6f1b6946b25268707c8bbee8c8cfdd
```

V1 is not committed. It still requires:

1. a frozen post-Stateworks source fingerprint and final static readback; and
2. the H1 decision and the verification selected by that decision.

T9 remains pending. This work item stays active and must not move to `done/`.

## Current Stateworks lifecycle

The post-update Stateworks readback is intentionally stopped at H1:

```text
command: pnpm stateworks:validate stateworks/work/active/pressly-cellular-architecture-fidelity-completion/network.yaml
exit: 0
summary: valid network, 12 tasks

command: pnpm stateworks:next stateworks/work/active/pressly-cellular-architecture-fidelity-completion/network.yaml --state stateworks/work/active/pressly-cellular-architecture-fidelity-completion/state.yaml
exit: 0
summary: H1 is the sole next compatible task

command: pnpm stateworks:verify stateworks/work/active/pressly-cellular-architecture-fidelity-completion/network.yaml --state stateworks/work/active/pressly-cellular-architecture-fidelity-completion/state.yaml
exit: 0
summary: done=no, stop_reasons=human_action_required, next_ready_tasks=1
```

This is the expected honest lifecycle. It must not be changed to `done` merely
because the implementation and local runtime matrices are green.

## O2A - Remove Orders and Customers cross-System database seams

Orders and Customers now execute as independent database authorities. Customer
capabilities return data only; no Customer transaction, SQL plan, schema,
relation, or persistence value crosses into Orders. Orders stores the customer
snapshot needed by its own canonical read model and treats the Customer ID as
an opaque reference.

The acceptance workflow commits owner-local Customer resolution and
Orders-owned proposal acceptance independently, with explicit replay and retry
semantics instead of a cross-System transaction. Orders search, pagination,
projection, partial failure, divergent replay, same-key concurrency, and
outbox delivery remain covered by owner and flow proof.

Final proof includes Orders System `17 files / 113 tests`, Orders verification
`3 / 19`, Customers System `5 / 25`, Customers verification `2 / 3`, Orders
outbox `1 / 10`, and the cross-System flow matrix. Customers test support no
longer declares or seeds Access's `business_accounts` table.

O2A is committed.

## O2B - Remove Production and Access cross-System database seams

Access owns `access_production_locations`; Production owns
`production_locations`. Production's live revision advances atomically with
Production work events. Neither owner imports, reads, writes, constrains, or
joins the other's schema or transaction.

Control's declarative bootstrap cell coordinates two owner-local commands. A
generic PostgreSQL advisory lock serializes the workflow, while each owner
retains its own replay, concurrency, rollback, and failure-recovery proof.
Access no longer owns a Production revision and Production no longer mutates an
Access row.

Final PostgreSQL proof includes Access `19 files / 81 tests`, Production
`39 / 543`, commands `11 / 212`, queries `10 / 77`, scheduling `9 / 153`, and
flows `2 / 18`. Bootstrap, SSE invalidation, replay, races, and partial failure
are owner-local or explicitly coordinated.

O2B is committed.

## O2C - Replace the database history with one clean Pricing-preserving baseline

The authorized pre-user database epoch contains exactly two SQL migrations and
two snapshots. It composes `59 tables / 6 enums` and Drizzle reports no schema
changes:

```text
0000_clean_owner_schema.sql
  SHA-256 2694429e45016ccfb0d36f6521e4abc6c9c0b606373fcd8a6f5fa25c32e24d8b

0001_owner_database_mechanisms.sql
  SHA-256 ee1c6a984d43ced2cde5ba1182c08cac4ff05449286aafd9a464826af6b9d6c5

journal SHA-256
  4b3a8eac8cde509ce43ae8e9b2f1608a7ce40f30548978250715a1d157a69e2a

ordered tree SHA-256
  8436950407887c0eb5ada951921dc80b56b03d96c03a9303d6c202a3b74dcbc6
```

The public Pricing catalog remained exact: Wash & Fold `167 cents/lb`, minimum
`3000 cents`, delivery `0`, Hang Dry `295`, Dry Cleaning delivery `0`, and
Launder & Press `395`. Fresh migration, role separation, N-1 encrypted restore,
exact `1 -> 2` upgrade, abort/resume, rename-boundary recovery, quarantine, and
the durable service restart fence all passed.

The three pre-Option-2 migration backup trees are absent from their original
`/tmp` paths. The environment disallowed permanent recursive deletion, so the
exact trees were moved recoverably to system trash after final runtime proof.

O2C is committed.

## O2D - Delete boundary exceptions and enforce literal database ownership

The final source has zero cross-owner foreign keys, peer-schema imports,
caller-owned peer transactions, or SQL-plan composition. The ignored Orders
fulfillment `bagCount` compatibility field was removed from Orders schema,
canonical reads, outbox messages, and Control projection. The producer-owned
`fulfillment_demand_changed` contract is explicitly version 2. Production's
operator-intake `production_orders.bag_count` remains authoritative and
unchanged.

Two additional permanent guards close defects found by the final audit:

- the source-residue audit rejects duplicate public package export keys that
  resolve to the same owned conditional target tuple; and
- `pressly-language/system-testing-owner-schema` rejects standalone `pgTable`
  declarations under System test support, requiring the owner schema factory.

The architecture guard fixtures pass `2 files / 35 tests`. Source residue,
duplicate export, owner-schema, dependency, generated-freshness, and forbidden
root checks pass. `apps/`, `modules/`, `packages/`, and `infra/` are absent.

O2D is committed.

## O2E - Prove the clean topology through Docker endpoints and Chromium

The frozen five-image proof completed at `2026-08-24T19:19:57.042Z`:

```text
report: /tmp/pressly-option2-final-topology-report.json
SHA-256: c0dc6624966572067bf63eabf35098bc179239a35139f236fa5d2c082b27fbf0
```

All five production Dockerfiles built. Fresh migration/bootstrap, protected
Pricing, Caddy-only ingress, Control MFA, Processor cookie/CSRF, API restart,
Worker restart, two signed submitted Orders, three approved ignored receipts,
one completed four-stage Production run, eight stage commands, release-B
switch, and release-A rollback passed. Teardown left zero project containers,
networks, or volumes. The seven-container steady-state snapshot used
`491,761,172 bytes`, or `11.45%` of the 4 GiB pilot floor; this is not a
capacity guarantee.

The generated HTTP census reached all `112` mounted method/path pairs with
zero failures. That census proves mount and dispatch reachability only;
authorization, validation, persistence, and business semantics are proved by
owner, integration, flow, and browser suites.

Chromium passed `11 / 11` on representative data:

```text
artifacts: /tmp/pressly-option2-final-browser-e2e
results.json SHA-256: 4cdc1b38b4025941bb1f7c3e7e6437a521b6aa8d60a7a1a0fa5c942e4419d401
junit.xml SHA-256: b8539f9d4f8744554e4c4dac27d9d57c07fce3166f23aeb866b0097c152f7fcc
```

The browser proof covers Control customer/order creation, host-only sessions,
CSRF and origin rejection, Processor commands and conflict resynchronization,
Processor session restore, public Web SSR/hydration, distinct owner/manager/
operator authority, and mobile containment. Its disposable Docker resources
also read back as zero.

O2E is committed.

## V1 - Prove exact plan fidelity behavior and deployment parity

The final implementation fingerprint is:

```text
578aaa8328590ea758abce31573d1e53ec2c727723fda6a5bfaa11c199e8ba63
```

It was identical immediately before and after Docker and Chromium. The final
architecture has `6 Systems / 3 Experiences`, `193 operations / 193 unique
cells`, `536 proof registrations / 836 named scenarios / 1,336 claims`, and
`2,895` definition-of-done outcomes: `2,062 met / 833 not applicable / 0
unmet`.

The frozen-source matrix passed:

```text
offline frozen install: passed, 48 workspace projects
format: passed
build: 45 / 45 tasks
architecture: 3,362 modules / 14,140 edges / 0 violations
topology: 19 files / 132 tests, repeated identically
architecture guards: 2 files / 35 tests
typecheck: 74 / 74 tasks plus browser, PostgreSQL, and route tooling
lint: 47 / 47 tasks plus browser, PostgreSQL, route, type-aware, and architecture
unit: 74 / 74 workspace tasks plus 21 tooling files / 320 tests
PostgreSQL: complete migration, six-System, conformance, outbox, command,
  query, scheduling, and flow matrix at one worker
restore: passed
five-image topology: passed with exact teardown
Chromium: 11 / 11
source residue: passed
output residue: passed after final clean
```

Protected plan identities remain exact:

```text
docs/plan/refactoring-cell.md
61e6c906ab3d0912aefa8123ae4363f86d18d5a365103beb0718a816531252ce

docs/plan/refactor-code-quality.md
21a6db90d6a44a414e8e18c8205a545aff6f1b6946b25268707c8bbee8c8cfdd

generated/architecture-map.ts
9d225e347e4f3bac627ab20828cd4efce2de37149beb7f02a2f45242acc6b866
```

This is local repository and runtime proof. It is not a production deployment,
live vendor acceptance, or capacity guarantee. Independent LPMS and Control
work items were not advanced.

V1 is committed. T9 is the sole remaining lifecycle task.

## T9 - Report and archive exact completion

The requirement-by-requirement final report records the literal target, hard
database boundaries, clean epoch, protected Pricing, semantic operation proof,
complete gate matrix, runtime artifacts, teardown, and local-proof limits. The
work package is archived at:

```text
stateworks/work/done/pressly-cellular-architecture-fidelity-completion
```

All `17` tasks are committed. Final Stateworks validation reports a valid
network, an empty next batch, `done: yes`, no stop reasons, and zero ready
tasks. The active path is absent and the done path is present. Independent
LPMS and Control work-package fingerprints remained unchanged.

T9 is committed.
