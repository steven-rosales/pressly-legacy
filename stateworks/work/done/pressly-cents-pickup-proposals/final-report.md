# Pressly Cents Pickup Proposals Final Report

## Outcome

The verified implementation makes Cents a bounded pickup-proposal adapter:

- only an exact raw `PICKED_UP` Order observation can create one immutable
  incoming proposal;
- every other Cents Order state, customer event, and marketing event is
  durably acknowledged and ignored without creating or changing canonical
  Users, Orders, fulfillment, or Production work;
- operators decide each pending proposal through the single
  `pending --accept--> accepted` or `pending --reject--> rejected` graph;
- Accept transactionally rechecks proposal version and exact source identity,
  then creates one canonical Order, one released fulfillment, accepted source
  evidence, a command receipt, and the source-neutral outbox effect;
- Reject records a terminal audited resolution and creates no canonical or
  Production work;
- a decided proposal is immutable and later Cents deliveries cannot reopen it
  or change accepted canonical work;
- future Pressly-owned ordering products use canonical commands directly
  instead of receiving privileged adapter behavior.

Existing canonical Cents-origin records and historical migrations remain
intact. No proposal backfill or destructive data rewrite was introduced.

## Architecture and Invariants

The implementation keeps each decision with its owner:

- API authenticates and minimizes the vendor envelope.
- The durable inbox owns receipt, retry, lease, and dead-letter behavior.
- Worker transports only the source-neutral pickup proposal command.
- Orders owns exact identity, proposal persistence, the authoritative proposal
  graph, Accept and Reject use cases, canonical creation, receipts, and outbox
  effects.
- Production consumes only released canonical fulfillment events and imports
  no Cents or proposal policy.
- Processor renders server-owned proposal actions and conflicts; it does not
  recreate lifecycle or duplicate policy.

Exact `(source, external_order_id)` identity is the only automatic suppression
key. Contact values never select, merge, or suppress canonical records.

## Replaced Runtime Scope

The implementation removed the obsolete runtime paths for:

- all-status Cents Order projection;
- Cents-driven prospective canonical User and Order creation;
- later descriptive-field adoption and follow-source behavior;
- source capability profiles, source-control posture, field-authority
  controls, observation decisions, and reconciliation commands;
- pending source-customer resolution;
- Processor controls and copy for source divergence that no longer has an
  operator action.

Signed webhook verification, encrypted bounded quarantine, the durable inbox,
exact canonical source links, command receipts, authoritative lifecycle
graphs, the transactional Orders outbox, and source-neutral Production
projection remain.

## Repository Evidence

- Sequential monorepo tests passed all 48 package tasks. Current key counts
  include Processor 253/253, API 150/150, Worker 40/40, Orders 23/23, and
  Production 174/174.
- Tooling passed 178/178 tests, including 71/71 architecture-boundary tests.
- Type checking passed 47/47 tasks.
- Lint and production build each passed 26/26 tasks.
- Formatting and `git diff --check` passed.
- The disposable LPMS integration harness passed all 19 database migrations
  and the Orders and Production Postgres suites.
- Focused proposal persistence tests passed 13/13, including concurrent
  submission, concurrent Accept, exact-identity races, Reject without
  canonical effects, replay, and terminal immutability.

## Local Runtime and Product Evidence

- Local Docker rebuilt healthy API, Worker, Processor, and Postgres services.
- Local synthetic flows proved exact pickup proposal creation, non-pickup
  ignore behavior, Accept, Reject, pickup replay, and ignored later
  `COMPLETED` and `IN_PROGRESS` deliveries.
- Accepted and rejected snapshots and terminal resolutions remained unchanged
  after replay.
- The Incoming and Current Orders views were inspected on desktop and at
  390 x 844 mobile dimensions.
- Loading, empty, errors, paging, typed conflicts, keyboard interaction,
  scrolling, dialog focus restoration, and action availability were verified.
- Browser console inspection returned no warnings or errors.

## Deployment and Operational Evidence

No production deployment, production database mutation, live Cents delivery,
or operational cutover was performed. This report proves repository behavior
and local synthetic runtime behavior only. Production readiness and live
cutover remain separate evidence gates.

## Stateworks Closeout

- Order Management memory delta
  `memdelta-2026-07-28-cents-pickup-proposal-implementation` was applied to
  validated memory version 6.
- Laundry Production memory delta
  `memdelta-2026-07-28-cents-pickup-proposal-production-boundary` was applied
  to validated memory version 20.
- Both context packs were regenerated from their validated domain memories.
- The work network and lifecycle state were verified before archival.
