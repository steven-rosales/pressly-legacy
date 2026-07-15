# LPMS Run-Centered Online Scheduling Evidence

## Work

- Work ID: `lpms-run-centered-online-scheduling`
- Network: `stateworks/work/done/lpms-run-centered-online-scheduling/network.yaml`
- Status: complete
- Evidence date: `2026-07-14`
- Terminal tasks: `V1` and `T6` committed.

The same checkout passed focused implementation tests, root acceptance,
canonical LPMS integration and end-to-end gates, a clean Drizzle consistency
check, and the disposable six-container production-topology proof. Counts below
are reported per command and are not summed across overlapping reruns.

## Baseline preservation

The implementation was made in a dirty shared tree. Existing user work and the
historical evidence under `lpms-production-readiness` were preserved. No
historical production execution was selected or deleted silently.

Laundry-production intent memory advanced from v4 to v5 through the applied,
conversation-backed delta
`2026-07-14-run-centered-online-scheduling.memory-delta.yaml`; its bounded
context pack was regenerated. After V1, the separately verified implementation
delta advanced memory from v5 to v6 and the bounded context pack was regenerated
again. Role mapping and queued-unfreeze authority remain assumptions.

The inspected local migration baseline contained one legacy, never-started
planned run and no shift with multiple production runs. Migration tests, rather
than that compatible local sample alone, cover normalization and abort paths.

## T0 — Memory and implementation baseline

Status: committed

- Reconciled the approved v5 domain model with Contracts, Database,
  Scheduling, Production Policy, Production business workflows, API, Worker,
  Processor, and the active production-readiness network.
- Preserved role mapping and queued-unfreeze authorization as medium-confidence
  implementation assumptions rather than confirmed floor authority.
- Kept SSE, probabilistic stability scoring, and silent live reoptimization
  explicitly deferred.
- Confirmed that `lpms-production-readiness` remains active at human gate `H1`.
  Its historical proof is unchanged and must be rerun against this checkout
  before its pilot workflow resumes.

## T1 — Contracts, schema, and migration

Status: committed

- Contracts now separate Compute, Accept, and Start and expose typed live
  placement, exact placement, membership control, version conflict, pending,
  capacity, and overtime-confirmation outcomes.
- Schema and migration `0016_lpms-run-centered-online-scheduling` add one
  current plan per shift, one production run per shift, independent lifecycle
  and queue versions, membership freeze, placement provenance/pins, completion
  projection, and version-bound overtime facts.
- Migration preflight aborts on duplicate shift runs or inconsistent execution;
  compatible legacy planned execution is normalized back to an accepted plan,
  while started/completed history remains readable.
- Scheduler configuration is advanced through `fixed-pulse-ffd-v2` without
  rewriting historical v1 configurations or schedules.

Focused contract and database proof passed and is covered again by the exact
root and canonical integration command ledger under V1.

## T2 — Pure scheduling and production policy

Status: committed

- `fixed-pulse-ffd-v2` plans the complete eligible snapshot deterministically.
- `online-stable-insertion-v1` implements priority earliest-feasible placement,
  ordinary best-fit placement, positioned or appended batch creation, frozen
  anchors, exact-target rejection, zero automatic relocation, mutable-suffix
  reprojection, canonical hashing, and overtime projection.
- Production policy owns current-plan acceptance, Start preconditions, hard
  pulse capacity, membership freeze/unfreeze legality, and placement commit
  decisions without persistence or framework imports.

Focused Scheduling, Production Policy, and Access Control proof passed and is
covered again by the exact root command ledger under V1.

## T3 — Pre-start lifecycle

Status: committed

- Compute, Accept, and Start are separate transactional use cases. Compute
  locks the scheduling scope, creates a new immutable revision, supersedes the
  previous current revision, and revokes acceptance.
- Accept persists actor, warning acknowledgments, and accepted identity only;
  it does not create a run or execution graph and does not schedule orders.
- Start revalidates current acceptance and exact snapshot membership after lock
  acquisition, then creates the one started run and initial execution graph
  atomically.
- Location-scoped advisory locks, explicit shift locking, post-lock replay, and
  database uniqueness make retries stable and serialize concurrent Start.
- Snapshot validation requires exact batched-plus-unplaced coverage, preventing
  omission or duplication from being accepted or started.

## T4 — Live placement and membership control

Status: committed

- Demand and intake eligibility paths immediately attempt placement into the
  existing started run using the already-recorded priority. Eligibility remains
  durable when placement is pending or needs overtime confirmation.
- Automatic retry, manager-exact placement, employee freeze, owner/admin
  queued-only unfreeze, and overtime confirmation use expected versions and one
  run-first lock order.
- Committed placement records provenance and optional pin data, increments the
  queue version once, rebuilds only the affected mutable suffix, and clears any
  stale overtime acknowledgment.
- Starting a batch freezes membership; non-queued work cannot unfreeze. Run
  completion and new arrival placement serialize on the run lock.
- Intake demand materializes the exact declared bag count so placement and
  floor intake read the same durable facts.

Production unit and Postgres integration proof passed. Race coverage includes
concurrent same-key Start, freeze versus exact placement, final completion
versus a committed arrival, and race-safe automatic selection of the shift's
unique started run while a competing run is being created.

## T5 — API, Worker, workspace, and Processor

Status: committed

- API exposes explicit schedule Compute/Accept/Start, run-ID board lookup,
  explicit shift workspace scope, and versioned placement/membership commands.
- Workspace ambiguity is returned as candidate shifts rather than resolved by
  an arbitrary latest-row heuristic. Board reads are keyed by production run.
- Worker composes eligibility and placement through Production boundaries and
  emits sparse production counters without customer/order labels.
- Processor derives the Compute-to-Review/Accept-to-Start state from the
  backend, persists `shiftId` and `runId` in the URL, awaits refresh before
  navigation, renders pending/frozen/exact/overtime behavior, and polls visible
  online views every ten seconds. SSE was not introduced.

Focused Metrics, API/Cents, Processor, architecture, and topology proof passed.
The exact non-overlapping command results are recorded in V1 below.

## V1 — Full acceptance

Status: committed

### Static, behavioral, and build gates

Each command exited zero on the same implementation checkout. The root,
integration, and end-to-end commands intentionally exercise overlapping code;
their test counts are therefore not combined into one inflated total.

| Command                                                                       | Exact result                |
| ----------------------------------------------------------------------------- | --------------------------- |
| `pnpm typecheck`                                                              | 43 of 43 tasks passed       |
| `pnpm lint`                                                                   | 24 of 24 tasks passed       |
| `pnpm test`                                                                   | 149 files, 814 tests passed |
| `pnpm build`                                                                  | 24 of 24 tasks passed       |
| `pnpm test:lpms:int`                                                          | 36 files, 153 tests passed  |
| `pnpm test:lpms:e2e`                                                          | 13 files, 86 tests passed   |
| `pnpm --filter @pressly/db exec drizzle-kit check --config drizzle.config.ts` | passed                      |
| `git diff --check`                                                            | passed                      |

### Final requirement and concurrency audit

The final audit found and verified four closure repairs:

- automatic placement selects a shift's unique started run under the same lock
  that protects competing run creation, with a real Postgres race test;
- explicit unknown or cross-location workspace shift IDs return 404 instead of
  falling through to another context;
- the production board exposes intake state and refreshes it after commands;
- changing location clears stale `shiftId` and `runId` URL ownership.

All planned concurrency invariants now have implementation or Postgres proof,
including plan-snapshot serialization, concurrent Start, placement/freeze,
completion/arrival, queue versions, and stale overtime confirmation.

### Disposable Docker production-topology proof

```text
command: pnpm docker:production:smoke
exit: 0
completed: 2026-07-14T17:47:25.885Z
report: /tmp/pressly-v2-smoke-1000-302529-report.json
bytes: 4563
sha256: 152592623a0773563e3382a7c8030f5cd18f271e2507e851a52182f0e0e16033
```

The disposable local Unix Docker topology cleanly migrated and bootstrapped,
accepted two exact-byte signed synthetic Cents receipts, projected two orders,
and completed exactly one production run. The proof covered pre-start
Compute/Accept/Start across an API restart, a post-start arrival, automatic
placement, explicit membership freeze, direct run-ID board resume, four stages
through eight authenticated transition commands, and durable database facts.

All four applications switched to synthetic release B and rolled back to
release A. Teardown left zero project containers, networks, or volumes. The
report explicitly proves current-tree local orchestration, not historical
binary compatibility or a production sizing guarantee, and intentionally
contacted no Pressly production, Cents, DNS, cloud, or deployed endpoint.

## T6 — Documentation and implementation memory

Status: committed

- `docs/plan/lpms.md`, `docs/architecture.md`, and `docs/devops.md` describe the
  verified Compute/Accept/Start lifecycle, one run per shift, queue versions,
  online insertion, membership freeze, overtime confirmation, explicit
  identifiers, bounded polling, and coordinated release.
- The implementation-backed memory delta was validated, accepted, applied, and
  marked applied. Laundry-production memory is v6 and its context pack was
  regenerated.
- Existing owner/admin-as-manager and queued-unfreeze rules remain
  medium-confidence implementation assumptions; they were not promoted to
  confirmed business truth.
- SSE, probabilistic stability scoring, automatic repacking, silent live
  optimization, drag-and-drop/pagination, split orders, event sourcing, and
  exception workflows remain deferred.
- A proof reference was appended to the active production-readiness evidence.
  Its historical text and `H1` human gate were not changed or advanced.

### Stateworks acceptance

```text
pnpm stateworks:validate stateworks/work/done/lpms-run-centered-online-scheduling/network.yaml
pnpm stateworks:verify stateworks/work/done/lpms-run-centered-online-scheduling/network.yaml --state stateworks/work/done/lpms-run-centered-online-scheduling/state.yaml
pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/memory.yaml
pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/deltas/2026-07-14-run-centered-online-scheduling-implementation.memory-delta.yaml
pnpm stateworks:memory:context laundry-production --stdout
```

All commands exited zero after closure. Lifecycle verification reported
`done: yes`, no stop reasons, and zero next-ready tasks. Final `git diff
--check` also exited zero.
