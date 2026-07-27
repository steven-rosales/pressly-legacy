# LPMS Production-Order Resolution and Row Identity

## Status

Active. Steven authorized implementation on 2026-07-26.

`lpms-operational-authority-remaining-day-forecast` is complete.
`lpms-order-control-correctness-hardening` was explicitly rebaselined against
that result and remains queued; this package must preserve its four known
correctness gaps and may not claim they are repaired unless separately proven.

## Observable Outcome

Managers can remove old, never-produced orders from active Processor work
without deleting records, inventing floor completion, or allowing a later
external observation to resurrect them.

When complete:

- Pressly execution remains truthful: an order that was not produced in
  Pressly is never marked finished;
- Production owns an explicit, persistent, graph-governed resolution lifecycle
  for work resolved without production;
- finished and resolved orders leave operational Home, Intake, Schedule,
  Forecast, and Production counts while remaining inspectable in History;
- a manager can resolve or restore one safe order through a versioned,
  idempotent, audited command;
- a manager can preview and confirm a bounded old-order cleanup against the
  exact server-owned candidate set;
- selected, batched, scheduled, active, or finished work cannot pass through
  the cleanup workflow;
- ordinary Processor users never receive a destructive Delete action; and
- every individual actionable order row or card consistently shows the order
  number and customer name, including later pages of server-paginated views.

## Task Shape

This is a durable Production lifecycle and backlog-reconciliation workflow with
concurrency, audit, pagination, cross-module read composition, and
operator-facing consequences. It deserves one aggregate-owned lifecycle graph,
pure guards, versioned application commands, transactional persistence, and
server-owned projections.

It does not justify a generic workflow engine, event-sourced rewrite, hard
deletion subsystem, or client-owned transition logic.

## Confirmed Domain Model

### Execution remains execution

The existing Production execution lifecycle remains:

```text
unassigned -> scheduled -> finished
```

`finished` means Pressly observed or explicitly reconciled physical completion.
An order completed outside Pressly must not enter that state.

### Resolution is an orthogonal persistent lifecycle

Production adds a separate aggregate-owned lifecycle:

```text
open --resolve_without_production--> resolved_without_production
resolved_without_production --restore--> open
```

The graph is defined once with the kernel state-machine definer under
`modules/policy/production`. It exports its states, events, allowed actions,
transition evaluator, and graph. Use cases orchestrate graph decisions and
effects; repositories, route handlers, adapters, queries, and UI components
cannot define parallel transitions.

Restore is an explicit, audited compensation command. It does not erase the
original resolution event, adopt a Cents lifecycle value, or make the order
ready by itself. Current canonical demand, admission, intake, and scheduling
rules are re-evaluated after restoration.

### Archive is presentation, not deletion

The Processor may label the manager action **Archive from active work**, while
the durable domain outcome remains **resolved without production**.

Archive means:

- remove the order from operational work and counts;
- retain canonical Order, User linkage, source observations, Production facts,
  and audit history;
- do not claim it was produced; and
- do not permit later source observations to reopen it.

Finished Pressly work needs no new transition. It leaves operational views and
continues to belong in History.

## Safety Classification

The server, never the browser, classifies candidates.

### Safe for bounded bulk resolution

- execution is `unassigned`;
- no physical intake has been recorded;
- no manual admission or other operator-owned override exists;
- no current or historical shift selection, schedule commitment, batch
  membership, stage attempt, route, or pending placement exists; and
- the order and resolution versions still match the preview.

An old due date or a Cents terminal status may support a recommendation, but it
cannot independently resolve Pressly work.

### Individual manager review

Uncommitted work with physical intake, manual admission, priority changes, or
pending placement requires a stronger item-level confirmation and reason. Any
pending placement cleared by resolution must be cleared atomically and
recorded in the same audit boundary.

### Blocked from cleanup

Selected, batched, scheduled, active, routed, reconciled, or finished work
cannot be resolved through this workflow. It requires an existing forward
reconciliation path or a separately modeled cancellation or compensation
workflow.

## Backlog Review Experience

Home receives a manager-only **Review old orders** entry point or compact
attention banner when candidates exist. No new primary navigation destination
is required.

The review explains:

> Archive orders completed outside Pressly. They will leave active work, but
> nothing will be deleted or marked as produced.

The server preview partitions results into:

- **Ready to archive**;
- **Review individually**;
- **Kept for safety**; and
- **Already in history**.

Confirmation is bound to an exact candidate/version snapshot and canonical
preview hash. The manager supplies a typed reason such as Processor not in use,
completed outside Pressly, canceled or never arrived, duplicate or import
mistake, or other with a note. Commit reloads and revalidates the same facts
under the Production scheduling boundary. Drift rejects the affected bounded
commit instead of silently changing scope.

T0 must measure real backlog cardinality before choosing synchronous
transaction size. If a bounded transaction is safe, keep the implementation
direct. Introduce a durable chunked job only if measured volume requires it.

## Appended Product Design Task: Order-Row Identity

This is an independent presentation and read-composition task. It must not be
folded into the resolution lifecycle or migration.

The current Intake and Home desktop rows establish the useful operational
pattern: order number first, customer name second. The current Schedule
ready-order and live-placement rows, Forecast order rows, History run
membership rows, and Home mobile cards omit that second identifier even when
the operator is choosing or recognizing one physical order.

The consistent identity pattern is:

1. canonical human-facing order number as the primary label;
2. canonical customer business name, otherwise first and last name, as the
   secondary label;
3. localized **Customer unavailable** when no canonical name exists; and
4. phone only in Intake and order detail, where contact context is useful.

Apply the pattern to individual actionable order rows and cards, including
Home mobile, pre-start Schedule selection, live-run additions and exact
placement, Forecast groups, and History run memberships. Production batch
cards are batch summaries rather than individual order rows and remain outside
this task unless implementation evidence proves a separate batch-identity
design is needed.

Customer identity remains User and Order data. Production tables and domain
contracts must not copy or own it. API-owned Processor read composition should
resolve canonical identities for the complete bounded page in one batched
operation, with no browser per-row fetch and no backend N+1 query. A small
shared Processor identity presenter/component should preserve the same visual
hierarchy, truncation, accessible name, mobile stacking, and fallback across
surfaces.

Acceptance includes business names, personal names, unavailable customers,
long names, English and Spanish, mobile and desktop layouts, assistive
technology labels, and pages after the first cursor.

## Architecture Boundaries

- `modules/policy/production` owns the resolution lifecycle graph and pure
  cross-state guards.
- `modules/business/production` owns versioned single and bulk use cases,
  locking, idempotency, transactional mutation, and audit effects.
- `packages/db` persists the current resolution projection and coherent
  resolution metadata with checked migration behavior.
- `packages/contracts` exposes typed commands, expected failures, preview
  hashes, sanitized history, and server-owned action availability.
- `apps/api` composes Processor-specific User, Order, and Production reads,
  including customer identity, without transferring write authority.
- `apps/processor` renders server-owned states and actions and does not
  recreate lifecycle, candidate, or restoration policy.
- `work_event` remains the authoritative mutation ledger, not a full
  event-sourced aggregate.

## Relationship to Existing Work

The active operational-authority package establishes the one-way Cents
handoff, explicit Production execution graph, remaining-day forecast, and
Processor information architecture this work relies on.

The queued correctness-hardening package repairs route idempotency, physical
milestone, machine-capacity, and History cursor behavior. It should complete
first so this package does not build new History and Order Control behavior on
known correctness gaps.

On activation, T0 must re-read both packages and the current worktree. If their
implementation or memory boundaries changed, this package must be rebaselined
before schema or code changes.

## Explicitly Omitted Complexity

- No routine hard delete, cascade-delete UI, or destructive floor action.
- No PII retention, anonymization, cold-storage, backup-erasure, or legal
  deletion policy; that requires a separate administrative package.
- No automatic resolution from Cents lifecycle, order age, or due date.
- No resolution of selected, batched, scheduled, active, or finished work.
- No rewriting finished work into resolved work.
- No source snapshot deletion or canonical Order mutation.
- No global workflow engine or generic status framework.
- No Production-owned copy of customer names.
- No unbounded candidate list loaded into browser state.

## Verification Target

- Exhaustive state/event matrix tests for the resolution lifecycle graph.
- Tests proving adapters, repositories, and UI cannot define lifecycle
  transitions or action availability.
- Migration tests for forward consistency, coherent resolution metadata, and
  indexes.
- Version, authorization, idempotency, replay, stale-preview, and concurrent
  resolve/restore tests.
- Guards for intake, admission, selection, pending placement, membership,
  attempts, scheduling, active execution, and finished work.
- Source replay tests proving later observations cannot resurrect resolved
  work.
- Projection tests proving finished and resolved work are absent from every
  operational count and remain available through sanitized History.
- Bulk preview and commit tests proving exact scope, bounded behavior, and
  explicit drift rejection.
- Customer identity contract and query tests proving batched composition,
  canonical precedence, fallback behavior, and no per-row N+1 access.
- Processor tests for every named row surface, cursor pages, long names,
  unknown customers, localization, accessible names, keyboard behavior, and
  responsive layout.
- Product Design review against the established Intake identity pattern,
  ElevenLabs structural language, shared shadcn primitives, and Pressly theme.
- Full policy, Production, contracts, database, API, Processor, LPMS
  integration, LPMS end-to-end, typecheck, lint, formatting, build, browser
  console, and whitespace gates.

## Definition of Done

Every task in the network is committed with evidence. Operators can establish
a clean operational baseline without deleting or falsifying history;
resolution and restoration have one authoritative lifecycle graph; every
mutation and projection respects that state; and individual operational order
rows consistently retain both order and customer identity.

Any durable learning is applied only through a separate source-backed,
validated Stateworks memory delta. Repository and local-runtime evidence remain
distinct from deployment, retention-policy, and pilot proof.
