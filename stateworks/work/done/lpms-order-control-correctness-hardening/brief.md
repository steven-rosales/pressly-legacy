# LPMS Order-Control Correctness Hardening - Complete

## Status

Complete on `2026-08-06`. Whole-order routing, History pagination, local LPMS,
the production topology, and server-side staging observability are verified.
Browser source-map and production/pilot proof remain separate release gates.

## Current Rebaseline - 2026-08-06

The architecture migration was complete on this branch and the four findings
reproduced against the current Production authority. This pass kept the repairs
independent: stage-gap semantics, assigned machine capacity, route idempotency,
and exact History ordering each received their own proof.

The branch also contains the cross-runtime Sentry observability work. That work
does not change Production policy, but V1 must verify its staging-facing API,
Worker, logging, metrics, tracing, and Cron configuration alongside the LPMS
integration and end-to-end proof.

## Rebaseline After Operational Authority

The completed `lpms-operational-authority-remaining-day-forecast` package
changed the baseline this work must inspect:

- source observations and canonical Pressly lifecycle are now separate;
- persistent Production execution uses explicit aggregate-owned graphs;
- production-order execution is separated from derived operational readiness;
- Home and History use current server-owned contracts and pagination;
- Schedule owns explicit post-start placement into the existing run; and
- `/forecast` owns the detailed remaining-day read model.

T0 must reproduce all four findings against this current implementation before
repair. Do not restore deleted comparison code, mixed readiness state, or
client-owned transition logic while fixing the gaps.

The prior `lpms-order-control-history` package remains a useful historical
checkpoint: its recorded commands passed. A later read-only audit found four
correctness gaps that those tests did not cover. This work records the new
evidence without rewriting historical results.

## Architecture Rebaseline - 2026-08-03

Production is now the sole authority for its application features, intrinsic
rules, and approved scheduling algorithms. The architecture migration moved
the affected slices without claiming or implementing any of the four repairs:

- whole-order routing is under
  `modules/business/production/src/features/orders/route-order`;
- routing and stage rules are under
  `modules/business/production/src/foundations/language/{order-routing,stage-transition}`;
- PostgreSQL command, execution, and scheduling adapters are under
  `modules/business/production/src/foundations/adapters/postgres`;
- History application features are under
  `modules/business/production/src/features/history`;
- the current cursor factory remains under
  `modules/business/production/src/foundations/language/history`; and
- History repositories and row mappers are under
  `modules/business/production/src/foundations/adapters/postgres/history`.

The moved routing, lifecycle, idempotency, cursor, and PostgreSQL suites passed
as behavior-preserving characterization during the migration. They do not
contain the deterministic red proofs required by this work's Definition of
Done. T0 must still reproduce every gap against these current paths before any
repair begins.

## Completed UI Checkpoint

The current worktree also contains a small Processor loading-state improvement:

- order search alone is debounced;
- tabs, filters, pages, and revision invalidations load immediately;
- established Home and History results remain visible during refreshes;
- initial skeleton rows are visually delayed to avoid fast flashes; and
- refresh activity is exposed without replacing settled content.

Focused verification completed before this handoff:

```text
Processor focused tests: 4 files, 10 tests passed
Processor typecheck: passed
Processor lint: passed
```

Local Docker runtime state was not re-proven as part of this memory handoff.

## Correctness Gaps

### 1. Routing can stale machine-capacity assignments

Moving an order raises the target batch weight, but planned washer or dryer
assignments are not recomputed or invalidated. Stage start currently proves
assignment presence and overlap, not that assigned effective capacity still
covers the routed batch.

Required result: a route cannot leave a stage startable with an under-capacity
machine plan.

### 2. Routing can fail in the valid gap between stages

After a nonfinal stage completes and before the next stage starts, batch status
still names the completed stage. Routing can therefore select a completed
attempt as current and then reject because that attempt is no longer assigned.

Required result: route eligibility derives the current physical milestone from
the canonical stage graph and attempt lifecycle, including the between-stage
gap.

### 3. Route idempotency is checked before the aggregate lock only

Two identical concurrent retries can both pass the early replay check. The
loser may return a stale queue or version conflict instead of the committed
replay. The exception note is also missing from canonical command identity.

Required result: replay is rechecked under the run-first aggregate lock, and
every mutation-relevant request field participates in command identity.

### 4. History cursors lose PostgreSQL timestamp precision

The History cursor converts `timestamptz` through JavaScript `Date` and
`toISOString()`, truncating PostgreSQL microseconds. Exact database comparison
can then skip older events inside the same millisecond.

Required result: keyset cursors preserve the exact database ordering key or use
an ordering representation whose round trip cannot lose rows.

## Non-Negotiable Invariants

- `stage_run` remains the only canonical batch-stage transition authority.
- Whole-order routing remains atomic, hard-capacity-bound, versioned, and
  run-first locked.
- Existing orders are never silently split or moved by automatic repair.
- Idempotent retries return the original committed result.
- History pagination returns every authorized row exactly once across pages.
- No migration or repair guesses at ambiguous production history.
- Release and pilot authorization remain separate human decisions after this
  repository, staging, and Sentry proof passes.

## Verification Target

- Focused pure-policy and use-case tests for the between-stage milestone.
- Postgres integration tests for machine-capacity route effects and concurrent
  identical route retries.
- Contract and integration tests proving note-bound command identity.
- Postgres fixtures with multiple history rows inside one millisecond.
- Full Production, database, Processor, LPMS integration, and LPMS end-to-end
  verification.
- Staging-facing API and Worker observability checks, including Sentry logs,
  traces, metrics, release health, and Worker Cron progress.
- Stateworks evidence that distinguishes repository proof from deployment or
  pilot proof.

## Definition of Done

All four gaps have deterministic tests that fail before the repair and pass
after it. The full LPMS proof is green, the Processor loading checkpoint is
retained, and any changed business belief is applied through a separate
laundry-production memory delta.
