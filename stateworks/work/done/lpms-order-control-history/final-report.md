# LPMS Order Control and Production History Final Report

Status: complete and verified

## Implemented Result

LPMS now provides order-level control without creating a competing execution
state machine:

- the root Home workspace is a bounded, server-paginated order projection;
- queued orders can move as complete units to an exact selected mutable batch;
- in-flight orders can be left behind or assigned bounded rework in the
  earliest feasible later batch;
- preview and commit remain version-, actor-, scope-, and proposal-bound;
- one transaction preserves active membership, hard capacity, attempts,
  aggregate weights, versions, overtime invalidation, and audit;
- `stage_run` remains the sole canonical batch-stage transition authority;
- immutable order-stage attempts preserve completed and released route
  history without becoming a second workflow state machine; and
- `/history` provides bounded runs, sanitized activity, schedule plans, and
  historical run detail without exposing raw work-event or idempotency data.

The v1 sole-order route rejection remains intentional. Empty-batch retention
or deletion, queue resequencing, reservation cleanup, in-flight compensation,
and completion effects require an explicit follow-up policy.

## Verification Status

Focused contract, policy, business, Processor, database, and Postgres
integration gates passed. The History and order-control integration slice
passed 7/7, the complete production integration package passed 18/18, and the
database integration package passed 45/45 through the isolated repository
harness. The isolated routing-migration proof also passed 3/3, covering its
backfill, constraints, and both ambiguity abort cases. Exact commands, counts,
evidence boundaries, and environment invocation repairs are recorded in
`evidence.md`.

The repository-wide typecheck, lint, package test graph, and build also
passed. The dedicated LPMS integration harness passed its database, webhook,
worker, production, and tooling suites, while the LPMS end-to-end command
passed 42 API/Cents tests and all 135 Processor tests.

Stateworks network, state, memory, delta, formatting, and scoped diff
validators passed after closure.

## Memory and Release Posture

Laundry-production memory is v9. The
`2026-07-15-order-control-history` implementation delta was accepted, applied
exactly once, and used to regenerate `context-pack.md`.

Generic holds, hard-confirmed cancellation, damaged-item and missing-bag
workflows, backward correction/reopen, bulk routing, drag-and-drop, and
sole-order empty-batch compensation remain deferred. The separate
`lpms-production-readiness` work remains at its existing human gate.

Result: complete. This package records a verified implementation checkpoint;
it does not claim deployment or pilot completion.
