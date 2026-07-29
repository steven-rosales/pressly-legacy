# External Source Autonomy Decision Session

Date: 2026-07-27
Domain: order-management
Topic: Pressly order authority and bounded external-source autonomy

## Source

- Steven's 2026-07-27 design discussion about making Processor authoritative
  after an external order reaches Pressly.
- The current Order Management memory, source-lifecycle authority delta, and
  repository boundaries were inspected for contradictions and implementation
  gaps.

## Confirmed Facts

- Cents is currently the primary external order source, but Pressly does not
  control its lifecycle behavior, delivery quality, or debugging support.
- Pressly must remain able to create, correct, transition, reconcile, archive,
  and restore its own operational records when an external source is stale,
  contradictory, unavailable, or detached.
- A source lifecycle value is evidence about what that source reported. It is
  not a command to transition a canonical Pressly Order, fulfillment, or
  Production aggregate.
- A Pressly-owned residential or commercial ordering surface would have much
  stronger synchronization guarantees than Cents, but ownership of an ordering
  surface still would not grant authority over physical Production facts.

## Decisions

- External-source influence is bounded by a versioned Pressly-owned capability
  profile evaluated by source, claim type, canonical lifecycle phase, field
  authority, evidence, and runtime source posture.
- The exhaustive capability dispositions are `deny`, `observe`, `propose`, and
  `auto_adopt`.
- A numeric assurance or trust signal may demote an otherwise permitted
  capability, but it can never grant a capability, exceed the declared profile
  ceiling, or promote itself.
- Pressly owns a runtime source posture of `normal`, `observe_only`, or
  `blocked`; automatic degradation is allowed, while promotion requires an
  authorized audited Pressly command.
- External lifecycle claims are retained as observations or proposals at every
  canonical phase and never select or execute canonical lifecycle transitions.
- Only an authorized Pressly command or a named, versioned Pressly automation
  command may transition a canonical Order or fulfillment lifecycle graph.
- First-party Pressly ordering products invoke canonical User and Order
  commands directly. They are not modeled as privileged external adapters.
- Every valid newer source observation receives a durable decision record tied
  to the observation revision and hash, effective policy versions, reason
  codes, adopted fields or proposals, and resulting canonical versions.
- Canonical current-state tables remain authoritative. Observation decisions,
  source snapshots, command receipts, and the transactional outbox provide
  evidence without turning Order Management into a fully event-sourced system.
- Orders owns the source capability policy for commercial claims. Adapters
  authenticate, normalize, and transport observations; peer domains consume
  only source-neutral canonical events.

## Assumptions

- Exact source identity, monotonic source revision, payload hash, idempotency,
  optimistic concurrency, and authoritative lifecycle-graph checks remain hard
  evidence gates.
- An approved source observation may cause Pressly policy to create a
  prospective canonical record in its Pressly-selected initial state.
- The precise field-by-field Cents capability matrix remains versioned
  operational policy to be proven during implementation; it is not inferred
  from one global score.

## Open Questions

- Which descriptive commercial claims should Cents initially be allowed to
  auto-adopt before a Pressly override, and which should begin as proposals?
- Which health signals and thresholds should demote a source from `normal` to
  `observe_only` or `blocked`?
- Which, if any, named Pressly automations should be permitted to accept a
  fulfillment without an operator command?

## Evidence Boundary

- The illustrative values of Cents near `0.25` and a first-party source near
  `1.0` motivated the design but are not accepted constants or authorization
  inputs.
- The proposed inverse-control formula is not retained as domain policy because
  its direction is ambiguous and a scalar cannot safely encode claim-specific
  authority.
- This session records durable domain intent only. It does not claim that the
  current Worker, Orders, API, database, or Processor implementation conforms.
- No secret, credential, customer payload, private token, or production data is
  recorded.

## Candidate Memory Deltas

- Supersede the one-way Cents lifecycle handoff with canonical Pressly
  lifecycle authority from creation.
- Add capability profiles, source-control posture, observation decisions,
  assurance-only-demotes policy, and distinct observation versus command
  channels.
- Preserve exact identity, monotonic revision, field provenance, atomic outbox,
  peer-module ownership, composed read models, and authoritative lifecycle
  graphs.
