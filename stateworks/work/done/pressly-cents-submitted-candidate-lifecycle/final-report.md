# Pressly Cents Submitted Candidate Lifecycle Final Report

## Status

The repository and local-runtime vertical slice is verified. Its durable
memory is applied and the Stateworks lifecycle is complete.

## Repository outcome

- Exact raw Cents `SUBMITTED` is the only candidate trigger.
- Exact `COMPLETED` or `CANCELED` records source closure; every other known or
  unknown status is acknowledged without an Orders command.
- Orders owns one exact-identity candidate graph:

  ```text
  pending --accept--> accepted
  pending --reject--> rejected
  pending --source_close--> source_closed
  source_closed --restore--> restored_pending
  restored_pending --accept--> accepted
  restored_pending --reject--> rejected
  ```

- Terminal-before-submitted evidence creates an exact-identity tombstone, so a
  late `SUBMITTED` cannot resurrect old work.
- `restored_pending`, accepted, rejected, and exact-linked canonical work are
  immune to later source-close observations.
- Accept creates one open canonical Order with an unreleased fulfillment.
  Intake and release remain separate Pressly-owned facts.
- Source-terminal handling for exact accepted work is source-neutral and
  guarded: Production alone decides whether untouched unreleased work may be
  resolved without production, requires review, or remains unchanged.
- Processor separates actionable Incoming candidates, source-closed review,
  and canonical Current orders. Its confirmation copy names the exact
  unreleased, forecast-only result.

## Repository verification

- Orders: 4 files, 30 unit tests passed; 15 repository integration tests
  passed.
- Contracts: 12 files, 111 tests passed.
- DB: 7 files, 37 non-integration tests passed; migration through `0037` and
  DB integration passed in the complete disposable-database run.
- API: 20 files, 154 tests passed.
- Worker: 7 files, 45 tests passed.
- Production: 39 files, 186 unit tests passed; 35 repository integration tests
  passed.
- Processor: 40 files, 254 tests passed; the final copy repair also passed its
  focused 13-test file.
- `pnpm test:lpms:int` exited 0 across DB, Users, Orders,
  webhook-ingestion, Worker, Production, and Cents asset gates.
- Root typecheck passed 47 of 47 tasks, lint passed 26 of 26 tasks, and build
  passed 26 of 26 tasks.
- Formatting, 78 architecture and topology assertions, and
  `git diff --check` passed.

## Local-runtime evidence

- Current local API, Worker, and Processor images were rebuilt and only those
  services were restarted. Their local health checks passed.
- Synthetic local webhooks exercised the real durable ingress, Worker, Orders,
  API, and Processor path.
- The rendered desktop flow proved Needs review, Closed by Cents, Restore,
  required-reason Reject, forecast-only Accept, and the accepted canonical
  Current-order state.
- A 390 by 844 pass proved the mobile candidate card, mobile navigation,
  horizontal containment, internal page scrolling, the full order-detail sheet
  range, action reachability, and focus restoration.
- The final real-browser console contained no warnings or errors.

## Deployment evidence

No deployment, release artifact publication, production migration, production
webhook replay, live Cents cutover, or same-SHA public health verification was
performed or claimed.

## Operational evidence

The only live evidence used by this work was the read-only aggregate inbox
inspection recorded under T0. It proved that this installation had no
`PICKED_UP` or `IN_PROGRESS` observations and therefore invalidated the prior
trigger. No customer payload, credential, secret, production row, or webhook
was changed.

Production readiness remains governed by the active
`lpms-production-readiness` package. Its `H1` external gate remains open.

## Stateworks closeout

Two source-backed deltas were validated, applied exactly once, and marked
`applied`:

- `memdelta-2026-07-29-cents-submitted-candidate-lifecycle`;
- `memdelta-2026-07-29-cents-submitted-candidate-production-boundary`.

They supersede the exact `PICKED_UP` proposal, released-on-acceptance,
Cents-specific projection, and direct-source-lifecycle claims while preserving
Pressly-owned canonical and Production graphs. Order Management is at memory
version 7 and Laundry Production is at memory version 21. Both domain memories
and deltas validate, and two consecutive context-pack generations produced
identical SHA-256 hashes:

- Order Management:
  `85c22b91797f8f8457801f30949037004df1a935a8f067f10ad9f78405a4c352`;
- Laundry Production:
  `24d6e95c01ad8f6b213f332030fea1d33c13b3c41307783d5c63aa0d63a9012d`.

The production-readiness package now records the submitted-candidate
rebaseline without advancing deployment or pilot status. Its H1 external gate
remains open.
