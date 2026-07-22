# Source-Neutral Order Boundary

Date: 2026-07-20
Domain: laundry-production
Topic: Replacing direct Cents demand vocabulary with canonical fulfillment admission

## Sources

- Steven's accepted source-neutral Users and Orders architecture recorded in
  `stateworks/memory/domains/order-management/sessions/2026-07-20-source-neutral-users-orders.md`.
- Repository inspection of `ApplyOrderDemand`, the Cents Worker consumer, and
  the Production schema.
- Existing laundry-production invariants that source lifecycle cannot advance
  floor truth and that pre-release intake remains unschedulable.

## Confirmed Decisions

- Production consumes a source-neutral fulfillment identity and release state,
  not Cents order identity or lifecycle strings.
- Pre-release commercial Orders remain advisory forecast input outside
  executable Production.
- Physical bag intake may still be recorded before release, but execution
  eligibility requires release, positive demand, and bag intake.
- Source downstream/completed status remains a comparison signal and cannot
  finish Production.
- User contact and commercial Order information are composed into Processor
  reads and are not copied into Production as write-owned state.

## Candidate Memory Delta

- `stateworks/memory/domains/laundry-production/deltas/2026-07-20-source-neutral-order-boundary.memory-delta.yaml`
