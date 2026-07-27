# LPMS Operational Authority and Remaining-Day Forecast

## Status

Active. Steven authorized implementation on 2026-07-26.

Execution follows the dependency network in this package. Repository and local
runtime proof remain distinct from deployment and pilot proof.

## Observable Outcome

Pressly becomes the unambiguous lifecycle and floor authority after a one-way
external-source handoff, persistent lifecycle transitions are governed by
explicit aggregate-owned graphs, and the Processor presents a trustworthy
remaining-day outlook at `/forecast` without turning source differences into
floor work.

When complete:

- valid newer Cents observations remain durable and inspectable;
- the first `IN_PROGRESS`-or-later non-canceled observation can release an
  unreleased fulfillment exactly once;
- later Cents lifecycle values cannot rewind, complete, cancel, or withdraw
  canonical Pressly lifecycle and do not dead-letter merely because Pressly is
  ahead;
- source-owned non-lifecycle fields continue to follow field-authority and
  revision rules;
- each true persistent Orders and Production lifecycle has one authoritative
  state/event graph;
- derived readiness, attention, milestone, and forecast values remain pure
  projectors rather than additional state machines;
- `/forecast` explains unfinished work remaining today, including what is
  already in production, what can join today's run, what is expected later, and
  what needs another shift or remains unassigned;
- Home keeps a compact today summary, Schedule owns both pre-start planning and
  explicit post-start placement into the existing run, Production stays
  focused on physical execution, and Intake uses a normal action column; and
- no Processor floor surface asks an operator to compare Cents with Pressly.

## Task Shape

This is a system-level domain workflow with an external source, durable
observation history, concurrent state transitions, transactional outbox
effects, scheduling constraints, API contracts, and multiple user surfaces. It
deserves explicit domain and application boundaries, not a local UI patch or a
generic workflow platform.

## Minimum Viable Architecture

### Source boundary

`apps/worker` remains the Cents adapter. It validates vendor status codes and
emits source-neutral observations and handoff signals. It does not decide
canonical Pressly lifecycle.

`modules/business/orders` owns:

- source revision ordering and durable normalized snapshots;
- field-level source authority;
- separation of observation retention from canonical adoption;
- commercial Order and fulfillment lifecycle graphs;
- one-way handoff decisions; and
- atomic canonical mutation plus outbox publication.

Observation outcomes are typed and explicit: created, applied, observed-only,
stale, replayed, or conflict. Expected source lifecycle differences are not
exceptions and do not enter the webhook dead-letter path.

### Production boundary

`modules/business/production` owns Production use cases, persistence, and the
remaining-day read use case. `modules/policy/production` owns headless physical
invariants and persistent Production lifecycle graphs.

Each persisted aggregate lifecycle gets one graph only when it represents
actual durable authority. Cross-aggregate use cases orchestrate those graphs
under existing locks and transactions. Readiness, between-stage milestones,
attention labels, forecast partitions, and appendability are derived
projections; they are not persisted lifecycle machines.

The current `production_order.status` mixes readiness with execution. That
field must be decomposed into authoritative underlying facts and a real
execution lifecycle before either is placed behind a graph; the plan must not
legitimize the mixed field by drawing a graph around it.

No global workflow engine, event-sourced rewrite, or new service boundary is
introduced.

### Forecast computation

The remaining-day forecast is a deterministic, read-only
location-and-service-day projection. Its server-side inputs include:

- unfinished work already committed to the active run;
- current run and batch capacity still available under exact placement rules;
- ready but unplaced work;
- expected work due today that is not executable yet;
- configured shifts and resource capacity for the selected local day; and
- explicit assumptions and an `asOf` instant.

`modules/computation/scheduling` supplies pure placement and capacity
computation where it already owns those rules. Production owns the read use
case and repository query. The public contract is a dedicated production read,
targeting:

```text
GET /production/locations/:locationId/forecast?serviceDay=YYYY-MM-DD
```

The response groups work as `in_production`, `ready_to_place`,
`expected_later`, and `needs_shift`, with totals, capacity risk, assumptions,
and server-derived actionability. It never fabricates a later shift, batch, bag
count, physical progress timestamp, or precise completion time.

### Application composition

The Worker and API applications remain composition roots. Peer modules do not
import one another. Any read that composes Users, Orders, and Production stays
in the API-owned Processor boundary; Production itself receives and emits
source-neutral contracts only.

### Processor surfaces

`apps/processor` receives server-owned state and allowed actions through ports.
It does not reconstruct lifecycle or placement policy.

- `/forecast`: full remaining-day workspace with service day, `asOf`,
  assumptions, the four operational groups, capacity risk, and links into
  Production or Schedule.
- Home: compact Today strip with in-production, ready-to-place,
  expected-later, and capacity-risk summary plus `Open forecast`.
- Schedule: ready-order selection and schedule controls first, with only a
  compact remaining-day context/link. Once the shift's run has started,
  Schedule switches to a live-run placement workspace for ready arrivals. It
  appends only to that explicit existing run and never recomputes the accepted
  immutable schedule.
- Production: physical execution, queue membership, and stage progress first.
  Ready arrivals appear only as a compact handoff to Schedule; placement
  controls do not displace the live floor board.
- Intake: preserve the established five-column system but make the action
  column an ordinary left-aligned column with normal width and padding.
- Floor attention: Pressly-native actions only. Source lifecycle differences
  after handoff are not operator tasks.

The execution should use the current Processor design system, shadcn
primitives, ElevenLabs structural language, and Pressly theme recorded in
Steven's collaboration memory. Schedule date selection continues to use the
shared shadcn Calendar and Popover rather than native browser date or
datetime-local controls; live-placement review uses shared shadcn primitives
instead of an ad hoc or native control surface.

## Confirmed Policy

- Pressly is operational and floor truth.
- Cents is an external input source, not canonical Pressly lifecycle authority.
- `IN_PROGRESS` is the one-way Cents handoff threshold.
- Before handoff, prospective source demand may change or withdraw.
- After handoff, source lifecycle is observation-only.
- Retain observations; ignore canonical transition authority.
- Pressly transitions remain permanent absent an explicit Pressly compensation
  workflow.
- `/forecast` means unfinished work remaining for the selected local day.
- Work may fit the active run or require another shift that day.
- Home retains a compact summary; detailed outlook belongs to `/forecast`.
- Schedule remains focused on scheduling ready work.
- A post-start ready order remains outside execution until an authorized
  manager explicitly places it into the shift's existing production run.
- Post-start placement is append-only with zero automatic recourse: it cannot
  recompute the accepted schedule, create a sibling run, or relocate existing
  work.
- Production remains the execution surface; Schedule owns the placement
  decision and Production retains only a compact awareness link.

## Known Current Mismatches

- The Worker currently maps `COMPLETED` and `CANCELED` into canonical terminal
  Order state and maps all non-canceled `IN_PROGRESS`-or-later statuses to
  released.
- Orders currently rejects terminal source regressions as invalid transitions,
  which can turn an expected downstream observation into a dead-lettered event.
- Source observation retention and canonical adoption are one decision path.
- Only commercial Order, fulfillment release, and stage transition currently
  use the kernel state-machine definer; other durable lifecycles still contain
  local imperative transition rules.
- `production_order.status` currently mixes derived readiness
  (`release_pending`, `intake_pending`, `eligible`, `ineligible`) with execution
  (`scheduled`, `finished`).
- Order Control and demand outlook turn source differences into operator-facing
  comparison attention.
- The existing forecast is shift-scoped, disappears when an active run exists,
  uses an empty-pipeline weight-only estimate, and is rendered in detail on
  both Home and Schedule.

## Non-Negotiable Invariants

- Preserve exact source identity, monotonic source revisions, replay
  idempotency, equal-revision conflict detection, and normalized snapshot
  retention.
- Preserve explicit canonical field authority and Pressly field overrides.
- Preserve Orders outbox atomicity and Production's source-neutral boundary.
- Preserve whole orders, hard capacity, explicit shift selection, one run per
  shift, run-first locks, queue versions, and operator-confirmed floor truth.
- A source observation never directly mutates Production execution.
- Expected source lifecycle differences do not dead-letter and do not become
  floor actions.
- Persistent lifecycle graphs have one owner; repositories persist decisions
  and do not invent transitions.
- Derived read models are deterministic and non-authoritative.
- Processor actions come from the server.
- No secret, credential, customer payload, or private token enters Stateworks,
  tests, logs, screenshots, or commits.

## Relationship to Existing Work

This package is foundational and must execute before
`lpms-order-control-correctness-hardening`, because it changes Order Control,
Production lifecycle ownership, contracts, and Processor Home assumptions.
After this package completes, correctness hardening must be rebaselined before
execution.

The two packages must not execute concurrently: both write Production policy,
Production business code, contracts, database tests, Processor code, and
laundry-production memory.

The active `lpms-production-readiness` package remains stopped at its human
gate. Its older repository proof is not pilot proof for this changed lifecycle
and forecast model. Pilot and release gates stay stopped until this package,
the rebaselined correctness hardening package, and their local verification are
complete.

Historical completed packages remain immutable evidence and are not rewritten.

## Explicitly Omitted Complexity

- No global workflow engine or mega-state-machine.
- No microservice split, message broker, or event-sourced rewrite.
- No automatic source-to-floor reconciliation after handoff.
- No silent live reoptimization or relocation of existing run work.
- No forecast command that creates shifts, batches, selections, or placement.
- No invented completion time when current physical progress is unknown.
- No broad admin integration-health product; this package only retains the data
  and removes it from floor work.
- No big-bang schema rewrite. A migration is added only if characterization
  proves durable data is required and its forward/rollback safety is explicit.

## Verification Target

- Transition matrices for every changed Orders and Production lifecycle.
- Characterization tests before implementation.
- Duplicate, stale, replay, equal-revision conflict, out-of-order, and
  concurrent source observation tests.
- Pressly-finished plus later Cents regression: observation retained,
  canonical state unchanged, no dead letter, no floor attention.
- Cents completion after handoff: observational for Production.
- Cents cancellation before handoff: prospective withdrawal.
- Cents cancellation after handoff: canonical Pressly state unchanged.
- Field-authority tests proving non-lifecycle source fields remain independent.
- Forecast determinism, service-day boundary, active-run remainder,
  appendability, hard-capacity, finished-work exclusion, and no-later-shift
  tests.
- Contract, database, API, Worker, Orders, Production, scheduling, and
  Processor tests.
- Desktop and mobile visual review, keyboard/accessibility checks, interaction
  checks, and clean browser console.
- Typecheck, lint, formatting, production build, and `git diff --check`.

## Definition of Done

All tasks in the queued network are verified and committed with evidence.
Source observations and canonical lifecycle have the confirmed authority
boundary, persistent transitions have one graph owner, remaining-day forecast
behavior is deterministic and server-owned, and the Processor surfaces match
the confirmed information architecture. Post-start arrivals are reviewed in
Schedule through server-authorized placement choices, while Production remains
centered on live physical execution.

Repository and local-runtime evidence are reported separately from deployment
and pilot evidence. Any new durable learning is applied only through a separate
source-backed Stateworks delta.
