# LPMS Production-Order Resolution and Row Identity Final Report

## Result

Status: done.

Managers now have a safe way to archive old, never-produced orders from active
Processor work without deleting records or pretending the work was completed.
The durable Production outcome is `resolved_without_production`, not finished,
canceled in Cents, or hard-deleted.

Resolution and restoration use one explicit Production lifecycle graph:

```text
open --resolve_without_production--> resolved_without_production
resolved_without_production --restore--> open
```

The graph owns persistent transitions. Application use cases orchestrate
authorization, guards, version checks, locking, idempotency, audit, and
transactional effects without defining parallel local transitions.

## Archive and Restore

- Manager-only single-order and bounded bulk commands are location-authorized,
  version-bound, idempotent, and actor-audited.
- Bulk review is cursor-bounded, partitions every reviewed order into four
  server-owned groups, and binds commit to the exact canonical preview hash.
- Current or historical Production participation blocks cleanup.
- Physical intake, manual admission, priority, or pending placement requires
  stronger individual review.
- Restore re-reads current source-owned due date, positive demand, provenance,
  commercial state, admission, and phase under the same lock before reopening
  work.
- Concurrent identical single and bulk retries recheck idempotency after the
  location lock and replay the committed result.
- `other` requires a nonblank note in contracts, HTTP validation, and database
  constraints.
- Later source observations remain retained but cannot resurrect resolved
  Production work.

## Processor

- Home provides a manager-only **Review old orders** entry point without a new
  primary navigation destination.
- The workflow explains that archive removes work from active operations while
  preserving permanent History and never marking it produced.
- The desktop sheet and mobile bottom workspace use shared shadcn controls,
  including the shadcn Calendar and Popover for the local cutoff date.
- History provides archived/restored filters and a manager-only explicit
  restore confirmation.
- Every individual operational order row now uses one shared identity pattern:
  canonical order number first and business name, personal name, or localized
  customer-unavailable fallback second.
- Customer identity is composed in one bounded API-owned batch and is not
  copied into Production persistence or domain contracts.

## Verification

Production policy passed 15 files and 146 tests. Contracts passed 11 files and
92 tests. Production passed 35 files and 167 unit/HTTP tests plus 15 files and
33 Postgres integration tests. Database unit/schema checks passed 5 files and
30 tests. API passed 19 files and 135 tests. Processor passed 37 files and 230
tests. Architecture boundaries passed 68 tests.

The full LPMS integration and LPMS end-to-end commands passed. Repository
typecheck completed 47 tasks, lint 26 tasks, and build 26 tasks. Whitespace
checking passed. Formatting passed for every implementation and package-owned
evidence file; the repository-wide formatter still reports one unrelated
pre-existing warning in
`stateworks/work/active/lpms-production-readiness/evidence.md`.

The API and Processor Docker images were rebuilt. Postgres, API, Processor,
and Worker were healthy; API readiness and Processor health endpoints
responded successfully.

Chrome verification covered desktop and mobile Home, review, shadcn Calendar,
Schedule, Forecast, History, and Intake behavior, including focus return,
responsive overflow, localized customer identity, and a clean console.

## Deliberate Exclusions

- No routine hard delete, PII erasure, retention-policy engine, or cold archive
  was introduced.
- Selected, scheduled, batched, active, routed, reconciled, or finished work
  cannot use this cleanup path.
- Finished work is not rewritten as resolved work.
- No external lifecycle value automatically resolves or restores an order.
- The queued Order Control correctness package remains separate; this report
  does not claim its known gaps are repaired.

## Evidence Boundary

This report proves repository behavior and the recorded local runtime only. It
does not prove production deployment, production data cardinality, legal
retention policy, live Cents behavior, or pilot readiness.

Status: done.

Every task in the Stateworks network has committed evidence. The validated
laundry-production memory delta was applied as memory version 16 and its
context pack was regenerated from source.
