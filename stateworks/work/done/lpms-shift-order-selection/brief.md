# LPMS Shift Order Selection

## Status

Active. Steven confirmed the production-admission and shift-selection policy on
2026-07-19 and authorized implementation.

## Outcome

Managers can distinguish demand visibility, production readiness, and intent
for one shift:

1. `SUBMITTED`, `READY_FOR_PICKUP`, and `PICKED_UP` remain forecast-only.
2. Physical bag intake may be recorded before Cents reaches `IN_PROGRESS`, but
   it cannot make the order schedulable.
3. `IN_PROGRESS` plus valid weight and recorded bag intake makes an order a
   ready candidate.
4. Ready candidates are unselected by default and enter a schedule only after
   an explicit, shift-scoped manager selection.
5. Orders becoming ready after Start remain outside the run until a manager
   explicitly places them.

## Architecture

- Production policy owns the pure release and intake-admission decision.
- Production business owns versioned shift selection, plan supersession,
  exact snapshot validation, and explicit live placement.
- Postgres stores only selected shift/order associations; absence means the
  ready candidate is unselected.
- The scheduling computation continues to receive a complete immutable input
  and knows nothing about selection persistence or Cents.
- Contracts expose candidate and selection state; Processor owns only
  presentation and interaction.

## Product Surface

- Schedule shows ready candidates with explicit checkboxes, selected count,
  selected weight, and bulk Select all ready / Clear selection actions.
- Forecast-only and intake-pending demand remains explanatory and disabled.
- Compute names the exact selected count and is unavailable for an empty
  selection.
- Selection changes invalidate the current plan visibly and consistently.
- The live board presents new ready orders as awaiting manager placement, not
  as failed automation.
- English and Spanish copy use the existing ElevenLabs-derived shadcn visual
  language and Pressly semantic colors.

## Explicitly Omitted

- A global order hold or defer state.
- Automatic selection based on due date, weight, priority, or optimization.
- Silent post-start placement.
- A second scheduler or client-owned planning model.
- Production deployment or mutation of production data.

## Done Means

- Pre-`IN_PROGRESS` orders cannot enter an executable schedule even after
  physical intake.
- Only `IN_PROGRESS` orders with valid intake can be selected.
- Selection is server-authoritative, versioned, audited, and scoped to one
  shift.
- Compute, Accept, and Start validate the exact selected snapshot.
- New unselected candidates do not invalidate an accepted plan.
- Post-start placement requires an explicit authorized command.
- Focused policy, Production, database, contracts, API, and Processor tests
  pass, followed by proportional repository verification.
