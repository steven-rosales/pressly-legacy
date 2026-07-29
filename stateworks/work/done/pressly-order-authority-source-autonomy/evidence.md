# Pressly Order Authority and Source Autonomy Evidence

## Work

- Work ID: `pressly-order-authority-source-autonomy`
- Network:
  `stateworks/work/done/pressly-order-authority-source-autonomy/network.yaml`
- Domain memory: `order-management` v4 and `laundry-production` v17
- Activated: `2026-07-28T10:29:19-04:00`

## Baseline Preservation

The work was activated from the validated queued package after Steven's
explicit implementation instruction on 2026-07-28.

The starting worktree already contained the applied external-source-autonomy
memory deltas and unrelated user changes under `docs/seo-skill.md`,
`apps/web/public/marketing/`, and `docs/agents/07/10/`. Those unrelated changes
will not be reset, deleted, reformatted, staged, or claimed as part of this
work.

`lpms-production-readiness` remains active behind its human and revalidation
gates. `lpms-order-control-correctness-hardening` remains separately queued and
retains ownership of whole-order routing, machine-capacity repair,
route-idempotency-under-lock, and History cursor precision.

## T0 - Authority Baseline

Status: committed.

### Current source-to-canonical mutation path

1. The API Cents normalizer preserves the vendor lifecycle string as source
   data.
2. `cents-order.handler.ts` is the first authority leak. It translates Cents
   lifecycle into canonical Order state and fulfillment release state, then
   sends those values through `ObserveOrderSourceCommand`.
3. That command currently extends canonical `OrderInput`, so the adapter
   boundary also accepts source-supplied physical bag count.
4. `observe-order-source.policy.ts` can create released or canceled canonical
   records, release or withdraw an existing fulfillment, replace items, and
   replace fulfillment facts from that source input.
5. `observe-order-source.repo.ts` commits the adopted Order, fulfillment,
   items, latest snapshot, source authorities, and source-neutral outbox event
   in one transaction.
6. The Worker projects that committed event to Production. Production does not
   decode vendor lifecycle values, but it currently accepts a source-influenced
   release state and can turn incoming bag count into physical intake.

The canonical Order graph already owns `open -> completed|canceled`; the
fulfillment graph already owns `unreleased -> released|withdrawn` and
`released -> withdrawn`. The gap is that the external observation policy asks
for those transitions instead of a Pressly command doing so.

### Existing safeguards retained

- Exact source identity, newest/replay/stale/equal-revision-conflict
  classification, command receipts, optimistic versions, transactional
  outbox, source snapshots, and field authorities already exist.
- Production archive and restore already use a separate explicit resolution
  graph and append-only history.
- Source-location binding is a transport concern and is not a lifecycle
  authority.

### Santiago-shaped archive gap

The Processor drawer reads `cents · COMPLETED` from the latest Orders source
snapshot. The bulk archive review instead labels and filters Production's
projected canonical `commercialState` as though it were source state.
Santiago's canonical state is `open`, so changing the date cannot make that
order match `source_terminal_before_cutoff`. The default thirty-day cutoff is
an additional discoverability constraint, but it is not the root cause.

Production already owns the individual resolution mutation. The missing work
is a server-composed eligibility/action view that combines latest source
evidence with Production-owned graph and guard results, plus an individual
Processor affordance. Production must not query Orders source tables or
reinterpret Cents lifecycle.

### Non-overlap boundary

This work does not change whole-order routing, between-stage machine-capacity
repair, route idempotency under the Production aggregate lock, or History
cursor precision. Those remain owned by
`lpms-order-control-correctness-hardening`.

### Baseline proof

- Orders: 2 files, 21 tests passed before implementation.
- Worker: 7 files, 42 tests passed before implementation.
- Production: 35 files, 167 tests passed before implementation.
- Processor: 37 files, 230 tests passed before implementation.
- Processor emitted two pre-existing DialogDescription warnings in
  `sheet.test.tsx`; no baseline test failed.

## T1 - Claim Authority and Posture Graphs

Status: committed.

The Orders core now contains a closed claim taxonomy, versioned Cents/default
capability profiles, a pure disposition evaluator, assurance and posture
clamps that can only demote authority, and a kernel-backed persistent posture
graph. External lifecycle and physical bag count can never auto-adopt. Missing
configuration, identity conflicts, and revision conflicts fail closed.

Graph and matrix tests enumerate all claim, phase, posture, assurance, and
posture-edge combinations. Orders typecheck, lint, build, and 30 unit tests
pass.

## T2 - Authority Evidence Persistence

Status: committed.

Migration `0035_order-source-authority-evidence.sql` adds append-only,
versioned capability profiles, source-and-location control revisions, and
observation decisions bound to exact source identity, revision, payload hash,
profile, control, policy, disposition, reason, and canonical versions. The
migration contains no lifecycle rewrite, implicit normal posture, or
destructive backfill.

Database typecheck, lint, 34 unit tests, 3 migration integration tests, and an
actual test-database migration pass. Drizzle schema consistency and diff
checks pass.

## T3 - Decision-Based Observation Ingestion

Status: committed.

`ExternalOrderObservation` no longer accepts canonical lifecycle, fulfillment
release, or bag count. Orders selects `open`, `unreleased`, and no physical
bag truth for any prospective canonical record. Every source observation is
revision-classified and evaluated under persisted profile and posture inside
the Orders transaction; the decision ledger, source evidence, allowed
descriptive adoption, and source-neutral outbox effect commit atomically.

The Cents Worker now submits lifecycle as observation evidence only and asks
Orders for customer-claim authority before linking a source customer. Missing
or blocked configuration retains inspectable decision evidence without
creating or changing canonical work.

Orders integration tests pass 10/10, including concurrent exact-source
serialization, unconfigured and blocked sources, and lifecycle permutations.
Worker typecheck, lint, build, and 45 tests pass. Architecture boundaries pass
68/68.

## T4 - Explicit Pressly Commercial Commands

Status: committed.

The generic mutation surface has been replaced with task-shaped create,
correct, complete, cancel, follow-source, release, and withdraw commands.
Lifecycle and release commands select events on the existing kernel graphs;
callers cannot submit target states. Descriptive commands cannot carry
commercial lifecycle, release, or physical bag truth.

Every direct command requires a validated actor and origin, stable reason,
idempotency key, authorized location, and applicable Order and fulfillment
versions. Fulfillment mutations acquire the Order lock before the fulfillment
lock. Command receipts and source-neutral outbox effects commit with canonical
state.

Orders passed 61 unit and 14 Postgres integration tests. Contracts passed 103
tests, the focused API command routes passed 9 tests, and architecture
boundaries passed 69 tests. Orders, Contracts, API, and Worker typecheck, lint,
and build gates passed for this slice.

## T5 - Adapter and Production Authority Cutover

Status: committed.

The Cents order handler now sends raw lifecycle only as source observation
evidence. Its strict observation contract cannot carry canonical Order state,
fulfillment release, or bag count. Cents order webhooks can resolve an existing
exact User source link but cannot mutate User profiles.

Production consumes only source-neutral canonical fulfillment demand. The
legacy v1 demand envelope retains its bag-count field for hash and replay
compatibility, but Production ignores it and never creates or updates physical
intake from an Orders projection. Operator-recorded bag count remains the only
physical intake truth.

Orders passed 14 integration tests, Worker passed 43 tests, Production policy
passed 146 tests, Production passed 170 tests, and architecture boundaries
passed 69 tests. Focused typecheck, lint, and build gates passed.

The original cross-module customer preauthorization was removed because it
could become stale between Orders assessment and Users mutation. A delayed
customer source link is instead reconciled by an Orders-owned, customer-only
automation under the durable webhook retry boundary. Final reversed-arrival,
blocked-posture, and replay proof is recorded with V1.

## T6 - Deterministic Reconciliation and Cutover

Status: committed.

The reconciliation application classifies exact source identity and revision,
canonical Order and fulfillment versions, raw Production commitment facts, and
current capability configuration without mutating state. Canonical ordering
and hashing make reports stable across input permutations.

Apply mode is fail closed: identity ambiguity, contradictory or orphan
Production facts, configuration drift, or a changed report digest causes zero
writes. The only permitted backfill appends shadow decisions under locked,
reloaded evidence; it cannot change canonical Orders, outbox events, or
Production. Initial Cents control can start only in `observe_only` or
`blocked`. Posture changes use the explicit graph and require audited human
promotion.

Orders passed 55 focused unit and 14 Postgres integration tests for the
reconciliation/configuration slice. CLI passed 30 tests. Orders and CLI
typecheck, lint, and build gates passed.

## T7 - Authoritative Operational Order View

Status: committed.

The API now composes one authoritative operational Order view without moving
write authority between domains. It combines stable order and customer
identity, canonical commercial and Production state, latest source evidence,
field provenance, source-control posture, exact source decision evidence,
canonical versions, bounded audit history, and structured Production command
capabilities.

Production owns every command capability. Queued moves and route exceptions
reuse the Production routing policies and return per-target allow or deny
results with stable denial codes, current versions, and capacity evidence.
The API can narrow those results but cannot grant an action that Production
did not allow.

The bounded Postgres integration query was exercised with more than eight
orders, deterministic ties, multiple source-control revisions, exact latest
source decisions, and canonical/customer composition. Focused API tests passed
8/8, the API integration query passed 1/1, Contracts passed 105 tests, and
Production routing, capability, and database integration tests passed.

The Santiago-shaped behavior was proven through the same individual
Production resolution command used by Processor: source-terminal evidence is
visible independently from canonical commercial state, archive changes only
the Production resolution graph, and restore is a separately audited graph
transition.

## T8 - Processor Order Command Center

Status: committed.

Processor makes Pressly truth primary and source observations secondary. The
order drawer groups customer and order identity, canonical commercial and
Production state, source evidence, field ownership, source posture and
decision, record versions, Production-owned actions, disabled-action reasons,
and recent audit history. Technical evidence is collapsed behind a secondary
disclosure.

Individual archive explains that the action does not delete or complete the
order, requires a stable reason and manager fact review, displays current
source posture, and adds a second confirmation. Restore is available from
History, explains that it does not change Cents, requires a reason, and
re-evaluates current facts on the server.

Focused Processor order-control and resolution tests passed 23/23. The full
Processor end-to-end slice passed 37 files and 231 tests. A rendered restore
check exposed one misleading success message; the view now resolves the
canonical identity and reports `Order <display number> is back in active
work.` The connected History regression suite passed 2 files and 6 tests
after the repair. The final combined History, order-control, and resolution
recheck passed 3 files and 22 tests; Processor typecheck, lint, and build also
passed.

## V1 - Authority, Migration, and Integration Correctness

Status: committed.

The final repository gates passed:

- repository typecheck: 47/47 tasks;
- repository lint: 26/26 tasks;
- repository tests: 48/48 tasks plus 11 tooling files and 175 tests;
- repository build: 26/26 tasks;
- LPMS integration command: passed;
- LPMS end-to-end command: API 5 files and 49 tests, Processor 37 files and
  231 tests;
- Production Postgres integration: 15 files and 34 tests;
- database integration: 18 files and 74 tests;
- Orders Postgres integration: 4 files and 17 tests;
- database test migration: passed;
- architecture boundaries: 70/70;
- repository formatting: passed; and
- `git diff --check`: passed.

The Orders-owned pending source-customer resolver also passed 66 unit tests
and 17 Postgres integration tests. It deterministically repairs customer/order
arrival reordering from exact source identity, supports concurrent and later
sequential replay, and never falls back to fuzzy contact matching.

The final architecture inspection found no Orders-to-Production import,
Production-to-Orders or Cents dependency, or adapter path capable of carrying
canonical lifecycle or physical-intake fields. The CLI remains an application
composition boundary.

Nonblocking build observations remain explicit:

- the Processor production JavaScript chunk is 1,312.23 kB and exceeds the
  500 kB warning threshold;
- the Web build reports the existing Sentry
  `onRouterTransitionStart` configuration warning; and
- two existing Sheet description warnings remain in the Processor tests.

None changed the authority model or failed a verifier.

## V2 - Rendered Operational Usability

Status: committed.

Chrome verification used the rebuilt local API and Processor with the
documented variable-order fixture.

- Desktop at 1440 x 900 preserved the existing Processor shell, row density,
  shared tokens, and right-side order workspace.
- Mobile at 390 x 844 used a full-width order workspace, retained readable
  identity and source sections, and kept the command footer reachable.
- Home rows consistently showed the canonical order number and customer name
  or explicit unavailable fallback.
- A local append-only source-control sequence rendered Cents as blocked,
  retained the observation, explained that it could not change Pressly facts,
  and then returned through `blocked -> observe_only -> normal`.
- Archive removed one order from active work without deleting or completing
  it. History retained the order number, customer name, reason, actor, and
  restore action.
- Restore returned the order to active work and displayed the corrected
  identity-specific success message.
- A deliberately stale Production version was rejected. Processor kept the
  form open and instructed the manager to reopen the order and review its
  current floor position.
- Loading, empty, permission-denied, error, blocked-source, and action-denial
  component states remained covered by the focused rendered component suites.
- Browser console inspection returned no warnings or errors after the
  operational flows.

The Product Design audit found no unresolved high-severity workflow or
responsive issue. Exact QA evidence is recorded in `design-qa.md`.

## T9 - Evidence, Memory, and Readiness Rebaseline

Status: committed.

The final report records repository and local-runtime proof separately from
deployment and live-operation proof. `lpms-production-readiness` is rebaselined
to the new source-neutral observation and canonical-command boundary while
retaining H1, deployment, alerting, and live verification gates. The separate
Order Control correctness queue remains disjoint.

Validated implementation deltas update Order Management and Laundry
Production memory only with facts proven by V1 and V2. Their generated context
packs are deterministic and no secret, credential, raw customer payload,
private token, or customer PII is included.

## Verification Log

Repository implementation and local runtime are verified. No production
deployment, production cutover, live Cents behavior, production data
cardinality, legal retention policy, or pilot readiness is claimed by this
work.
