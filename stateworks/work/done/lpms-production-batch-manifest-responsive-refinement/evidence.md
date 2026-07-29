# LPMS Production Batch Manifest Responsive Refinement Evidence

## 2026-07-29 - Activation

status: active

- Steven approved activation and end-to-end implementation.
- The queued network validated before activation.
- This work is limited to the existing Processor production-board projection,
  responsive presentation, localization, focused tests, and rendered QA.
- Existing unrelated dirty work is preserved and is not reset, staged, or
  attributed to this package.

## 2026-07-29 - T0 rebaseline committed

status: committed

current presentation:

- `StageCard` repeats one link-styled manifest trigger in each of the four
  stage lanes for the same batch. The compact order and bag summary is useful
  floor context, but the repeated navigation is not.
- The existing Queue membership card already renders each batch once and owns
  the separate Freeze or Unfreeze control, making it the stable place for one
  explicit manifest action.
- `BatchOrderInspector` already owns selected-batch lookup, batch switching,
  canonical order and customer identity, due state, weight, bags, priority,
  pinned placement, controlled close behavior, and exact focus restoration.
- The board already computes a mobile breakpoint and the repository already
  provides shadcn Sheet, Drawer, and Table primitives.

write boundary:

- Product changes are limited to the production board, batch inspector,
  English and Spanish presentation copy, and focused Processor tests.
- `ProcessorProductionBatch` already provides every fact required by the
  desktop table and mobile cards. No contract, API, persistence, scheduling,
  queue, lifecycle graph, Production command, or live-refresh change is
  required.
- The desktop and mobile surfaces will render one selected-batch projection;
  responsive layout will not create another source of operational state.

verification:

- The active Stateworks network validates.
- Lifecycle verification reports no stop reason and selects T0 only.
- Repository inventory confirmed the existing broad dirty work remains outside
  this package and must be preserved.

## 2026-07-29 - T1 responsive presentation committed

status: committed

implemented:

- Renamed Queue membership to Batch membership and made it the only manifest
  entry point, with one explicit View orders action per batch.
- Added order, bag, and weight totals to each membership card while preserving
  the independent Freeze or Unfreeze action.
- Replaced all four repeated stage-card links with the same passive order and
  bag summary, leaving Start, Complete, and machine actions in place.
- Split the manifest shell at the existing mobile breakpoint without
  duplicating selected-batch state:
  - desktop renders a non-draggable, bottom shadcn Sheet at 90 dynamic
    viewport-height units with a semantic five-column table; and
  - mobile renders the existing draggable shadcn Drawer at 90 dynamic
    viewport-height units with stacked order cards.
- Both shells retain batch switching, canonical order and customer identity,
  due, bags, weight, priority, pinned placement, controlled close, and exact
  focus restoration.
- Added complete English and Spanish copy for Batch membership, the manifest
  action, and table headings.

verification:

- Focused Production-board tests passed: 19 tests.
- Responsive tests cover one membership trigger per batch, passive stage
  summaries, desktop Sheet/table structure, mobile Drawer/cards, batch
  switching, preserved stage and membership controls, and focus return.
- Processor typecheck and lint passed.
- Processor production build passed with only the existing non-blocking
  bundle-size advisory.
- No contract, API, domain, lifecycle graph, persistence, scheduling, queue,
  or command file was changed by this package.

## 2026-07-29 - V1 verification committed

status: committed

repository verification:

- Focused Production-board tests passed: 19 tests.
- Full Processor tests passed: 40 files and 258 tests.
- Processor typecheck, lint, and production build passed. The build emitted
  only the existing non-blocking bundle-size advisory.
- Repository formatting, Stateworks validation and lifecycle verification, and
  whitespace checks passed after the final evidence update.

rendered desktop verification:

- At 1920 x 945, Batch membership rendered exactly two View orders actions for
  two batches; all stage-card summaries were passive.
- The open desktop manifest was a non-draggable bottom Sheet at exactly 90
  percent viewport height with no drag handle, a semantic five-column table,
  three order rows, sticky headings, and no horizontal document overflow.
- Batch switching kept the inspector open. Closing returned focus to the exact
  Batch 1 membership trigger and preserved the board position.

rendered mobile verification:

- At 390 x 844, the manifest was a draggable bottom Drawer at 90 percent
  viewport height with three stacked order cards, no desktop Sheet or table,
  no horizontal document overflow, and a 44 x 44 pixel close target.
- Closing returned focus to the exact Batch 1 membership trigger.
- Browser console warnings and errors: none.

verification boundary:

- Evidence is from the local Docker Processor fixture. It does not claim a
  production deployment or an employee pilot in the laundry.
- No contract, API, domain lifecycle, persistence, scheduling, queue, or
  command behavior changed.
