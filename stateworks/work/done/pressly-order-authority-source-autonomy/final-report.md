# Pressly Order Authority and Source Autonomy Final Report

## Result

Status: done.

Pressly now treats external systems as observation providers and retains
canonical control of Orders and Production. Cents can establish exact source
identity and supply approved descriptive commercial facts, but it cannot
release, withdraw, complete, cancel, intake, schedule, route, archive, restore,
delete, or otherwise transition Pressly work.

## Authority Architecture

The implementation uses task-shaped hexagonal slices rather than an adapter
rules engine:

```text
Cents webhook
  -> durable inbox
  -> source-neutral observation
  -> Orders capability and posture policy
  -> append-only observation decision
  -> allowed descriptive canonical effects

First-party intent
  -> typed Pressly command
  -> aggregate-owned state graph
  -> versioned canonical commit and audit
  -> source-neutral outbox
  -> Production projection
```

Orders owns the source capability envelope, exact source identity, revision
classification, field authority, observation decisions, source-control
posture, commercial lifecycle graphs, command idempotency, and atomic outbox
effects. Production owns admission, physical intake, scheduling, routing,
execution, and nondestructive resolution graphs. API and Worker compose these
ports; they do not redefine transitions.

The implementation remains a modular monolith with narrow ports. Orders does
not import Production, Production does not import Orders, Cents, or
source-authority policy, and the Cents adapter cannot carry canonical
lifecycle or physical-intake fields.

## External Observations

- Cents lifecycle is retained as source evidence only.
- External physical bag claims cannot become physical intake.
- Every valid newer observation is evaluated against an immutable capability
  profile, exact claim and phase, current field authority, and a persistent
  source-and-location posture.
- Assurance and posture can only demote authority.
- Missing configuration, blocked posture, identity ambiguity, revision
  conflict, and invalid evidence fail closed.
- Decisions are append-only and bind exact source revision and hash, profile,
  policy, posture, disposition, reason codes, adopted fields, and canonical
  versions.
- Customer and order webhook reordering is repaired through an Orders-owned
  exact source-identity resolver, never fuzzy contact matching.

## Canonical Commands

The former generic mutation surface is replaced by explicit create, correct,
complete, cancel, follow-source, release, and withdraw commands. Persistent
lifecycle changes select events on the authoritative directed graphs; callers
cannot submit target states.

Commands require an actor and origin, location authorization, stable reason,
idempotency key, and expected aggregate versions. The repository commits
canonical state, command receipt, audit evidence, and source-neutral outbox
effects atomically.

## Reconciliation and Control

The reconciliation command is read-only by default and classifies exact source
identity and revision, canonical Order and fulfillment versions, raw
Production commitment facts, capability configuration, and ambiguity.

Apply mode can append deterministic shadow decisions and initialize Cents only
in `observe_only` or `blocked`. Ambiguity, contradictory or orphan Production
facts, changed digest, or configuration drift stops the cutover with no
canonical mutation. Posture promotion requires an authorized audited command
through the persistent posture graph.

## Processor Operations

The server-composed operational Order view makes Pressly state primary and
source observations secondary. It includes:

- stable order and customer identity;
- canonical commercial and Production state;
- latest source evidence and field ownership;
- source posture and exact decision;
- canonical versions and bounded audit history; and
- Production-owned command capabilities with denial reasons.

Managers can archive one eligible Production order from the order workspace.
The flow explains that nothing is deleted or marked produced, requires reason
and fact review, and confirms twice. History retains the permanent record and
offers an explicit reasoned restore. Stale commands fail with recovery
guidance and retain the manager's form state.

## Verification

The final gates passed:

- repository typecheck: 47/47 tasks;
- repository lint: 26/26 tasks;
- repository tests: 48/48 tasks plus 11 tooling files and 175 tests;
- repository build: 26/26 tasks;
- LPMS integration and end-to-end commands;
- API end-to-end: 5 files and 49 tests;
- Processor end-to-end: 37 files and 231 tests;
- Production Postgres integration: 15 files and 34 tests;
- database integration: 18 files and 74 tests;
- Orders Postgres integration: 4 files and 17 tests;
- database test migration;
- architecture boundaries: 70/70;
- repository formatting; and
- whitespace checking.

The rebuilt local Postgres, API, Worker, and Processor were healthy. Chrome
verification covered desktop and mobile operational lists and drawers,
blocked-source explanation, archive, History restore, stale-version recovery,
identity-specific feedback, and console health. No browser warnings or errors
were present.

Nonblocking build warnings remain documented in `evidence.md`.

## Deliberate Exclusions

- No external source receives lifecycle or Production authority.
- No global workflow or generic cross-domain rules engine was introduced.
- No routine hard delete, lifecycle rewrite, destructive backfill, or guessed
  reconciliation was introduced.
- No customer PII, raw payload, secret, credential, or private token is stored
  in Stateworks.
- The separate Order Control correctness package still owns whole-order
  routing, between-stage machine-capacity repair, route idempotency under the
  aggregate lock, and History cursor precision.

## Evidence Boundary

This report proves repository behavior and the recorded local runtime. It does
not prove production deployment, live Cents contract behavior, production
data cardinality, legal retention policy, alerting, disaster recovery, or
pilot readiness.

The active `lpms-production-readiness` work retains those human, deployment,
and live-operation gates.
