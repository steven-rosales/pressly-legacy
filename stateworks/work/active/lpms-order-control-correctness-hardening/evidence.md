# Evidence

## Work

- Work ID: `lpms-order-control-correctness-hardening`
- Network:
  `stateworks/work/active/lpms-order-control-correctness-hardening/network.yaml`
- Started: `2026-08-06`
- Finished: In progress

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

Implementation and final combined verification are in progress.

## T2 - Fence assigned machine capacity

Implementation and final combined verification are in progress.

## T3 - Fence route idempotency under lock

The use case now repeats canonical replay resolution after acquiring the
run-first context lock and before mutable-version evaluation. Exception notes
are trimmed once and included in both the persisted command identity and route
audit input.

Focused use-case verification passed 11 tests. The PostgreSQL route fixture now
holds the run lock, starts two identical retries so both initial replay reads
miss, then proves one commit and one replay with the same committed versions.

## T4 - Preserve exact History cursor ordering

The internal cursor is version 2 and carries a validated six-digit UTC
timestamp key plus UUID. PostgreSQL selects the exact key and compares the
indexed `(created_at, id)` tuple against bound `timestamptz` and UUID values.
Lossy version-1 cursors fail closed and require a pagination restart; no public
contract or migration changed.

The precision regression now returns all three sub-millisecond rows exactly
once. Focused History unit and PostgreSQL verification passed 7 tests.

## Verification boundary

Repository, local-runtime, staging, Sentry control-plane, deployment, and pilot
evidence remain distinct. No green repository command alone authorizes a
production rollout or pilot.
