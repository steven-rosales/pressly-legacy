# Intake Design QA

## Comparison target

- Source visual truth:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-b8a8cfd9-2aad-48e0-bf89-ec09599968df.png`
- Implementation:
  `http://localhost:4173/intake`
- Desktop implementation evidence:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-after-forecast-1714x828.png`
- Ready-state implementation evidence:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-after-ready-1714x828.png`
- Mobile implementation evidence:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-after-mobile-390x844.png`
- Source pixels: 1715 x 828.
- Desktop implementation pixels: 1714 x 828.
- Ready full-page implementation pixels: 1699 x 850.
- Mobile full-page implementation pixels: 375 x 1573 from a 390 x 844 CSS
  viewport.
- Density normalization: source and desktop implementation were compared at
  the same approximately 1714 x 828 CSS viewport at device scale 1. The
  one-pixel source-width difference is immaterial.
- States: Forecast only, Needs intake, Ready, and the compact mobile Forecast
  layout.

## Full-view comparison evidence

- Pressly's semantic primary token now owns the commit actions. The rendered
  buttons use the application blue instead of an Intake-local black treatment.
- The tabs no longer create a native scroll container. At 1714 px, the tab
  wrapper measured 1284 px for both `clientWidth` and `scrollWidth`, with
  `overflow-x` and `overflow-y` both visible. At 390 px, it measured 306 px for
  both widths, and the document measured 390 px for both client and scroll
  width.
- The desktop queue uses one explicit five-track grid for its header and every
  row. In Ready, all eight rows matched the header exactly:
  `347 / 251 / 287 / 180 / 216` px at the captured desktop width.
- The page uses the shared Processor Inter typography, semantic color tokens,
  border radii, control sizes, and 24 px section rhythm.
- Below the desktop table breakpoint, orders become individually bordered
  compact cards with full-width, 44 px actions.

## Focused region comparison evidence

- Tabs: the prior native scrollbar arrows are absent in Forecast, Needs intake,
  Ready, and mobile Forecast.
- Queue columns: the Source, Intake, Demand, and Next action starts remain
  vertically aligned in every captured Ready row, including rows with warnings,
  no action, and the Return to forecast action.
- Actions: Forecast commit actions render in Pressly blue; reversible actions
  remain outlined; disabled intake actions retain the primary hue at reduced
  opacity.
- Typography and copy: page hierarchy remains 24 px/14 px, rows remain
  14 px/12 px, and the Pressly-versus-Cents explanation remains explicit.
- Images and assets: the screen contains no raster imagery. Existing Tabler
  icons and the Processor brand mark were retained; no placeholder or
  handcrafted image assets were introduced.

## Comparison history

### Pass 1 findings

- P1: Intake-local black primary actions conflicted with Pressly's application
  palette.
- P1: the desktop tab wrapper was a native overflow container, producing
  visible horizontal and vertical scrollbar controls.
- P1: every row independently resolved an intrinsic `auto` action track, so
  column widths moved according to row content.
- P2: Intake used a tighter four-pixel section rhythm than the surrounding
  Processor workspaces.
- P2: compact layouts grouped every order into one divided container rather
  than the card treatment used elsewhere in Processor.

### Fixes

- Restored the shared default primary button variant.
- Removed the tab overflow wrapper and made the tabs distribute within their
  available width.
- Replaced the intrinsic action track with one shared non-intrinsic five-column
  template.
- Restored the shared 24 px workspace rhythm.
- Applied the existing responsive card pattern and 44 px mobile action target.
- Added regression tests for the tab scroller and stable grid template.

### Post-fix evidence

- Desktop document width: 1714 px client and scroll width.
- Mobile document width: 390 px client and scroll width.
- Ready header and all eight rows share identical column coordinates.
- Forecast, Needs intake, and Ready tabs switched successfully.
- Browser console warnings and errors: none.
- Focused test result: 28 passing tests.
- Processor typecheck, lint, formatting, and production Docker build passed.

## Remaining findings

No actionable P0, P1, or P2 visual findings remain for the supplied scope.

final result: passed

# Production Batch Manifest Responsive Refinement QA

## Comparison target

- Supplied desktop manifest:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-7e255930-19a5-47e7-9d3c-09b762e4ae4c.png`
- Supplied Production board:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-be5dcfe5-7789-4e96-a517-808e497dfc24.png`
- Final desktop board:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-manifest-desktop-closed.png`
- Final desktop manifest:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-manifest-desktop-open.png`
- Final mobile manifest:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-manifest-mobile-open.png`
- Mechanical same-input comparisons:
  - `C:\Users\junni\AppData\Local\Temp\pressly-manifest-closed-comparison.png`
  - `C:\Users\junni\AppData\Local\Temp\pressly-manifest-open-comparison.png`

## Information architecture and visual evidence

- Batch membership is the single manifest-entry region. The fixture renders
  two batches and exactly two explicit View orders actions; the four stage
  lanes retain passive order-and-bag summaries with no manifest links.
- Each Batch membership card exposes the batch's stage, membership state,
  order, bag, and weight totals while keeping Freeze or Unfreeze as a separate
  action.
- At 1920 x 945, the manifest is a bottom-anchored, non-draggable shadcn Sheet
  occupying exactly 90 percent of the viewport height. It has no drag handle
  and renders a semantic five-column order table with sticky headings.
- The desktop table exposes canonical Order / customer identity, Bags, Weight,
  Due, and Handling in ordinary rows. The tested batch renders three rows
  without horizontal document overflow.
- At 390 x 844, the manifest remains a draggable shadcn Drawer occupying 90
  percent of the viewport height. It renders three stacked order cards, no
  desktop table or Sheet, no horizontal document overflow, and a 44 x 44 pixel
  close target.

## Interaction and accessibility evidence

- Opening Batch 1, switching to Batch 2, and closing the desktop Sheet all
  preserve the board position. Closing restores focus to the exact Batch 1
  membership trigger.
- Closing the mobile Drawer restores focus to the exact Batch 1 membership
  trigger.
- Stage Start, Complete, and machine actions remain in place, and Batch
  membership Freeze or Unfreeze remains independent of View orders.
- The desktop surface uses Sheet title and description semantics; the mobile
  surface uses Drawer title and description semantics. Both use the same
  selected-batch projection and batch selector.
- Rendered browser console warnings and errors: none.

## Verification boundary

- This evidence uses the local Docker Processor fixture. It does not claim a
  production deployment or an employee pilot in the laundry.
- No contract, API, database, lifecycle graph, Production policy, scheduling,
  queue, or command behavior changed in this refinement.

final result: passed

# Production Batch Manifest Inspector QA

## Comparison target

- Supplied Production reference:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-b206bebd-04a0-4569-9899-bfe6621a1450.png`
- Closed-board implementation:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-closed-desktop.png`
- Same-input side-by-side comparison:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-reference-comparison.png`
- Open desktop inspector:
  `C:\Users\junni\AppData\Local\Temp\pressly-batch-inspector-desktop.png`
- Open 390 x 844 inspector:
  `C:\Users\junni\AppData\Local\Temp\pressly-batch-inspector-mobile.png`
- Implementation:
  `http://localhost:4173/production/eaac5fa1-6e9d-41ed-a632-b8b5b25fa7aa`

## Full-view and responsive evidence

- The Production board keeps its supplied dimensions, hierarchy, stage
  columns, and stage-action positions. Each repeated batch card replaces only
  the truncated order-ID string with a compact `orders · bags` trigger.
- The inspector is a bottom shadcn Drawer at exactly 90 dynamic viewport-height
  units on desktop and mobile. In the final 1920 x 945 desktop preview it
  measured 850.5 px high (exactly `0.9` of the viewport); at 390 x 844 it
  measured 759.59375 px high (`0.899992...`).
- The fixed drawer header keeps batch identity, totals, a stable-ID batch
  selector, and the close action visible. The manifest owns the remaining
  internal scroll region, so larger batches do not add height to or move the
  Production board.
- Desktop order rows expose canonical order and customer identity, weight,
  bags, due status, priority, and pinned-placement context. At 390 px, identity
  remains primary and the due/priority metadata stacks without clipping or
  horizontal document overflow.
- The live fixture contains only three orders in its largest batch, so visible
  overflow could not be exercised with production-shaped data. The dedicated
  `ScrollArea` structure and focused regression coverage verify the bounded
  internal-scroll behavior.

## Interaction and accessibility evidence

- Opening Batch 1 from a stage card selected the correct manifest. Switching
  the labelled batch Select to Batch 2 changed the title, totals, and orders
  without closing the drawer.
- Closing the drawer restored focus to the exact originating trigger,
  `View orders in Batch 1: 3 orders · 8 bags`, without scrolling the board.
- Existing Start, Complete, machine, membership, reconciliation, refresh, and
  record-progress controls remain mounted and usable after the inspector
  closes.
- The browser console contained no warnings or errors after opening, switching,
  closing, and repeating the interaction at desktop and narrow viewports.
- No lifecycle transition, queue mutation, or Production-domain authority was
  added. The inspector is a read-only Processor projection composed from the
  authoritative board and Processor-owned order identity.

## Remaining findings

- No actionable P0, P1, or P2 visual, responsive, interaction, or
  accessibility finding remains in the approved scope.

final result: passed

# Processor Home, Orders, Intake, and Order Detail QA

## Comparison evidence

- Supplied Intake reference:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-48c7a7c9-00d6-4d17-a7ab-2f514fccae5c.png`
- Final desktop Intake:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-tabs-qa-desktop.png`
- Supplied order-detail reference:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-bbc01e6b-a5bb-4e55-8d6a-e6c4ad951d80.png`
- Final desktop order detail:
  `C:\Users\junni\AppData\Local\Temp\pressly-order-drawer-qa-desktop.png`
- Final 390 x 844 order detail:
  `C:\Users\junni\AppData\Local\Temp\pressly-order-drawer-qa-mobile.png`
- Final desktop Home:
  `C:\Users\junni\AppData\Local\Temp\pressly-home-orders-qa-desktop.png`
- Final 390 x 844 Home:
  `C:\Users\junni\AppData\Local\Temp\pressly-home-orders-qa-mobile.png`
- Final desktop Orders:
  `C:\Users\junni\AppData\Local\Temp\pressly-orders-workspace-qa-desktop.png`

## Information architecture and visual evidence

- Home is now a compact operational launcher. It keeps Remaining today and a
  server-backed Order attention digest with the total, up to three
  order/customer identities, the reason and due context, and one Open Orders
  action. Initial loading and errors do not present a false zero or clear state.
- Orders is a dedicated Manage & review workspace containing old-order review,
  full Order control, filters, pagination, and customer identity in every
  rendered order row/card.
- Intake opens on Needs intake and orders its workflow tabs as Needs intake,
  Forecast only, and Ready.
- Order detail presents Pressly operational truth first: state and anomalies,
  floor position and facts, actions, customer identity, then a collapsed Source
  & audit disclosure.
- Desktop and 390 x 844 order-detail captures retain ordinary horizontal
  gutters. Narrow fact cards reflow to one column and no card edge or long
  source value is clipped.
- Mobile Home and Orders preserve the same information hierarchy without
  horizontal document overflow. The mobile navigation includes Orders under
  Manage & review.
- The application shell owns one viewport-bounded vertical scroll region.
  Wheel/touch scrolling moved that region on long Intake and Orders states at
  1920 x 945 and 390 x 844, and changing workspaces reset it to the top.

## Interaction, accessibility, and verification evidence

- Home's Open Orders destination resolves to `/orders`; the Orders workspace
  exposes one H1 and labelled filters, tabs, rows/cards, pagination, and
  order-detail triggers.
- Intake keeps labelled workflow tabs, search, selects, spinbuttons, switches,
  and record-intake controls.
- Order detail remains a labelled dialog with semantic alerts, regions,
  definition lists, a collapsed source disclosure, and a persistent Close
  action.
- Processor verification: 38 test files and 239 tests passed. Processor
  typecheck, lint, production build, targeted formatting, architecture
  boundaries (70 tests), Stateworks memory validation, deterministic
  context-pack comparison, and `git diff --check` passed.
- Final rendered browser console warnings and errors: none.

## Remaining findings

- No actionable P0, P1, or P2 visual, interaction, or information-architecture
  finding remains in this scope.
- The production bundle retains the existing large-chunk warning; it does not
  block this UI behavior or visual handoff.

final result: passed

# Remaining-Day Forecast Information Architecture QA

## Comparison target

- Home source:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-ed74781e-837f-4e8e-8163-c231f594c90d.png`
- Schedule source:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-27c6fcac-6214-401f-b907-b78d11721c05.png`
- Intake source:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-b2ab456f-3160-44b1-90ec-554b790121c3.png`
- Home implementation:
  `C:\Users\junni\AppData\Local\Temp\pressly-home-remaining-day-1900x950.png`
  (1920 x 893).
- Schedule implementation:
  `C:\Users\junni\AppData\Local\Temp\pressly-schedule-remaining-day-1900x950.png`
  (1905 x 886).
- Forecast implementation:
  `C:\Users\junni\AppData\Local\Temp\pressly-forecast-1900x950.png`
  (1905 x 886).
- Intake implementation:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-final-1900x950.png`
  (1905 x 938).
- Mechanical same-input comparisons:
  - `C:\Users\junni\AppData\Local\Temp\pressly-home-before-after-composite.png`
  - `C:\Users\junni\AppData\Local\Temp\pressly-schedule-before-after-composite.png`
  - `C:\Users\junni\AppData\Local\Temp\pressly-intake-before-after-composite.png`

## Full-view comparison evidence

- Home now uses one compact, source-backed remaining-day strip. It preserves the
  existing Order control hierarchy above the fold and accounts for all four
  forecast buckets: In production, Ready to place, Expected later, and Needs
  another shift.
- Schedule now leads with shift selection, capacity, and the production
  timeline. Remaining-day context is a single compact strip after the schedule
  metrics; the detailed forecast and source-comparison warning are absent.
- Forecast is the dedicated detailed workspace. It exposes the selected
  service day, four mutually exclusive order groups, actual shift windows,
  server-evaluated capacity reasons, and destination-specific actions.
- Intake retains the shared five-column table at the largest breakpoint. The
  action heading and every action share the same left edge, ordinary padding,
  and a non-intrinsic 18 percent track; Priority switches have no redundant
  On/Off text.
- No implementation introduces local Cents-versus-Pressly lifecycle policy.
  The UI presents server-authorized actions and Pressly-native operational
  states.

## Interaction and accessibility evidence

- Direct `/forecast` entry, Home's Open Forecast action, and Schedule's Open
  Forecast action render the dedicated workspace.
- Forecast exposed six Open Intake and six Open Schedule actions in the local
  fixture. Exercising one of each navigated to `/intake` and `/schedule`.
- The How this outlook works disclosure expanded and exposed the revalidation
  and no-precise-finish-time assumptions.
- Forecast structure uses one H1, one H2, semantic H3 section headings, a
  labelled service-day input, real lists, definition lists, and labelled
  destination buttons. Intake keeps labelled spinbuttons and switches.
- Browser console warnings and errors across Home, Forecast, Schedule, and
  Intake: none.
- Focused and full Processor verification: 31 files and 189 tests passed. Two
  pre-existing Radix Sheet missing-description warnings remain nonblocking.

## Responsive verification limitation

- The previously accepted Intake mobile evidence remains:
  `C:\Users\junni\AppData\Local\Temp\pressly-intake-after-mobile-390x844.png`.
- Current responsive source and tests retain the existing mobile navigation,
  44 px action targets, Intake card fallback below 1536 px, and responsive
  Forecast/Schedule grids.
- A fresh mobile visual pass could not be truthfully recorded in this run.
  Chrome's viewport capability returned success but left the document at 1905
  CSS pixels, and Computer control stopped at its URL-verification safety gate
  before it could resize the Chrome window. The resulting attempted capture is
  intentionally excluded from evidence.

## Remaining findings

- No actionable P0, P1, or P2 desktop visual findings remain.
- Fresh mobile visual evidence is still required before V2 can be committed.

final result: blocked

# Live Schedule Placement and Production Handoff QA

## Comparison target

- Supplied Production source:
  `C:\Users\junni\AppData\Local\Temp\codex-clipboard-a97660bc-20c6-426b-a377-ce4f52a9ecc7.png`
- Final live Schedule:
  `C:\Users\junni\AppData\Local\Temp\pressly-live-schedule-desktop-final-2026-07-26.jpg`
- Final exact-placement sheet:
  `C:\Users\junni\AppData\Local\Temp\pressly-live-schedule-sheet-desktop-final-2026-07-26.jpg`
- Final 390 x 844 exact-placement sheet:
  `C:\Users\junni\AppData\Local\Temp\pressly-live-schedule-sheet-mobile-final-390x844-2026-07-26.jpg`
- Final compact Production handoff:
  `C:\Users\junni\AppData\Local\Temp\pressly-production-handoff-desktop-final-2026-07-26.jpg`

## Information architecture and visual evidence

- Schedule now owns post-start placement review. The live workspace identifies
  the exact shift window and existing run, keeps the accepted plan fixed, and
  shows ready work as a normal row with an order summary, server-selected best
  fit, exact capacity consequence, projected finish, and two bounded actions.
- The local fixture's authoritative recommendation was Batch 3, from 101 to
  194 of 224 lb, with an unchanged projected finish of Jul 26, 11:06 PM. The
  prior Production surface's impossible Batch 2 placement is absent.
- Production retains only a compact handoff stating that one ready order needs
  placement review, with one Review in Schedule action. The large Pending
  arrivals card, exact-placement controls, and placement mutation state are
  absent, so queue membership and physical stage progress remain primary.
- A compact remaining-day Forecast strip remains in live Schedule without
  recreating the detailed Forecast workspace.
- Desktop and 390 x 844 views have no horizontal document overflow. The
  exact-placement sheet becomes full-width on mobile and retains ordinary
  spacing, a persistent action region, and 44-pixel controls.

## Interaction, authority, and accessibility evidence

- Add at best fit uses only the server recommendation. Choose batch opens the
  shared shadcn Sheet and Select, lists only server-authorized targets, starts
  with no selection, and keeps Add to selected batch disabled until the manager
  makes an explicit choice.
- The sheet has an accessible title and description, names the order and
  destination control, and restores focus to that order's Choose batch trigger
  after its closing animation.
- Permission denial, stale queue, stale batch, loading, empty, error, automatic
  placement, exact placement, overtime confirmation, responsive structure, and
  English/Spanish copy have focused regression coverage.
- Forecast service-day selection uses the shared shadcn Popover and Calendar.
  The rendered control announces the selected date, opens a dialog containing
  a labelled calendar grid, closes after selection, and has no native date,
  datetime-local, or time input.
- Final rendered browser console warnings and errors: none.

## Remaining findings

- No actionable P0, P1, or P2 visual or interaction finding remains in this
  scope.
- Repository-wide formatting still reports three preserved pre-existing dirty
  files outside this UI change. This is a verification gate, not a rendered
  product defect.

final result: passed with an external repository-formatting gate

# Sidebar Navigation Hierarchy QA

- Desktop:
  `C:\Users\junni\AppData\Local\Temp\pressly-sidebar-sections-final-2026-07-26.jpg`
- Mobile 390 x 844:
  `C:\Users\junni\AppData\Local\Temp\pressly-sidebar-sections-mobile-final-390x844-2026-07-26.jpg`
- The shared desktop and mobile navigation keeps Home as a standalone first
  destination, followed by Intake, Schedule, and Production under Daily work;
  Forecast and History under Planning & review; and Configuration under System.
- Section labels render as quiet supporting text rather than clickable items.
  Existing icons, active states, routes, button sizing, and mobile drawer
  behavior are unchanged.
- The 390-pixel view has no horizontal overflow, and the browser console
  contains no warnings or errors.

final result: passed
