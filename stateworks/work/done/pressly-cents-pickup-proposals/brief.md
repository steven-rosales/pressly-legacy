# Pressly Cents Pickup Proposals

## Status

Activated by Steven's explicit instruction on 2026-07-28; implementation and
verification are in progress.

## Outcome

Cents no longer creates or updates canonical Pressly Users, Orders, fulfillment
release, or Production work. It is a bounded external adapter that may create
one immutable incoming-order proposal only when Pressly receives the exact
`PICKED_UP` source event.

An authorized Processor operator makes the only two proposal decisions:

- **Accept** creates the canonical Pressly customer and Order, releases the
  wash-and-fold fulfillment, and sends the work to Needs Intake.
- **Reject** closes the proposal with an audited reason and creates no
  canonical work.

Every other Cents lifecycle value is acknowledged by the durable webhook inbox
and ignored by the order workflow. Later Cents observations cannot update,
reopen, complete, cancel, archive, or otherwise affect a proposal or canonical
Pressly state.

## Minimal Lifecycle

The persistent incoming-order proposal graph is:

```text
pending --accept--> accepted
pending --reject--> rejected
```

No separate matched, completed-elsewhere, expired, synchronized, or vendor
lifecycle state is introduced. “Already handled” is a rejection reason.

## Exact Identity Boundary

Before proposing or accepting, Pressly checks the exact source and external
Order identity:

- if that identity is already linked to a canonical Pressly Order, the Cents
  observation is ignored and no proposal is created;
- acceptance repeats the check under the same transaction and returns an
  idempotent existing result or deterministic conflict rather than creating a
  duplicate; and
- customer names, phones, emails, dates, weights, and similarity scores never
  suppress, merge, or select a canonical Order.

Future Pressly-owned residential, commercial, and driver products invoke
canonical User and Order commands directly. They are not privileged adapters.

## Architecture

Keep the modular monolith and add only the boundary that the domain requires:

1. The existing signed, idempotent durable webhook inbox receives Cents events.
2. The Worker validates and normalizes the exact pickup observation.
3. Orders owns an immutable incoming-proposal aggregate and its explicit graph.
4. API composes list, accept, and reject application ports.
5. Processor renders Incoming and Current order-management views; archive
   review remains nested inside Current until an honest archived-only backend
   collection exists.
6. Acceptance uses existing canonical Orders commands and transactional outbox
   behavior so Production consumes only Pressly-owned release events.

The source record needed for a proposal must exist independently from a
canonical Order. Canonical User creation is deferred until acceptance.

## Deletion Scope

Delete, rather than layer over:

- Cents-driven prospective canonical User and Order creation;
- Cents descriptive-field auto-adoption into canonical Orders;
- Cents lifecycle proposal/reconciliation behavior after ingestion;
- post-pickup source updates to proposal or canonical fields;
- matching and completed-elsewhere proposal actions;
- Cents-specific source-authority UI that no longer describes an available
  operator action; and
- now-unreachable source-to-canonical orchestration and tests.

Retain webhook authentication, durable inbox claiming, exact source identity,
revision/hash idempotency where required for ingestion, proposal decision
audit, canonical command receipts, aggregate graphs, transactional outbox, and
Production boundaries.

## Migration

- Existing canonical Cents-origin Orders and Users are preserved and treated as
  already accepted; they are never converted back into pending proposals.
- The migration performs no historical proposal backfill.
- New proposal uniqueness is enforced by source plus external Order identity.
- Rejected and accepted proposals remain terminal and auditable.
- No production data cleanup or deployment is part of this repository work.

## Definition of Done

- Only an exact new `PICKED_UP` Cents observation can create a proposal.
- Every other Cents status has no Order, User, proposal, fulfillment, or
  Production effect.
- Exact existing canonical identities suppress proposals.
- Accept and reject are versioned, authorized, idempotent, and graph-decided.
- Accept creates and releases one canonical Order atomically; reject creates
  none.
- Later Cents events cannot change a decided proposal or canonical state.
- Incoming proposals are manageable in Processor without exposing vendor
  lifecycle complexity.
- Obsolete authority and reconciliation paths are removed where no longer
  referenced.
- Focused, database, Worker, API, Processor, architecture, type, lint, and
  build verification passes with concrete Stateworks evidence.
