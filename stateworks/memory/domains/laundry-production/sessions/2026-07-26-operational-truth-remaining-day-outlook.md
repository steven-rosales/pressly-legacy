# Operational Truth and Remaining-Day Outlook

Date: 2026-07-26
Domain: laundry-production
Topic: Pressly floor authority, persistent lifecycle graphs, and the Processor forecast surface

## Sources

- Steven's explicit 2026-07-26 clarification that Pressly is operational truth,
  Cents is an input source, and Pressly state transitions are permanent.
- Steven's explicit definition of `/forecast` as the work remaining for the
  selected day, including work that can join the active run and work that needs
  another shift that day.
- Steven's decision that Home retains a compact outlook while the full detail
  moves to `/forecast` and Schedule focuses on scheduling-ready orders.
- Cents Help Center, `Cents Webhooks`, updated 2026-04-16:
  <https://chathelp.trycents.com/en/articles/12083443-cents-webhooks>
- `stateworks/memory/domains/order-management/sessions/2026-07-26-pressly-source-lifecycle-authority.md`
- `modules/business/production/src/load-production-workspace/demand-outlook.policy.ts`
- `modules/business/production/src/list-production-order-control`
- `modules/computation/order-control/src`
- `modules/policy/production/src/stage-transition`
- `packages/kernel/src/state-machine.ts`
- `apps/processor/src/features/demand-outlook`
- `apps/processor/src/app/app.tsx`
- `apps/processor/src/app/app.navigation.ts`
- `docs/architecture.md`
- `stateworks/memory/domains/laundry-production/memory.yaml`

## Evidence Boundary

The current repository contains a shift-scoped demand outlook that combines
expected and ready demand, suppresses its forecast whenever an active run
exists, and projects source-versus-floor comparison attention. The Processor
renders the detailed card on Home and Schedule. This is implementation
evidence of the gap; it is not the intended domain model.

This session records confirmed business and product decisions only. It does not
claim that the remaining-day projection, endpoint, `/forecast` route, or
lifecycle graph consolidation is implemented.

## Confirmed Durable Rules

- Pressly is the authority for physical production. External lifecycle values
  cannot start, advance, finish, cancel, rewind, or delete Pressly floor work.
- Once the Orders handoff has occurred, downstream Cents lifecycle changes are
  retained for audit but create no floor comparison or reconciliation task.
- A pre-handoff withdrawal may remove prospective source demand and may
  supersede a still-prospective manual admission override. It cannot erase
  physically received, selected, scheduled, batched, active, or finished
  Pressly work.
- Source-owned non-lifecycle facts may continue to update through Orders and the
  source-neutral Production demand boundary under their own authority rules.
- Each persistent Production aggregate lifecycle has one authoritative explicit
  state/event graph. Cross-aggregate use cases orchestrate those graphs and
  effects; derived readiness, milestones, attention, and forecast categories
  remain pure projections. Pressly does not need a global workflow engine.
- The remaining-day outlook is a location- and local-service-day-scoped,
  deterministic, read-only projection of unfinished work still relevant today.
- The outlook partitions work into: in the active production run, ready to
  place into today's execution, expected later but not executable yet, and work
  that needs another shift or remains unassigned today.
- Appendability uses the same server-owned placement and hard-capacity rules as
  execution. The outlook cannot invent a shift, batch, bag count, or completion
  time.
- Finished Pressly work is excluded from remaining-day totals and groups.
- `/forecast` owns the detailed remaining-day outlook. Home shows only a compact
  operational summary and link. Schedule shows only bounded context needed to
  schedule ready orders and does not contain the detailed forecast workspace.
- Processor floor actions and attention derive from canonical Pressly state and
  server-authorized events, not from a Cents-versus-Pressly comparison.

## Memory Reconciliation

- Deprecate the source-versus-floor comparison decision and the old
  shift-scoped `demand_outlook` object.
- Narrow source withdrawal to prospective pre-handoff work and remove
  comparison attention after handoff.
- Replace the empty-pipeline advisory forecast invariant with a
  remaining-day, active-run-aware, non-executable projection.
- Record the dedicated `/forecast`, compact Home, and focused Schedule
  information architecture.
- Record authoritative lifecycle graphs while explicitly excluding derived
  projections and a global workflow engine.

## Applied Memory Delta

- `stateworks/memory/domains/laundry-production/deltas/2026-07-26-operational-truth-remaining-day-outlook.memory-delta.yaml`
