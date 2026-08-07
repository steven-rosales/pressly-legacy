# Completion Evidence

## Work

- Work ID: `lpms-order-control-correctness-hardening`
- Network:
  `stateworks/work/done/lpms-order-control-correctness-hardening/network.yaml`
- Started: `2026-08-06`
- Finished: `2026-08-06`

## T0 - Reconcile the current failures

The architecture migration did not repair any of the four queued findings.
Each finding was reproduced against the current Production authority before
its repair:

- Between-stage routing: a focused washing-complete/drying-planned fixture
  derived `washing` from the stale batch status. Preview therefore released
  `washing`, `drying`, and `folding_packaging`; commit then searched for a
  completed washing attempt as though it were still assigned.
- Assigned machine capacity: a PostgreSQL characterization routed a 20 lb
  order into a 40 lb target whose planned washer held 50 lb. The target became
  60 lb and the old start path still started washing because it checked only
  assignment presence and overlap.
- Route idempotency: source inspection showed the only replay read before
  `loadContext(..., true)`, so an identical loser waiting on the run lock could
  continue into stale-version evaluation. The command payload also omitted the
  exception note entirely.
- History precision: PostgreSQL events at `.000900`, `.000500`, and `.000100`
  within one millisecond returned only the newest row after the first cursor
  round trip through `Date`.

These are implementation defects against existing durable invariants. No new
laundry-production policy or memory delta is required.

## T1 - Repair between-stage routing semantics

Production now derives the current routing milestone from the canonical stage
graph and persisted attempts rather than trusting the batch status alone. The
order-control read model and route command use the same pure derivation.

When washing is complete and drying is planned, routing preserves the
completed washing attempt and returns only the unfinished drying and
folding/packaging suffix. An unlocked snapshot mismatch is a refreshable
conflict; the same mismatch under the aggregate lock is an invariant failure.
Focused routing, command-capability, and use-case verification passed 28 tests
across 3 files.

## T2 - Fence assigned machine capacity

Planned washing and drying capacity is now the lower of pulse capacity and the
sum of active assigned machines' effective capacity. A missing or inactive
assignment contributes zero. Zero remains a valid wire value; negative values
remain invalid.

Routing locks affected machine and assignment rows in deterministic order.
Stage start revalidates batch weight and locks all location machines before it
accepts execution. The PostgreSQL hardening suite proves an under-capacity
route cannot leave the target startable, while valid zero and sufficient
capacity remain accepted. The combined routing/capacity/idempotency PostgreSQL
proof passed 13 tests across 3 files.

## T3 - Fence route idempotency under lock

The use case now repeats canonical replay resolution after acquiring the
run-first context lock and before mutable-version evaluation. Exception notes
are trimmed once and included in both the persisted command identity and route
audit input.

Focused use-case verification passed 11 tests. The PostgreSQL route fixture now
holds the run lock, starts two identical retries so both initial replay reads
miss, then proves one commit and one replay with the same committed versions.
It also proves one route event and one mutation are persisted.

## T4 - Preserve exact History cursor ordering

The internal cursor is version 2 and carries a validated six-digit UTC
timestamp key plus UUID. PostgreSQL selects the exact key and compares the
indexed `(created_at, id)` tuple against bound `timestamptz` and UUID values.
Lossy version-1 cursors fail closed and require a pagination restart. Migration
`0040_flashy_colossus.sql` adds matching History keyset indexes and its schema
snapshot records the exact database contract.

The precision regression now returns all three sub-millisecond rows exactly
once. Focused History unit and PostgreSQL verification passed 7 tests.

## V1 - Full LPMS and staging observability proof

The proof was run from a clean dependency state:

```text
pnpm clean: 26 tasks passed
pnpm build:integration-deps: 21 tasks passed
Production language: 20 files, 169 tests passed
Contracts: 16 files, 136 tests passed
Processor: 40 files, 275 tests passed
Production unit: 89 files, 431 tests passed
Production integration: 17 files, 40 tests passed
DB unit: 9 files, 46 tests passed
LPMS E2E: API 5 files/55 tests; Processor 40 files/275 tests passed
pnpm test:lpms:int: DB 22/88; Users 5/14; Orders 20/66;
  Webhook Ingestion 13/24; Worker 10/77; Production 106/471;
  root 1/8 files/tests passed
pnpm typecheck: 50 Turbo tasks plus browser and architecture checks passed
pnpm lint: 28 Turbo tasks plus browser and architecture checks passed
pnpm build: 28 tasks passed
pnpm format:check: passed
pnpm architecture:check: passed
pnpm lint:architecture: passed
Stateworks validation and verification: passed
```

The direct DB integration command without its repository harness reported
missing test-environment variables. The authoritative `pnpm test:lpms:int`
harness supplied the isolated database environment and passed all 88 DB tests.
This was a command-boundary error, not a product failure.

After the full suites, the topology proof found and repaired one real API
boundary defect: typed Identity failures had been thrown as plain data and
normalized to HTTP 500. Processor and Control now interpret expected login,
session, and MFA failures as `AppError` values. The revoked-session regression
passed in both browser boundaries (2 files, 13 tests), and the smoke assertion
remained unchanged at HTTP 401 `invalid_session`.

`pnpm docker:production:smoke` then passed on a disposable seven-container
topology. It proved clean migration, explicit synthetic bootstrap, two signed
submitted receipts, three ignored receipts, two accepted/projected orders,
one completed run, all eight stage commands, API and Worker restart recovery,
two monotonic TOTP challenges, secure host-only cookies, CSRF, server-side
session revocation, release switch/rollback, and complete resource teardown.
The steady-state snapshot measured 438,409,625 bytes, 10.21% of the 4 GiB pilot
floor, leaving 89.79% headroom. This one snapshot is not a capacity guarantee,
and the two synthetic release tags point to the same current-tree build.

Server-side staging observability used release
`61fde0690da2e3518b3345129c26ad42d9f5c550` and proof ID
`staging-20260807T022248Z-61fde0690da2` without recording DSNs or credentials:

- API issue `PRESSLY-API-A` and Worker issue `PRESSLY-WORKER-2` indexed as
  staging errors.
- API trace `e43cba0429a170eb3eb855e6f315bbc8` and Worker trace
  `6de6c03338b604a463e4fc6d25cffafd` indexed with the synthetic errors.
- Each trace contains its structured info log.
- `api.http_requests` and `worker.job_passes` each returned metric sum 1 in the
  `tracemetrics` dataset.
- The exact release contains both API and Worker projects, with one new group
  each.
- Staging workflows `3818785` and `3818786` fired at
  `2026-08-07T02:23:09Z` and `2026-08-07T02:23:07Z` respectively.
- Worker check-in `d30f10f1-2aa2-4317-bd3b-23f726fd975e` indexed `ok` in
  staging. Monitor `pressly-worker-progress` was returned to `disabled` until
  a real Worker deployment can sustain its one-minute schedule.

A browser source-map symbolication proof still requires an actual staging
browser build and deployment. No browser artifact was fabricated from this
server-side checkout.

Nonblocking output was limited to the existing Processor chunk-size warning
and existing Sheet accessibility warnings. The Web router instrumentation
warning was corrected before final build verification.

## T5 - Close evidence and memory impact

All four repairs restore previously recorded invariants; they do not change a
durable laundry-production belief. No domain memory delta was created. Release,
production deployment, old-monitor retirement, and pilot authorization remain
outside this completed repository/staging work package.

## Verification boundary

Repository, local-runtime, staging, Sentry control-plane, deployment, and pilot
evidence remain distinct. No green repository command alone authorizes a
production rollout or pilot.
