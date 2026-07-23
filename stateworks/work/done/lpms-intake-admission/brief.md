# LPMS Intake Admission

## Status

Complete. Steven confirmed the workflow on 2026-07-22 and authorized
implementation; the repository and local runtime verification are complete.

## Outcome

The Processor has a dedicated `/intake` workspace where an owner,
administrator, or operator can:

1. review inbound Cents orders without crowding Schedule or Production;
2. record bag intake and priority;
3. manually release an order to Pressly production when the external lifecycle
   remains behind; and
4. return a manually released order to forecast-only state while it is still
   unselected and uncommitted.

The raw Cents lifecycle remains visible and unchanged. A manual release is an
LPMS production-admission override, not a forged vendor status.

The production release also carries a one-time, fixed-cutoff cleanup of
prelaunch canonical orders owned exclusively by Cents. The cleanup removes
order and Production projections created before July 23, 2026 in
America/New_York while preserving canonical users and webhook audit history.

## Architecture

- Orders remains the authority for canonical order, customer, fulfillment, and
  latest source observations.
- Production owns the manual admission override because the override changes
  executable scheduling eligibility and must share the location scheduling
  lock.
- The override is keyed by the source-neutral fulfillment demand already
  projected into Production; Production does not interpret a Cents status
  string.
- A pure Production policy decides release and reversal availability from the
  upstream admission state, intake state, current selection, and floor
  commitment.
- The Production command is versioned, idempotent, actor-audited, and
  location-authorized.
- Processor consumes server-projected action availability and never recreates
  release or reversal policy.

## Product Surface

- Add Intake to the main navigation between Home and Production.
- Move the existing bag-intake surface out of Schedule and Production.
- Use compact ElevenLabs-derived rows, status badges, tabbed work queues, and a
  focused confirmation for manual release or reversal.
- Show the Cents status beside the Pressly production state so the discrepancy
  remains explicit.
- Keep Schedule limited to ready-order selection and planning.
- Keep Production limited to the active run and explicit post-start placement.

## Confirmed Policy

- Manual release means Pressly confirms production readiness while leaving the
  Cents status untouched.
- Owner, admin, and operator roles may perform the action within their assigned
  location.
- Reversal is allowed only before the order is selected, scheduled, or assigned
  to a production batch.
- Manual release alone never selects an order for a shift or adds it to a
  started run.

## Done Means

- Pre-release source demand becomes eligible only through a current manual
  override plus valid weight and recorded intake.
- A strictly newer pre-release webhook cannot silently erase the manual
  override.
- Reversal is rejected after selection or floor commitment under the same
  scheduling lock used by planning.
- Schedule and Production no longer render the intake queue.
- English and Spanish Processor copy, contracts, access control, persistence,
  API, and interaction tests pass.
- The production migration is idempotent, preserves post-cutoff and
  multi-source orders, and may safely allow later Cents updates to recreate
  removed orders through normal ingestion.
