# Processor Incoming Orders Design QA

## Boundary

Rendered verification used the rebuilt local Docker topology at
`http://localhost:4173/orders` with synthetic, non-production proposals. No
production account, production data, or live Cents delivery was changed.

## Desktop

- Incoming is the default Orders view; Current orders is the secondary view.
- Incoming presents a normal five-column table: recognizable Order/customer,
  picked-up time, due time, estimated demand, and local actions.
- Source information is bounded to provenance (`Reported by Cents`). No vendor
  lifecycle, source-authority posture, field-following, or reconciliation
  control is exposed.
- Accept into Pressly is the primary action. Reject is the secondary action and
  requires an audited reason.
- Accept removed the proposal and created one canonical Current order in Needs
  intake. Reject removed its proposal and created no Current order.
- Current orders retained archive review, filters, customer names, row
  identity, and server-owned action availability.
- The dedicated workspace scroll container moved from `scrollTop=0` to
  `scrollTop=187` under direct rendered interaction; page scrolling was not
  locked.

## Mobile

- Verified at a 390 x 844 viewport.
- Incoming uses one readable card per proposal with identity, phone/email,
  provenance, pickup, due, demand, and full-width Reject/Accept actions.
- Current orders retains its archive review, filters, customer identity, state,
  floor position, and reachable Open order action without horizontal clipping.
- Navigation collapses to the existing mobile menu; the Orders view tabs and
  all primary actions remain reachable.

## Interaction and Accessibility

- The Incoming section is labelled by its real `h2` and reports loading with
  `aria-busy`.
- Enter opens the confirmation dialog and Escape closes it.
- A rendered Chrome regression exposed that the controlled dialog originally
  returned focus to `body`. The workspace now records the exact row trigger and
  restores focus through `onCloseAutoFocus`; Chrome verified focus returned to
  the `Accept order QA-MOBILE into Pressly` button.
- The decision dialogs explain canonical effects before confirmation. Rejection
  validation is distinct from server-command failure, and typed conflicts have
  separate messages.
- An exact already-linked proposal is server-shaped as Reject-only with a local
  explanation instead of an enabled Accept action.

## Runtime Evidence

- Synthetic exact `PICKED_UP` events produced pending proposals.
- A synthetic `IN_PROGRESS` event returned an ignored receipt and produced no
  proposal.
- Accept created a terminal accepted resolution, canonical Order, and released
  fulfillment.
- Reject created a terminal rejected resolution with no canonical identifiers.
- Later pickup and post-pickup replays left both immutable proposal snapshots
  and terminal resolutions unchanged.
- Browser console inspection returned no warnings or errors.
