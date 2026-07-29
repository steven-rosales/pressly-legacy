# Pressly Order Authority and Source Autonomy

## Status

Complete in the repository and verified in the local runtime after Steven's
explicit implementation instruction on 2026-07-28. This work does not claim a
production deployment, live Cents cutover, or pilot readiness; those remain
behind the separate production-readiness human and deployment gates.

## Observable Outcome

Pressly remains an operable order and production-control system when Cents or
another external source is delayed, duplicated, reordered, contradictory,
unavailable, quarantined, or detached.

External systems report observations. Pressly decides whether a claim may be
ignored, retained, proposed, or adopted. Only canonical Pressly commands and
aggregate-owned lifecycle graphs change canonical Orders or Production.

The first operator-visible proof is the Santiago-shaped case:

- a source `COMPLETED` observation is retained and visible;
- it never completes or archives Pressly work automatically;
- the Processor clearly explains the difference between source and Pressly
  state;
- an authorized operator can archive one eligible Production order directly,
  with reason, note, version, audit record, and restore path; and
- the order does not disappear merely because Cents becomes unavailable.

## First-Principles Authority Model

### Observations are not commands

An external webhook is sensor input, not an actuator. The adapter authenticates,
normalizes, and transports an observation. It cannot emit canonical lifecycle
commands.

This follows the same separation used in dependable control systems:

- observations update the system's evidence or belief;
- commands express authorized intent;
- the owning state machine determines whether intent is legal; and
- committed state, not the latest sensor report, controls downstream action.

### Capability ceilings replace scalar authority

Each external source receives a versioned, Pressly-owned capability profile
evaluated by:

- source and location;
- claim type;
- canonical lifecycle phase and current state;
- field authority and provenance;
- exact identity, revision, hash, schema, and idempotency evidence; and
- runtime source posture.

The exhaustive dispositions are:

- `deny`: reject the claim as an input to canonical state;
- `observe`: retain it as source evidence only;
- `propose`: surface an explicit Pressly action without executing it; and
- `auto_adopt`: adopt an approved non-lifecycle claim through the canonical use
  case.

A numeric assurance signal can only demote `auto_adopt` toward `propose`,
`observe`, or `deny`. It can never grant a permission or exceed the capability
profile. The illustrative Cents score is not a stored authority constant.

### Runtime posture is Pressly-owned

Each source and location has a persistent posture:

- `normal`;
- `observe_only`; or
- `blocked`.

Health evidence may automatically degrade posture. Promotion is an explicit,
audited Pressly command. The adapter cannot alter or promote its own posture.

### First-party products are canonical clients

A future Pressly-owned residential or commercial ordering product does not
synchronize through a privileged adapter. It invokes typed canonical User and
Order commands directly with actor, scope, idempotency, and expected version.

First-party ownership improves synchronization but remains bounded by fact
ownership:

- Orders owns commercial Order and fulfillment lifecycle;
- Production owns physical intake, admission override, scheduling, batching,
  floor execution, resolution, archive, and restore; and
- Scheduler remains advisory and cannot mutate either lifecycle.

## Architectural Placement

Keep the modular monolith and existing peer-domain boundaries.

- API and Worker adapters authenticate, normalize, and deliver typed
  `ExternalOrderObservation` messages.
- Orders owns the pure, exhaustive source-capability evaluator, canonical Order
  and fulfillment graphs, observation decisions, and commercial commands.
- Users continues exact source-identity resolution and field provenance.
- Production consumes only fulfillment-keyed canonical Orders events and never
  interprets a vendor lifecycle, score, capability profile, or source posture.
- API composes a server-owned operational order view from User, Order, source,
  and Production facts without transferring write authority.
- Processor renders canonical state, source evidence, provenance, and
  server-owned allowed commands. It does not recreate transition or capability
  rules.

Do not introduce microservices, a generic rules engine, or full event sourcing.
Reuse canonical current-state tables, exact source links, latest snapshots,
command receipts, optimistic versions, and the transactional outbox.

## Additive Evidence Model

The implementation should add only the evidence required to make decisions
explainable and replay-safe:

- versioned source capability profiles;
- source-and-location control posture with actor, reason, version, and time;
- complete field-level authority for every adoptable commercial claim;
- append-only observation decisions tied to source revision and payload hash;
- profile, policy, and posture versions used for each decision;
- disposition and stable reason codes;
- adopted fields or proposals;
- canonical aggregate versions before and after; and
- existing command and outbox evidence for committed mutations.

This is a decision audit trail, not an aggregate event store.

## Cents Default Boundary

Cents may:

- establish exact Cents source identities;
- cause policy to create a prospective Pressly record in a Pressly-selected
  initial state;
- retain normalized source snapshots and raw lifecycle metadata; and
- auto-adopt only specifically approved descriptive commercial claims while
  those fields still follow source.

Cents may not:

- release or withdraw fulfillment;
- record physical bag intake;
- select, schedule, batch, place, route, or progress work;
- complete, cancel, resolve, archive, restore, reopen, or delete Pressly work;
  or
- promote its capability profile or runtime posture.

Cents lifecycle changes are observation or proposal evidence at every phase.
An authorized Pressly command or named, versioned Pressly automation is required
to cross the fulfillment handoff.

## Processor Order Management

The Processor should make the authority boundary obvious without forcing an
operator to reason about integration internals.

Each order-level view should show:

- order number and customer identity consistently;
- canonical Pressly commercial and Production state as the primary state;
- the latest external observation as secondary provenance;
- plain-language divergence context, such as “Cents reports completed; Pressly
  still needs intake”;
- the exact next Pressly action, if one is allowed;
- why an action is unavailable; and
- a compact audit history of source observations and Pressly commands.

Individual archive and restore remain Production resolution commands. A
source-terminal observation may make an order discoverable for review, but it
never executes the archive. Review eligibility must not accidentally exclude a
valid source-terminal order because of due-date cutoffs or an unrelated release
classification.

Use the current Processor design system and shared shadcn components. Product
Design review, rendered desktop and mobile inspection, keyboard/focus behavior,
accessibility, loading, conflict, and error states are required before closure.
No Figma work is required.

## Safe Transition

The cutover must be additive and reversible:

1. characterize current source effects and freeze the capability matrix;
2. add policy, posture, decision, and provenance storage;
3. evaluate observations in shadow mode and compare decisions;
4. dry-run classification of existing records;
5. stop lifecycle adoption before enabling new canonical commands;
6. backfill only facts that are deterministic from retained evidence;
7. route ambiguous records to explicit review without guessing; and
8. retain historical source snapshots and canonical history.

External source loss must not block Processor reads or authorized Pressly
commands. No cleanup script may delete or silently terminalize ambiguous work.

## Related Stateworks Work

`lpms-production-readiness` remains behind its existing human gate and must be
rebaselined after this work is proven.

`lpms-order-control-correctness-hardening` remains a separate queued package.
This work must not modify:

- `route-production-order`;
- between-stage routing or machine-capacity repair;
- route idempotency under the Production aggregate lock;
- `list-production-history`; or
- History cursor precision.

Those four correctness gaps retain their own owner and evidence. If file-level
overlap appears after activation, stop and rebaseline rather than merging the
work opportunistically.

## Non-Goals

- No adapter-specific lifecycle transition table in Production.
- No trust score used as authorization.
- No automatic source-driven archive or deletion.
- No hard deletion of canonical orders or production history.
- No adapter self-promotion or automatic recovery to a more permissive posture.
- No inferred customer merge.
- No distributed workflow engine, microservice split, or full event sourcing.
- No deployment or production-data cleanup inside this work without separate
  explicit authority.

## Definition of Done

- External lifecycle permutations cannot change canonical Orders or Production
  without a committed Pressly command.
- Capability evaluation is exhaustive, pure, versioned, and evidenced.
- Source posture can degrade automatically and can be promoted only by an
  authorized audited Pressly command.
- First-party channels use canonical commands rather than privileged adapters.
- Existing records have a deterministic dry-run and safe reconciliation path.
- Operators can understand and act on source divergence, including individual
  archive and restore, without source lifecycle becoming authoritative.
- Model-based, concurrency, idempotency, database, API, Worker, Production,
  Processor, architecture, accessibility, responsive, and full repository
  proofs pass.
- Stateworks evidence distinguishes repository proof, local runtime proof,
  deployment proof, and live operational proof.
- Dependent readiness work is explicitly rebaselined.
