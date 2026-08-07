# Scalable Functional Module Architecture

## Status

Complete locally on 2026-08-03. Steven authorized the complete repository
architecture migration on 2026-08-03. This work continues the locally verified
`module-architecture-refactor` baseline and replaces its transitional flat
module grammar with a scalable authority-first architecture.

## Outcome

Pressly has one mechanically enforced placement decision for application and
domain code as it grows:

```text
unknown protocol value
  -> contract validation
  -> contract mapper
  -> application model and use case
  -> entity / value / event / lifecycle / policy / algorithm
  -> port <- repository or adapter
  -> contract mapper
  -> serialized result
```

Every module is organized as `features`, `foundations`, and `composition`.
Features are named application actions or queries. Foundations are narrowly
declared language, algorithms, ports, or adapters used by more than one
feature. Apps compose modules and protocols; packages own reusable technical
algebra and mechanisms. Contracts contain wire schemas only.

## Architectural Vocabulary

- `*.entity.ts`: identity-bearing domain state with domain continuity.
- `*.value.ts`: validated identityless domain value.
- `*.event.ts`: immutable domain or application fact.
- `*.lifecycle.ts`: state/event transition graph.
- `*.model.ts`: application command, facts, proposal, result, or read model.
- `*.policy.ts`: pure business rule or decision.
- `*.projection.ts`: pure derived view.
- `*.algorithm.ts`: named and versioned heuristic or optimizer.
- `*.failure.ts`: expected, typed rejection returned as data.
- `*.error.ts`: unexpected error construction or normalization.
- `*.port.ts`: required effect or genuine replacement axis.
- `*.repo.ts`: persistence adapter.
- `*.contract.mapper.ts`, `*.persistence.mapper.ts`, and
  `*.projection.mapper.ts`: qualified representation transformations.
- `*.adapter.ts`: non-persistence mechanism implementation.
- `*.composition.ts`: explicit dependency construction.
- `*.factory.ts`: a reusable pattern definition only when repeated semantics
  earn a factory.

Not every feature needs every role. The architecture compiler validates the
selected feature profile and forbids empty ceremonial files.

### Placement decision rules

Use the semantic role of the data, not the name of the feature that happens to
consume it:

| Question                                                                                    | Placement                                                             |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Does the value keep one stable identity while module-owned state changes over time?         | `*.entity.ts`                                                         |
| Is it an identityless, invariant-bearing domain concept?                                    | `*.value.ts`                                                          |
| Is it a command, query, snapshot, page, list, detail, mutation outcome, or serialized view? | `*.model.ts`                                                          |
| Is it a database row, JSON envelope, or other persistence representation?                   | A `*.persistence.mapper.ts`-owned adapter shape, never an entity      |
| Is it unknown protocol input or output?                                                     | `packages/contracts` schema plus a `*.contract.mapper.ts` at the edge |
| Is it a known inward dependency required by a use case?                                     | A narrow feature or foundation `*.port.ts`                            |

`Record` is reserved for an actual representation record. A date-rich value
received from a peer application is a `Snapshot`; a string-date value returned
to a browser is a model or projection. An entity name cannot be earned merely
by containing an ID. It must represent continuity that the owning module can
hydrate and reason about across lifecycle changes.

### Failure decision rules

1. Expected validation, authentication, permission, not-found, conflict, and
   policy denials are feature-owned immutable `*.failure.ts` data returned as
   `Result`.
2. Database, cryptographic, configuration, corrupt-persistence, invariant, and
   programming failures throw normalized `AppError` values through explicit
   `@pressly/errors/*` subpaths. They are never disguised as expected results.
3. Repositories return known values for successful effects. A repository does
   not wrap every database call in `Result<AppError>`.
4. A transaction that must roll back an expected outcome uses the shared
   result-aware unit-of-work algebra; it does not invent a private `Error`
   subclass for control flow.
5. HTTP, CLI, worker, and other process edges map public feature failures into
   their own presentation language. Application and domain code contain no
   HTTP status.
6. Persisted JSON is accepted inward as Codec `JsonObject` or a closed union,
   then validated again when read. Evidence is not recovered through an
   unchecked cast.

## Authority Shape

```text
modules/
  business/
    orders/
    pricing/
    production/
    users/
  security/
    identity/
    authorization/
  integration/
    webhook-ingestion/
  experience/
    control/
    processor/
```

- Existing Auth moves to Security Identity.
- Access Control moves to Security Authorization and becomes framework-free.
- Production Policy and Scheduling Computation are absorbed by Production as
  intrinsic language and versioned algorithms.
- Cross-domain Control and Processor application/query behavior leaves API
  and becomes experience modules.
- API remains a process and protocol adapter.

## Functional Core Standard

Feature work follows:

```text
parse -> map -> load facts -> decide/derive -> commit plan -> audit/outbox -> map
```

Expected business outcomes use typed `Result<Value, FeatureFailure>` values.
Exceptions are reserved for unexpected mechanism or programming failures and
are normalized once at an edge. Time, IDs, transactions, persistence, network,
logging, and other effects are explicit. Pure code may use local mutation when
it is observationally pure and materially clearer or faster.

Durable JSON ports accept Codec `JsonObject` or a closed serialized union.
Typed pure projections select every persisted field before crossing the port;
generic unknown-to-JSON round trips are forbidden. Persisted JSON is guarded
again by its adapter on read.

Live tooling follows the same ownership rule as runtime code. Checked-in Node
scripts, architecture tooling, deployment selection, release validation, and
shell-embedded JavaScript construct unexpected failures through
`@pressly/errors/tooling-error`; native throwable constructors remain confined
to the Errors package and intentional test fixtures. Every checked-in Turbo and
Vitest entry point has an explicit concurrency ceiling so validation cannot
multiply workspace tasks by unbounded test workers.

## Existing Correctness Boundary

The queued `lpms-order-control-correctness-hardening` work remains authoritative
for routing capacity invalidation, between-stage routing eligibility, route
idempotency under locking, and History cursor timestamp precision. This
structural migration must preserve those gaps as named debt and must not claim
they are solved. Affected Production slices require characterization before
movement and must retain exact runtime behavior.

## Done Means

- Architecture Compiler v2 discovers per-module immutable manifests and
  validates nested namespaces, feature profiles, foundation dependency edges,
  suffix roles, pure-role constraints, and mirrored tests.
- Every backend module uses the authority-first family and universal internal
  grammar, without compatibility directories or undeclared top-level areas.
- Reusable clocks, ID sources, codecs, transactions, unit-of-work construction,
  HTTP boundary patterns, authorization machinery, money algebra,
  observability contracts, and test doubles have explicit package owners.
- Contracts contain only protocol schemas and serialized values; module-owned
  application and domain types remain inward.
- Production owns its policy and scheduling language without a giant injected
  policy bag or arbitrary algorithm injection.
- Authorization contains no Express or contract-specific body casts.
- API contains protocol and process concerns, not Control or Processor
  application policy.
- Expected failures, unexpected errors, and HTTP presentation are distinct.
- The new rules are documented as placement decision trees and enforced by
  lint, architecture tests, typecheck, and repository tests.
- Bounded repository test, lint, typecheck, and build gates pass. Database
  integration proof is reported separately and never fabricated.

## Explicitly Omitted

- New laundry-production business behavior.
- The future physical-observation, service-fulfillment, logistics, pricing,
  Driver, and customer-product implementation described in later planning.
- Distributed services, a DI container, generic repositories, a mandatory
  message bus, base entity classes, or a universal policy engine.
- Claiming the queued LPMS correctness gaps are fixed by file movement.
