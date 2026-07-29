# LPMS Production Batch Manifest Responsive Refinement

## Status

Active. Steven approved and activated this presentation refinement on
2026-07-29.

## Observable Outcome

An employee has exactly one obvious place to inspect the orders in each live
production batch.

The Production board's Batch membership section becomes the manifest entry
point. Each batch membership card shows the batch's current stage, membership
state, order count, bag count, and weight, with one explicit **View orders**
action. The same order-and-bag summary remains visible in every stage card as
passive context, but it is no longer another manifest link.

Opening **View orders** presents the same selected-batch manifest through a
device-appropriate shell:

- desktop uses a non-draggable, bottom-anchored shadcn Sheet at 90% of the
  viewport height, with a wide semantic table and sticky column headings; and
- mobile and narrow tablet widths retain the draggable 90%-height shadcn
  Drawer and readable stacked order cards.

Both surfaces show canonical order and customer identity, bags, weight, due
state, priority, and handling or placement context. Batch switching, close
behavior, board scroll preservation, and focus restoration remain available
without duplicating any Production command.

## Product and Domain Boundaries

- This is a read-only Processor presentation refinement over the existing
  enriched production-board projection.
- No contract, API, database, Production policy, lifecycle graph, scheduling,
  queue membership, stage action, or live-refresh behavior changes.
- Batch membership is the sole manifest entry point. Stage cards retain
  non-interactive summary text so operators can scan physical load without
  encountering four duplicate links per batch.
- The desktop table and mobile cards share one selected-batch view model and
  the same canonical facts; responsive rendering does not create a second
  source of state.
- Start, Complete, machine assignment, Freeze or Unfreeze, floor
  reconciliation, and all other mutation actions remain owned by their
  existing controls.
- Existing shadcn primitives and Pressly design tokens are reused.

## Interaction Contract

### Batch membership

- Rename the visible Queue membership heading to Batch membership.
- Preserve membership status and any existing membership mutation controls.
- Add one explicit **View orders** button per batch.
- Show order, bag, and weight totals in the membership card.
- Do not make the whole membership card clickable when it contains another
  action.

### Desktop manifest

- Use a bottom Sheet rather than a draggable Drawer.
- Keep the surface at 90 dynamic viewport-height units with a fixed toolbar and
  internal content scrolling.
- Present one semantic table with columns for Order / customer, Bags, Weight,
  Due, and Handling.
- Keep table headings visible while rows scroll.
- Do not render a drag handle or enable swipe-to-dismiss.

### Mobile manifest

- Retain a bottom Drawer, drag affordance, and stacked order cards.
- Keep touch targets at least 44 pixels high and avoid horizontal table
  scrolling.
- Preserve the same facts and selected batch as the desktop presentation.

## Verification Target

- Processor component tests prove that stage summaries are non-interactive and
  each Batch membership card owns exactly one manifest action.
- Responsive tests prove only the intended shell is active for the current
  viewport, while both shells consume the same selected-batch data.
- Desktop accessibility tests prove semantic table structure, sticky headings,
  no drag handle, batch switching, close behavior, and focus return.
- Mobile tests prove the Drawer, stacked cards, drag affordance, and 44-pixel
  actions remain intact.
- Rendered desktop and narrow-viewport checks confirm no duplicate entry
  points, no clipped table content, no horizontal mobile overflow, preserved
  board position, and a clean browser console.

## Definition of Done

Every batch has one manifest entry point in Batch membership. The Production
stage board remains compact and action-focused, desktop employees receive a
wide non-draggable table inspector, mobile employees retain the large
touch-friendly Drawer, and no operational or lifecycle behavior changes.
