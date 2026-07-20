# LPMS Demand Lifecycle and Outlook

## Status

Active. Steven closed intake and authorized implementation on 2026-07-18.

This package adds one honest planning path for Cents demand that may arrive
before physical intake, while preserving LPMS as the authority for observed
production-floor progress.

## Outcome

An operator can:

1. See non-cancelled orders due within the production shift's local service-day
   cutoff before they are admitted to floor execution.
2. Distinguish expected or inbound weight from physically received,
   production-ready weight.
3. Record physical bag intake and admit an order even when the latest Cents
   status is lagging behind the facility.
4. See when a downstream Cents status and LPMS production truth disagree, then
   review and explicitly reconcile the LPMS batch instead of silently finishing
   an individual order.
5. Continue to compute, accept, and start schedules using only admitted
   production orders with known bag counts.

## Confirmed Product Policy

- `SUBMITTED` and `READY_FOR_PICKUP` are expected demand.
- `PICKED_UP` is inbound demand.
- `IN_PROGRESS` releases the order to production intake.
- `READY_FOR_RETURN`, `OUT_FOR_DELIVERY`, and `COMPLETED` are downstream
  reconciliation signals.
- `CANCELLED` withdraws unreceived demand; it never silently removes physically
  received or committed work.
- The demand horizon ends at the end of the local calendar day containing the
  shift end. Overdue demand remains inside the horizon.
- Physical intake plus a recorded bag count may make an order production-ready
  even while Cents still reports a pre-production status.
- A downstream Cents status never auto-completes an LPMS order, stage, batch,
  run, or shift. LPMS requires operator confirmation against physical truth.

## Product Surface

- Home remains floor-focused and gains a compact Demand outlook summary above
  Order control.
- Schedule gains an advisory Demand outlook view alongside the executable
  Production plan.
- Expected and inbound demand is visibly labeled and cannot be accepted or
  started.
- Reconciliation copy names both systems and explains the concrete mismatch;
  internal UUIDs never appear in operator messages.
- New UI composes the Processor's current shadcn primitives and the established
  ElevenLabs-derived spacing, typography, border, tab, badge, and empty-state
  patterns. Pressly's existing semantic color tokens remain unchanged.

## Architecture

- The Worker-owned Cents adapter maps vendor statuses to a canonical demand
  phase before invoking Production.
- The headless Production policy module owns pure lifecycle decisions.
- The Production business module owns atomic demand persistence, intake
  admission, reconciliation projection, and read models.
- The scheduling computation module owns a deterministic, non-persistent,
  weight-only advisory forecast. It cannot mutate execution.
- Contracts expose canonical demand and outlook types; the Processor contains
  presentation and interaction only.
- No peer business module or independently deployed service is introduced.

## Relationship to Existing Work

- `lpms-production-readiness` remains the active release/pilot package; this
  work closes a newly observed live-demand semantic gap before the pilot can be
  considered representative.
- `lpms-order-control-correctness-hardening` remains a separate queued repair
  package. It must not execute concurrently with this package on overlapping
  Production, contracts, database, scheduling, or Processor files.
- Existing unrelated worktree changes under infrastructure and agent-doc paths
  are user-owned and out of scope.

## Explicitly Omitted

- Automatic individual-order completion from Cents.
- A generic exception platform, probabilistic forecasts, forecast history, or
  silent live re-optimization.
- Direct cancellation of physically received or scheduled production work.
- A new service, broker, or cross-module orchestration layer.
- Production deployment or vendor configuration changes.

## Done Means

- Every accepted Cents order status maps to one canonical demand phase.
- Newer source revisions persist even after an order enters production without
  rewriting committed LPMS floor state.
- Shift-scoped outlook totals and an advisory batch forecast are deterministic
  and exclude withdrawn or out-of-horizon demand.
- Physical intake can admit expected or inbound demand with a known bag count.
- Downstream source mismatches are visible and never auto-terminalize LPMS.
- Processor copy exists in English and Spanish and follows the current visual
  system.
- Focused policy, computation, contract, Production, database, Worker, API, and
  Processor tests pass, followed by proportional repository verification.
