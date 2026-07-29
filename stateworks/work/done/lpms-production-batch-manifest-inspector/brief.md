# LPMS Production Batch Manifest Inspector

## Status

Done. Steven authorized activation and end-to-end implementation on
2026-07-29, and every implementation and verification task is committed.

## Observable Outcome

An employee can identify every order in any live production batch without
expanding the Production board or losing the stage action they were working
from.

The Production board keeps its current height and stage-action ownership.
Every batch card exposes one compact order-summary trigger. Activating it opens
a bottom drawer that occupies 90% of the viewport on desktop and mobile,
preserves the board scroll position, and returns focus to the originating
trigger when closed.

The drawer provides:

- the selected batch number, current batch status, total weight, order count,
  bag count, and membership state;
- a selector for moving between every batch in the current run without closing
  the drawer;
- one readable row per order with canonical customer name, canonical order
  number, bag count, weight, priority, and pinned-placement context; and
- internal scrolling beneath a fixed drawer header.

## Product and Domain Boundaries

- The inspector is a read-only Processor projection. It introduces no
  Production command, lifecycle state, state transition, persistence, or
  scheduling behavior.
- Stage Start and Complete remain available only on the Production board.
- Production continues to own only demand and floor facts. Canonical customer
  and order identity is composed at the API-owned Processor read boundary.
- Identity resolution is batched with the existing workspace read. The browser
  performs no per-order fetch and the backend introduces no N+1 query.
- The existing shadcn Drawer primitive and Pressly design tokens are reused.
- The current board layout, responsive stage tabs, scroll position, live
  refresh behavior, and mutation actions remain intact.

## Verification Target

- Contract and read-model tests prove nested batch orders receive canonical
  identities through one bounded resolution call.
- Processor tests prove every batch trigger opens the correct manifest, batch
  switching works, the drawer is 90 viewport-height units, and close restores
  focus.
- English and Spanish copy, unknown-customer fallback, long identity text,
  priority, bag totals, and multiple-batch behavior are covered.
- Rendered desktop and narrow-viewport checks confirm the board does not grow,
  the drawer scrolls internally, stage actions remain reachable after close,
  and the browser console is clean.

## Definition of Done

All Stateworks tasks are committed with concrete evidence. The live Production
board remains operationally compact, while employees can open a large,
accessible batch manifest and reliably identify the physical orders moving
together through the floor.
