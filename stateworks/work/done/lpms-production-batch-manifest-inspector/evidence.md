# LPMS Production Batch Manifest Inspector Evidence

## 2026-07-29 - T0 rebaseline committed

status: committed

scope:

- `apps/processor/src/features/production-board/production-board.view.tsx`
  owns the live board. Each stage card currently receives one concatenated
  `externalOrderId` string and truncates it in the card body.
- The board repeats the same batch membership across four canonical stage
  lanes. A manifest trigger can therefore select a batch by stable batch ID
  without changing stage execution or membership.
- `packages/contracts/src/production/production.contracts.ts` already returns
  every nested batch order with order ID, external order reference, due,
  priority, weight, bag count, version, placement provenance, and pinned facts.
- `packages/contracts/src/processor/processor-operational-order-identity.contracts.ts`
  composes canonical order and customer identity for Processor-only reads, but
  its workspace schema does not yet enrich `board.batches[].orders`.
- `apps/api/src/http/processor/operational-order-identity/operational-order-identity.read-model.ts`
  already performs one deduplicated bounded identity resolution for the
  workspace. Nested board orders can join that same call without a new module
  dependency, browser request, or Production-owned identity.
- `apps/processor/src/components/ui/drawer.tsx` is the existing shadcn/vaul
  Drawer primitive. A controlled bottom drawer can override its default
  80-viewport-height bound to exactly 90 dynamic viewport-height units.
- Existing Production-board tests live under
  `apps/processor/test/features/production-board`; contract tests and API
  Processor tests already cover the surrounding read composition.

implementation boundary:

- Extend only the Processor operational workspace schema and API read
  composition for nested identities.
- Add one read-only batch-manifest view and controlled drawer inside the
  existing Production board.
- Add English and Spanish presentation copy plus focused contract, API, and
  Processor tests.
- Do not change Production persistence, policy, lifecycle graphs, commands,
  scheduling, live refresh, or stage-action authority.

dirty-work boundary:

- The branch already contains a broad, user-authorized uncommitted order
  authority implementation and unrelated assets.
- This package does not reset, discard, stage, or rewrite that work.
- `design-qa.md` and some shared Processor/API test surfaces are already
  modified; edits there must be additive and preserve the existing content.
- The principal implementation files for the batch board, nested read model,
  and Processor identity schema were not listed as modified at activation.

verification:

- Stateworks queued network validation passed.
- `stateworks:next` selected only T0 before activation.
- The read path proves this is a projection-only change; no domain or lifecycle
  replan is required.

## 2026-07-29 - T1 nested identity composition committed

status: committed

implemented:

- Added Processor-only nested batch-order, batch, and board schemas. The base
  Production board contract remains source-neutral and unchanged.
- Included `board.batches[].orders` in the workspace's existing deduplicated
  identity-resolution batch.
- Mapped canonical identity into every nested batch order while preserving the
  Production-owned order and placement facts.
- Added contract coverage proving nested identity is mandatory and read-model
  coverage proving duplicate top-level and nested references resolve once,
  including the unavailable-customer fallback.

verification:

- `pnpm --filter @pressly/contracts exec vitest run test/processor-operational-order-identity.contracts.test.ts`
  passed: 7 tests.
- `pnpm --filter @pressly/api exec vitest run test/processor/processor-operational-order-identity.test.ts`
  passed: 6 tests.
- `pnpm --filter @pressly/contracts typecheck` passed.
- `pnpm --filter @pressly/api typecheck` passed, including API test types.

follow-up discovered during T2 preflight:

- The standalone Production-board model retains a direct board-read fallback.
  That path must use the same Processor composition before T1 can remain
  committed; the active network was expanded to include the Processor route,
  adapter, port, model type, and focused adapter coverage.

direct-board follow-up:

- Added a Processor-owned direct board route before the source-neutral
  Production route and composed nested identities through the same bounded read
  model.
- Updated the Processor production adapter, port, board model, and fixture to
  require the enriched board contract on initial workspace loads and direct
  refreshes.
- `pnpm --filter @pressly/contracts test` passed: 12 files and 112 tests.
- `pnpm --filter @pressly/api test -- processor/processor-operational-order-identity.test.ts`
  passed: 20 API files and 154 tests, including the 6 focused read-model tests.
- Contracts and API typechecks and lints passed after the direct route was
  included.

## 2026-07-29 - T2 responsive batch manifest drawer committed

status: committed

implemented:

- Replaced every stage card's truncated external-order string with an
  accessible, compact order-and-bag summary. The trigger does not add vertical
  content to the stage card.
- Added one controlled shadcn bottom Drawer at 90 dynamic viewport-height units
  on desktop and mobile. Its header stays fixed, the manifest scrolls
  internally, and a Select switches among stable batch IDs.
- Neutralized the shared bottom-Drawer top-margin token locally so this
  feature's 90%-height geometry and 10% board reveal are explicit rather than
  dependent on fixed-position margin behavior.
- Added canonical order number and customer name, weight, bag count, due
  status, priority, and pinned-placement context to each read-only manifest
  row.
- Restored focus to the exact stage-card trigger on close and retained the
  Production board and all Start, Complete, machine, membership, and floor
  reconciliation controls behind the modal surface.
- Added complete English and Spanish presentation copy without introducing a
  source-vendor or lifecycle label.

verification:

- Focused Production-board tests passed: 17 tests, including 90% drawer
  geometry, canonical identity, preserved board controls, close-focus return,
  and in-drawer batch switching.
- Processor typecheck, lint, and production build passed.
- API and Contracts lints passed.
- The production build emitted only the pre-existing non-blocking bundle-size
  advisory.

## 2026-07-29 - V1 production ergonomics verification committed

status: committed

repository verification:

- `pnpm --filter @pressly/contracts test` passed: 12 files and 112 tests.
- `pnpm --filter @pressly/api test -- processor` passed: 20 files and 154
  tests, including the Processor operational-identity read path.
- `pnpm --filter @pressly/processor test` passed: 40 files and 256 tests.
  Two existing Sheet description warnings remained non-failing and are
  unrelated to this Drawer implementation.
- Contracts, API, and Processor typechecks and lints passed.
- `pnpm --filter @pressly/processor build` passed with only the existing
  non-blocking bundle-size advisory.
- `pnpm format:check` passed.
- `git diff --check` passed.
- Stateworks validation and lifecycle verification passed before closure.
- Rebuilt the local Processor Docker image from the final source; its container
  reached healthy status at `http://localhost:4173`.

rendered verification:

- Compared the supplied Production reference with the final closed board at
  the same desktop state. The board hierarchy, stage columns, card height, and
  Start and Complete action positions remain intact; only the truncated
  order-ID string became the compact order-and-bag trigger.
- At the final 1920 x 945 desktop viewport, the open Drawer measured 850.5 px
  high, exactly 90% of the viewport. At 390 x 844, it measured 759.59375 px
  high, approximately 90% after browser subpixel rounding.
- Opened Batch 1, switched to Batch 2 by stable ID without closing, and
  confirmed that the title, totals, and canonical order/customer identities
  changed together.
- Closing restored focus to the exact originating
  `View orders in Batch 1: 3 orders · 8 bags` trigger without moving the board.
- The fixed header and bounded `ScrollArea` retain the manifest within the
  Drawer. The live fixture's largest batch has only three orders, so visual
  overflow was not available to exercise; the focused component coverage
  verifies the internal-scroll structure.
- Existing Production controls remained mounted and usable after close.
- The browser console contained no warnings or errors after desktop and narrow
  open, switch, and close interactions.
- `design-qa.md` records the supplied source, final screenshots, mechanical
  geometry, interaction evidence, and a passed result.

evidence boundary:

- Verification used local Docker and test fixtures only. It is not production
  deployment, live-laundry pilot, or employee acceptance evidence.
- The work changes a read-only Processor projection. It adds no Production
  lifecycle transition, queue mutation, scheduling command, persistence, or
  durable domain-memory claim.
- Existing unrelated dirty work was preserved and was not staged, reset, or
  attributed to this package.
