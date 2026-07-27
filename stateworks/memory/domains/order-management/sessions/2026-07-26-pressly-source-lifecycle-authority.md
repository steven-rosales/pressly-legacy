# Pressly Source Lifecycle Authority

Date: 2026-07-26
Domain: order-management
Topic: Separating external source observations from canonical Pressly lifecycle adoption

## Sources

- Steven's explicit 2026-07-26 clarification that Pressly is operational truth,
  Cents is an input source, Pressly transitions are permanent, and Cents
  lifecycle changes after `IN_PROGRESS` must not control Pressly state.
- Steven's approval of the corrected model: retain valid source observations
  for audit while discarding their authority over canonical lifecycle after the
  one-way handoff.
- Cents Help Center, `Cents Webhooks`, updated 2026-04-16:
  <https://chathelp.trycents.com/en/articles/12083443-cents-webhooks>
- `apps/worker/src/jobs/process-webhook-inbox/cents/cents-order.handler.ts`
- `modules/business/orders/src/order-lifecycle.policy.ts`
- `modules/business/orders/src/observe-order-source/observe-order-source.policy.ts`
- `modules/business/orders/src/observe-order-source/observe-order-source.usecase.ts`
- `packages/kernel/src/state-machine.ts`
- `docs/architecture.md`
- `stateworks/memory/domains/order-management/memory.yaml`

## Evidence Boundary

The Cents documentation confirms the supported order events and enumerates the
statuses `SUBMITTED`, `READY_FOR_PICKUP`, `PICKED_UP`, `IN_PROGRESS`,
`READY_FOR_RETURN`, `OUT_FOR_DELIVERY`, `COMPLETED`, and `CANCELLED`. It does
not document a delivery-order guarantee or a formal transition graph. The
one-way handoff and Pressly-authority rules below are Steven's confirmed Pressly
domain decisions, not claims about an undocumented Cents delivery contract.

Repository evidence shows the current adapter maps every non-canceled
`IN_PROGRESS`-or-later status to released, maps `COMPLETED` and `CANCELED` into
canonical commercial terminal states, and rejects terminal regressions as
invalid source transitions. That implementation conflicts with the confirmed
model and is not treated as durable truth.

This session records domain and architecture decisions only. It does not claim
that the implementation, database, API, or Processor already satisfies them.

## Confirmed Durable Rules

- Valid newer source observations are retained independently from whether their
  values are adopted into canonical Pressly state.
- Source revision ordering remains monotonic: stale observations are ignored,
  exact revision-and-hash replays are idempotent, and equal revisions with
  different hashes remain conflicts.
- Cents statuses before `IN_PROGRESS` describe prospective source-owned demand.
  They may update source-owned fields and may withdraw work that has not crossed
  the Pressly handoff.
- The first Cents `IN_PROGRESS`-or-later non-canceled observation is a one-way
  handoff signal that may advance an unreleased fulfillment to released.
- After the canonical handoff, later Cents lifecycle values, including
  regressions, completion, and cancellation, are observation-only. They cannot
  rewind, complete, cancel, withdraw, or otherwise terminalize canonical
  Pressly Order or fulfillment lifecycle.
- Ignoring a source lifecycle value means ignoring its canonical transition
  authority, not deleting the webhook receipt or latest normalized snapshot.
- Lifecycle authority is field-specific. Other source-owned values may continue
  to update under the existing canonical field-authority and revision rules.
- Pressly lifecycle transitions are permanent unless a separately modeled,
  explicit Pressly compensation workflow authorizes a change.
- Source lifecycle differences after handoff are integration and audit context,
  not production-floor work requiring an operator to compare systems.
- Each persistent Orders lifecycle has one authoritative explicit state/event
  graph. Application use cases orchestrate graph decisions and effects;
  adapters, controllers, and repositories do not define parallel transition
  tables, and derived read states remain projections.

## Memory Reconciliation

- Update the Cents observation workflow to separate observation retention from
  canonical adoption.
- Replace the current "all later states stay released and cancellation
  withdraws" policy with the one-way `IN_PROGRESS` handoff.
- Deprecate the policy that turns downstream source completion into a
  production-floor comparison task.
- Record authoritative lifecycle-graph ownership without introducing a global
  workflow engine.

## Applied Memory Delta

- `stateworks/memory/domains/order-management/deltas/2026-07-26-pressly-source-lifecycle-authority.memory-delta.yaml`
