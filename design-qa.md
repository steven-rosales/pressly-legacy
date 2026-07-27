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
