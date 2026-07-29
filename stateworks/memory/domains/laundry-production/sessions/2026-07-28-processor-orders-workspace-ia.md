# Processor Orders Workspace Information Architecture

Date: 2026-07-28
Domain: laundry-production
Topic: Separate the daily operational overview from cross-workflow order control

## Source

- Steven's 2026-07-28 implementation decision that the full Order Control
  workspace no longer belongs inside Processor Home.
- Steven's supplied Processor screenshots and the existing Home, Intake,
  History, Forecast, and order-detail workflows were reviewed together.
- The current Laundry Production memory and LPMS plan were inspected for
  conflicting route ownership before this decision was recorded.

## Confirmed Facts

- Home currently combines a remaining-day operational summary with the full
  server-paginated Order Control workspace.
- Order search, cross-workflow filtering, detail and action review, and manager
  backlog archive review are order-management tasks rather than a daily
  overview.
- Forecast already owns detailed remaining-day planning, History owns
  read-only audit, and Intake, Schedule, and Production own their respective
  physical-work steps.
- Order actions must continue to come from the server-composed operational
  Order read model and authoritative lifecycle graphs and policies.

## Decisions

- Processor Home becomes a compact operational overview and launcher. It may
  show bounded remaining-day and attention summaries with links, but it does
  not duplicate the full Order Control workspace.
- A dedicated `/orders` workspace owns cross-workflow order search,
  server-side filters, bounded keyset pagination, order detail and available
  actions, and manager backlog archive review.
- `/forecast` remains the detailed remaining-day planning surface and
  `/history` remains the read-only production audit surface.
- Whole-order routing begins from the dedicated Orders workspace while all
  existing graph, authorization, version, idempotency, capacity, and
  transaction boundaries remain unchanged.
- This information-architecture change does not move domain command authority
  into the browser and does not introduce a second order read or action model.

## Assumptions

- The existing order-control contract remains the bounded server-owned query
  behind `/orders`.
- Home attention summaries are bounded previews and link to `/orders` for
  complete review.

## Open Questions

- None. Steven authorized implementation of the agreed information
  architecture.

## Evidence Boundary

- This session records route and workspace ownership, not implementation or
  deployment proof.
- Intake tab ordering and order-detail drawer spacing are presentation changes
  and do not alter durable laundry-production rules.
- No secret, credential, customer payload, private token, or production data is
  recorded.

## Candidate Memory Deltas

- Supersede the order-first Home decision with a compact Home and dedicated
  `/orders` workspace.
- Update whole-order routing to begin from `/orders` rather than Home.
