# Pressly Cents Submitted Candidate Lifecycle

## Status

Queued superseding work. Steven explicitly authorized activation and end-to-end
implementation on 2026-07-29.

## Why This Supersedes Pickup Proposals

Read-only inspection of the live Cents inbox proved that the integration does
not deliver the documented `PICKED_UP` or `IN_PROGRESS` states. The completed
`pressly-cents-pickup-proposals` work therefore has the correct authority
boundary but the wrong wire trigger.

The replacement keeps Cents outside canonical Pressly control:

- `SUBMITTED` may create one immutable incoming candidate;
- `COMPLETED` or `CANCELED` may close only a still-pending candidate;
- a terminal observation received before `SUBMITTED` creates an exact-identity
  tombstone so delayed delivery cannot resurrect old work;
- every other source lifecycle value remains durable evidence only; and
- an accepted, rejected, or exact-linked canonical Order is never rewritten by
  later Cents payloads.

## Authoritative Graphs

The incoming candidate graph is:

```text
pending --accept--> accepted
pending --reject--> rejected
pending --source_close--> source_closed
source_closed --restore--> restored_pending
restored_pending --accept--> accepted
restored_pending --reject--> rejected
```

`accepted` and `rejected` are terminal. A restore is an explicit Pressly
manager command. The distinct `restored_pending` state prevents later Cents
terminal replays from overriding that manager decision.

Acceptance creates an open canonical Order with an **unreleased** fulfillment.
It copies the accepted proposal snapshot once. Physical intake and an explicit
Pressly release remain separate prerequisites for Production readiness.

## Source-Terminal Handling After Acceptance

Cents never invokes canonical complete, cancel, release, withdrawal, archive,
or Production transitions.

When a terminal source observation identifies an already accepted canonical
Order, a named Pressly automation may request
`resolve_without_production`. Production evaluates its existing authoritative
resolution graph and guard:

- untouched, unassigned work may be resolved without production;
- review-sensitive facts produce a review exception rather than automatic
  mutation; and
- selected, scheduled, batched, routed, staged, active, or finished work is
  never changed by the source observation.

The resolution is nondestructive, audited, and restorable. It does not mean
that Pressly completed or canceled the Order.

## Architecture

- API owns signed wire parsing and the Cents status classifier.
- The durable webhook inbox retains exact subject and terminal evidence.
- Worker translates classified source observations into source-neutral Orders
  commands.
- Orders owns candidate identity, tombstones, lifecycle graph, decisions,
  canonical creation, and the transactional outbox.
- Production owns guarded resolution and every floor transition.
- Processor renders pending Incoming candidates and canonical Current work;
  source-closed candidates leave the active queue.

No Cents type or lifecycle rule enters Orders or Production.

## Migration

- Preserve existing accepted and rejected proposal evidence.
- Migrate existing proposal lifecycle state without rewriting canonical Orders.
- Do not backfill historical `SUBMITTED`, `COMPLETED`, or `CANCELED` receipts.
- Do not deploy, replay production webhooks, or modify production data in this
  repository work.

## Definition of Done

- Exact `SUBMITTED` creates one pending candidate.
- Duplicate or reordered delivery is idempotent.
- Exact terminal delivery closes a pending candidate or records a tombstone.
- A late `SUBMITTED` cannot resurrect a tombstoned identity.
- Manager restore is graph-decided, versioned, authorized, idempotent, and
  moves the candidate to a manager-owned pending state that ignores every
  later Cents lifecycle observation.
- Accept creates one canonical open Order with unreleased fulfillment.
- Cents cannot update accepted canonical fields or control Production.
- Guarded source-close cleanup is Pressly-owned and cannot affect work with
  operational participation.
- Focused graph, database, Worker, API, Processor, architecture, type, lint,
  build, migration, and Stateworks verification is recorded.
