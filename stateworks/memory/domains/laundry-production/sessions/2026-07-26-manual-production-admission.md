# Manual Production Admission Reconciliation

Date: 2026-07-26
Domain: laundry-production
Topic: Reconciling durable admission policy with the completed Intake work

## Sources

- `stateworks/work/done/lpms-intake-admission/brief.md`
- `stateworks/work/done/lpms-intake-admission/evidence.md`
- `stateworks/work/done/lpms-intake-admission/final-report.md`
- The existing source-neutral fulfillment and scheduling boundaries in
  `stateworks/memory/domains/laundry-production/memory.yaml`

## Evidence Boundary

This session records only durable laundry-production rules proven by the
completed Intake admission work. It does not promote the Intake page layout,
copy, or one-time prelaunch cleanup migration into domain memory, and it does
not claim any new product implementation.

## Confirmed Durable Rules

- Effective Production admission may come from canonical upstream fulfillment
  release or from a current manual Production override.
- Physical intake alone never admits work. Positive production demand and
  recorded bag intake remain required for readiness.
- Production owns the source-neutral manual override because it changes
  executable scheduling eligibility and must serialize with scheduling.
- Manual admission does not modify the canonical fulfillment release, Cents
  status, or latest source observation.
- A lagging pre-release source observation cannot silently erase a current
  manual override. Source withdrawal supersedes the override while preserving
  already received or committed floor work under the existing reconciliation
  rule.
- Manual admission changes eligibility only; it never selects an order for a
  shift or places it into a production run.
- Reversal is available only before selection, scheduling commitment, or batch
  assignment and is revalidated under the location scheduling lock.
- Owner, administrator, and operator roles may release or reverse within their
  authorized location.
- Admission commands are versioned, idempotent, actor-audited, and
  location-authorized.
- Processor renders the source state, effective Pressly state, and
  server-authorized release or reversal actions without recreating the policy
  in the browser.

## Memory Reconciliation

- Broaden the existing admission workflow and readiness policy from
  source-release-only wording to effective Production admission.
- Clarify that pre-release intake alone does not admit work.
- Record the source-truth, non-placement, reversal, withdrawal, authorization,
  and Production-ownership boundaries.
- Generalize the existing backend-action decision to include admission actions.

## Applied Memory Delta

- `stateworks/memory/domains/laundry-production/deltas/2026-07-26-manual-production-admission.memory-delta.yaml`
