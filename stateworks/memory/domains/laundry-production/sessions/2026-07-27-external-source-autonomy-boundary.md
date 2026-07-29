# External Source Autonomy Production-Boundary Session

Date: 2026-07-27
Domain: laundry-production
Topic: Canonical fulfillment release as the only upstream Production signal

## Source

- Steven's 2026-07-27 decision that Processor and Pressly must retain
  operational authority when Cents is unpredictable or unavailable.
- The paired Order Management external-source autonomy decision and the current
  Laundry Production admission memory were inspected for boundary conflicts.

## Confirmed Facts

- Production owns physical intake, admission override, scheduling, batching,
  floor progression, resolution, archive, restore, and production history
  under its own authoritative graphs and policies.
- Cents lifecycle values are external observations and cannot be interpreted as
  Production admission or floor commands.
- Production receives source-neutral fulfillment demand and release facts from
  Orders and must not know an external adapter's lifecycle mapping, trust score,
  capability profile, or runtime source posture.

## Decisions

- An authorized Pressly Order command or named, versioned Pressly automation
  command is the only upstream authority that may transition fulfillment
  release.
- Production admission may change only through a canonical Orders
  fulfillment-release event or an authorized manual Production-admission
  command.
- A source cancellation or other lifecycle observation cannot withdraw
  prospective or committed Production work. Any canonical withdrawal is a
  separate Pressly decision.
- Physical intake alone still does not admit a Production order, and manual
  admission still does not select, schedule, place, or start it.
- Production continues to consume canonical Orders outbox events idempotently
  and keeps vendor-specific policy upstream.

## Assumptions

- Positive Production demand, physical bag intake, explicit shift selection,
  hard capacity, and existing scheduling rules remain unchanged.
- Descriptive source-following demand fields may still reach Production only
  after Orders has adopted them canonically under its capability policy.

## Open Questions

- Which named, versioned Orders automation, if any, should be allowed to release
  fulfillment without an operator command?
- How should an external withdrawal proposal be prioritized for operator review
  when no canonical Pressly withdrawal has occurred?

## Evidence Boundary

- Numeric adapter scores are not Production inputs and are not recorded as
  authorization constants.
- This session aligns durable domain boundaries only. It does not claim that
  the current Worker, Orders, Production, API, database, or Processor
  implementation conforms.
- No secret, credential, customer payload, private token, or production data is
  recorded.

## Candidate Memory Deltas

- Remove the automatic Cents `IN_PROGRESS` handoff and pre-handoff source
  withdrawal from the Production admission workflow.
- Describe Cents as an observation provider rather than an external order
  authority.
- Preserve canonical fulfillment release, manual Production admission, physical
  truth, explicit scheduling selection, and aggregate-owned lifecycle graphs.
