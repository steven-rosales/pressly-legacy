# Module Architecture

This document is the placement contract for backend application and domain
code. It is intentionally strict. A repository expected to grow by hundreds
of thousands of lines cannot make ownership, dependency direction, or effect
boundaries matters of taste.

The compiler and ESLint rules are the executable authority. This document
explains the decisions they encode.

## 1. The Four Questions

Place new code by answering these questions in order:

1. **Who owns the meaning?**
2. **Is this an application feature or a reusable foundation?**
3. **Is the operation pure or effectful?**
4. **Does the data cross a trust or process boundary?**

Do not begin with a suffix or an implementation mechanism. Begin with the
business or application meaning.

```text
new behavior or data
  |
  +-- one business authority owns its meaning
  |     -> modules/<family>/<authority>
  |
  +-- coordinates multiple peer authorities for one operator experience
  |     -> modules/experience/<experience>, using injected ports
  |
  +-- reusable technical algebra or mechanism
  |     -> packages/<owner>
  |
  +-- process startup, transport, framework, or concrete runtime wiring
  |     -> apps/<process>
  |
  +-- serialized input or output crossing a trust/process boundary
        -> packages/contracts/<boundary>
```

If no single owner can be named, the design is not ready to be placed.
`common`, `shared`, `utils`, `helpers`, `services`, and `platform` are not
owners.

## 2. Repository Authorities

The target backend authority tree is:

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

The families describe the kind of authority, not a dependency hierarchy.
Modules remain isolated peers:

- `business` owns product state and business behavior.
- `security` owns authentication identity and authorization decisions.
- `integration` owns durable interaction with external systems.
- `experience` owns cross-domain application workflows for a specific
  operator experience.

One module never imports another module. An app composes peer modules by
injecting narrow capabilities into ports. An experience module can request an
Orders or Production capability through a port, but cannot import either
module's package.

```text
apps compose
modules decide
packages enable
contracts parse and serialize boundaries
```

## 3. Universal Module Shape

Every module uses the same physical grammar:

```text
modules/<family>/<authority>/
  module.architecture.ts
  src/
    features/
      <namespace>/
        <verb-object>/
          <verb-object>.<role>.ts
    foundations/
      language/
        <concept>/
      algorithms/
        <algorithm>/
      ports/
        <capability>/
      adapters/
        <mechanism>/
          <capability>/
    composition/
      <authority>.composition.ts
    main.ts
    public.ts
  test/
    features/
    foundations/
    integration/
    support/
```

Namespaces group related features for traversal. Leaves have architectural
meaning. A namespace may not contain loose source files.

`main.ts` is the module composition root. `public.ts` is its stable surface.
Those are the only files permitted directly under `src`.

Both root surfaces enumerate every exported value and type. Export-star and
aliased compatibility re-exports are forbidden: they hide surface growth and
make the canonical application name ambiguous. Rename a symbol at its
semantic owner, then publish that name explicitly.

### Production reference authority

Production is the scale reference for a large authority. Its feature tree is
organized by operator intent, not by transport or persistence mechanism:

```text
features/
  demand/
    apply-fulfillment-demand/
    change-admission/
    change-order-resolution/
    resolve-source-closed-fulfillment/
    record-order-intake/
    review-order-backlog/
    set-order-priority/
  floor/
    advance-stage/
    assign-stage-machines/
    manage-batch-membership/
    reconcile-batch-progress/
  history/{list-activity,list-plans,list-runs,load-run}/
  orders/{list-order-control,list-orders,route-order}/
  queries/{load-board,load-remaining-day-forecast,load-workspace}/
  resources/{list-locations,manage-resources,manage-shift}/
  scheduling/
    accept-schedule/
    create-schedule/
    load-schedule/
    place-order/
    publish-config/
    replace-shift-selection/
    start-schedule/
```

Its shared language, algorithms, effects, and mechanisms are separate and
directed:

```text
foundations/
  language/      intrinsic rules, lifecycle graphs, commands, and read language
  algorithms/    named versioned scheduling and forecast implementations
  ports/         Production signal effect declarations
  adapters/
    errors/      expected Production failure to outer AppError mapping
    signals/     null/default signal implementation
    postgres/    board, command, execution, History, order, scheduling adapters
```

`defineProductionRules` compiles the immutable intrinsic rule set.
`defineProductionAlgorithmRegistry` compiles the immutable approved version
registry. Runtime apps may supply repositories, Clock, IdSource, and signal
effects; they may not inject alternate Production rules or an arbitrary
scheduler. A new policy belongs in a named language foundation. A new
algorithm must be versioned, registered explicitly, and preserve historical
version readability. Neither creates a new top-level Policy or Computation
authority.

## 4. Feature or Foundation

A **feature** is an independently nameable application action or query. Its
name is a verb-object phrase such as `load-pricing-catalog`,
`publish-pricing-change`, or `advance-production-stage`.

A feature owns the types and transformations that only it uses. It does not
import a sibling feature. If two features need the same concept, ask why:

```text
shared by two feature leaves
  |
  +-- same identity, invariant, lifecycle, or vocabulary
  |     -> foundations/language/<concept>
  |
  +-- same deterministic calculation with a named strategy/version
  |     -> foundations/algorithms/<algorithm>
  |
  +-- same required effect with a genuine replacement axis
  |     -> foundations/ports/<capability>
  |
  +-- same implementation of a shared port or mechanism
  |     -> foundations/adapters/<mechanism>/<capability>
  |
  +-- merely similar code with different meaning
        -> keep it in each owning feature
```

A foundation is promoted only after reuse or domain continuity is proven. It
must be narrowly named and may never become a local junk drawer. Foundations
do not import their consumers. Foundation-to-foundation dependencies are
directed and declared in `module.architecture.ts`.

Not every feature needs every role. Empty controller, repository, policy, or
model files are forbidden. A headless query may only need a port and use case;
a pure policy may only need a policy file.

A feature leaf owns at most one `*.usecase.ts` file. Two independently named
application operations are two verb-object features, even when one delegates
to the other. Split them into sibling leaves and connect them through a narrow
port in composition; feature leaves never import one another.

## 5. Dependency Direction

Inside a feature, dependencies point from mechanisms toward decisions:

```text
route -> controller -> usecase -> policy / projection / lifecycle
  |          |            |
  |          |            +-> port <- repo / adapter
  |          |
  |          +-> contract mapper
  |
  +-> boundary contract
```

Domain language does not know about application orchestration. Application
orchestration does not know about concrete persistence or transport.

The normal functional flow is:

```text
parse
  -> map boundary value
  -> load facts
  -> decide or derive
  -> commit a plan
  -> write audit/outbox atomically where required
  -> map boundary result
```

Pure code may use local mutation when it is observationally pure and clearer
or materially faster. Purity forbids observable effects, not efficient local
implementation.

## 6. Role Vocabulary

The suffix is a type-level architectural declaration. It determines the
meaning of a file and the dependencies and effects available to it.

| Suffix            | Meaning                                                            | Position and constraints                                                                 |
| ----------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `.entity.ts`      | Identity-bearing domain state with continuity over time            | Pure domain language; no protocol, SQL, framework, clock, or random access               |
| `.value.ts`       | Validated identityless domain value                                | Pure domain language; construction protects its invariant                                |
| `.event.ts`       | Immutable fact that occurred                                       | Pure data and constructors; no delivery mechanism                                        |
| `.lifecycle.ts`   | State/event transition graph                                       | Pure and total over declared states/events; illegal transitions are typed data           |
| `.model.ts`       | Application command, query, facts, proposal, result, or read model | Feature/application language; not a synonym for entity or database row                   |
| `.policy.ts`      | Pure business decision or rule                                     | Synchronous and deterministic from explicit input                                        |
| `.projection.ts`  | Pure derived view                                                  | Synchronous transformation with no ambient state                                         |
| `.algorithm.ts`   | Named, versioned heuristic or optimizer                            | Pure; selection is from an approved registry, not arbitrary runtime injection            |
| `.failure.ts`     | Expected rejection                                                 | Discriminated data returned in `Result`, not thrown                                      |
| `.error.ts`       | Unexpected error construction or normalization                     | Produces repository-standard throwable errors; never an expected branch                  |
| `.port.ts`        | Required effect or genuine replacement axis                        | Declarations only; no runtime value or implementation                                    |
| `.repo.ts`        | Persistence implementation                                         | Implements a port or feature persistence boundary; may use DB mechanisms                 |
| `.adapter.ts`     | Non-persistence mechanism implementation                           | Implements a port for HTTP, crypto, vendor SDK, filesystem, or runtime mechanism         |
| `.route.ts`       | Transport registration                                             | Owns paths/methods/middleware order, not decisions                                       |
| `.controller.ts`  | Boundary orchestration and presentation                            | Maps validated contract values into the use case and maps outcomes back to transport     |
| `.middleware.ts`  | Transport interception                                             | Framework-specific request lifecycle only                                                |
| `.command.ts`     | Explicit executable command value or command boundary              | Use only when the command itself has behavior or identity beyond a model type            |
| `.usecase.ts`     | Application orchestration                                          | Loads through ports, calls pure decisions, and commits effects; no SQL or framework APIs |
| `.composition.ts` | Explicit object/function graph construction                        | The only module area expected to know multiple feature and adapter constructors          |

Qualified mapper suffixes are mandatory:

- `.contract.mapper.ts` translates validated wire values and application
  values.
- `.persistence.mapper.ts` translates stored rows and domain/application
  values.
- `.projection.mapper.ts` translates one internal read representation into a
  derived view.

Bare `.mapper.ts` is forbidden because it hides which boundary is being
crossed. Every qualified mapper is a synchronous, deterministic
transformation. If the operation awaits a port, loads facts, reads a request,
or otherwise sequences effects, that outer operation is an `.adapter.ts` or
`.usecase.ts` which invokes the pure mapper after the effect completes.

### Entity versus model

Use `.entity.ts` only when all of these are true:

1. The value has a stable identity.
2. The identity continues across multiple state changes.
3. The module owns invariants governing those changes.
4. Callers reason about the same thing before and after a transition.

Use `.model.ts` for application inputs, outputs, facts, proposals, and read
models. Renaming every model to entity would erase the distinction and make
the architecture less precise.

Names such as `Stored*`, `Persisted*`, `*Row`, and `*Record` normally describe
a representation, not an entity. Raw rows stay behind a persistence mapper.
If a hydrated value really is the module's continuity-bearing aggregate, give
it the business name (`Order`, `ServiceFulfillment`, `ProductionShift`) rather
than preserving the mechanism that loaded it in its type name.

Production demonstrates the positive and negative cases. `ProductionShift`
and `ScheduleProposal` are entities because the same identity continues across
module-owned lifecycle transitions. Board rows, History records, placement
contexts, commands, mutation results, and persisted snapshots are models or
projections even when they contain IDs; they do not become entities merely
because storage can identify them.

## 7. Effects and Ports

Effects must be visible in function signatures and construction:

- time uses `Clock` from `@pressly/time`;
- identifiers use `IdSource` from `@pressly/kernel`;
- atomic execution uses `UnitOfWork` from `@pressly/kernel` with construction
  owned by `@pressly/db`;
- atomic work that can reject after partial writes uses `ResultUnitOfWork` and
  `defineResultUnitOfWork`; the DB adapter privately translates `Result.err`
  into rollback, while application code keeps the rejection as typed data;
- persistence is behind feature or shared module ports;
- HTTP mechanisms come from `@pressly/http`;
- logging and observation are injected sinks;
- cryptography, network, queues, filesystems, and vendor SDKs are adapters.

Do not create aliases such as `PricingClockPort = Clock`. The package type is
already the technical algebra. A feature-local port is justified only when it
adds application meaning, narrows semantics, or represents a real replacement
axis.

Port files contain declarations only. Constructors, default implementations,
fallbacks, environment reads, and mutable registries belong elsewhere.

## 8. Failures, Errors, and HTTP Problems

There are three different things and they must remain different:

```text
expected application outcome
  -> <feature>.failure.ts
  -> Result<Value, FeatureFailure>
  -> handled exhaustively by caller/controller

unexpected mechanism or invariant failure
  -> normalized AppError throwable
  -> observed once at a process edge
  -> safe diagnostic metadata retained

HTTP presentation
  -> status and problem response at controller/middleware edge
  -> never embedded in domain policy
```

Expected failures include current-state conflicts, ineligibility, missing
business records, and policy rejections a caller can reasonably act on. They
are discriminated values with stable codes. They do not contain HTTP status
codes. When a validation failure needs a distinction, use application meaning
such as `malformed` versus `semantic`; the edge chooses 400 versus 422.

Unexpected failures include unavailable databases, corrupt stored rows,
impossible invariants, broken configuration, and programming defects. Use the
explicit `@pressly/errors/app-error` and `@pressly/errors/factories` surfaces
to construct or normalize them. Live source in apps, modules, other packages,
and executable repository tooling never constructs, calls, or subclasses a
native throwable directly. Native construction is owned by the Errors package.
TypeScript uses an explicit `@pressly/errors/*` subpath; pre-install checkout
tooling uses `packages/errors/src/tooling-error.mjs`. Tests may use native
values only as deliberate fault fixtures.

Never catch an unexpected error merely to convert it into an expected business
failure. Never return an HTTP-shaped `AppError` as the domain failure type.
Application features must not throw private `Error` subclasses merely to roll
back an expected rejection; use the result-aware unit-of-work factory instead.
API controllers, Worker jobs, and CLI commands map a module failure into an
`AppError` only where that process needs transport or retry semantics.

## 9. Contracts and Unknown Values

`@pressly/contracts` owns wire formats, not application language.

Put a schema in Contracts only when the value crosses at least one of these:

- an untrusted client/server boundary;
- a process boundary such as API to worker;
- a durable serialized event boundary;
- a versioned external integration boundary.

Contracts may contain schemas, serialized command/result types inferred from
those schemas, and boundary version information. They must not contain domain
entities, repository types, use-case interfaces, database rows, policies, or
module-internal `Date`-rich models.

Open-ended serialized fields use the strict `JsonValue` algebra from
`@pressly/codec`, not `unknown`, `object`, or `Record<string, unknown>`. A
runtime boundary that accepts arbitrary JSON uses `jsonValueSchema` from
`@pressly/codec/zod`. Persistence mappers guard decoded database values before
they enter application language. `undefined`, non-finite numbers, dates,
class instances, and cyclic objects are not JSON and fail closed.

Durable application ports accept `JsonObject` or a closed serialized union,
never inward `unknown`. A typed pure projection must explicitly select fields,
normalize supported representations, and omit absent optional fields before a
value reaches the port. Generic `JSON.stringify` round trips are not mappers:
they silently erase `undefined`, invoke class serialization, and weaken the
application boundary. Adapters validate stored JSON again when reading it.

The boundary sequence is explicit:

```text
unknown
  -> contract schema parse
  -> trusted serialized contract value
  -> .contract.mapper.ts
  -> application model
```

Outbound data follows the reverse path. Modules should import Contracts only
from route/controller/contract-mapper roles. Inner application and domain code
must not depend on wire schemas.

Contracts expose explicit subpaths by boundary and no package-root application
surface. Module source imports a Contract only from a route or a qualified
contract mapper; controllers receive already validated boundary values and
mapper-owned translations.

## 10. Reusable Patterns and Factories

A design pattern earns a reusable factory only when all of these are true:

1. At least two real consumers share the same semantics, not merely similar
   syntax.
2. The varying and invariant parts can be expressed in a small typed input.
3. The returned shape makes effects and control flow explicit.
4. The factory removes duplicated policy or failure-prone wiring.
5. A direct function would no longer be clearer.

Factories live in a package when technically reusable, or in a module
foundation when domain-specific. Feature-local `.factory.ts` files are
forbidden. Patterns remain functions and immutable data; they do not introduce
base classes, service locators, or hidden registries.

Examples of earned factories include state-machine construction, bound cursor
codecs, unit-of-work construction, and cookie CSRF protection. A generic
repository, universal policy engine, or dependency-injection container is not
earned by this architecture.

## 11. Composition

Composition is explicit and shallow:

```text
package mechanism
  -> module adapter/repository
  -> module feature use case
  -> module public capability
  -> app transport/job/page composition
```

Module composition may connect its own features, foundations, and adapters.
App composition may connect multiple peer module public capabilities. No
module reaches across a peer boundary, and no app imports a module's internal
path.

Composition constructs and injects; it does not inspect application results to
recreate feature behavior. Result-dependent signal, audit, notification, or
observation selection belongs to the use case that knows what the result
means. The app supplies the concrete sink, and non-replay and after-commit
semantics remain explicit in that use case.

Process effects such as environment reads, arguments, stdin/stdout, process
signals, exit codes, and runtime shutdown belong to the owning app. Modules
receive only the already-derived data or narrow capability they require.

Prefer construction functions returning immutable records of named
capabilities. Do not use decorators, reflection, runtime class scanning,
mutable service registries, or ambient singletons.

## 12. Tests Mirror Ownership

Tests use the same map as production code:

```text
test/features/<namespace>/<feature>/...
test/foundations/<category>/<foundation>/...
test/integration/...
test/support/...
```

- Pure policy, lifecycle, projection, and algorithm tests prove exhaustive
  decisions and invariants.
- Use-case tests inject deterministic clocks, IDs, ports, and repositories.
- Adapter/repository integration tests prove representation and mechanism
  behavior.
- Contract tests prove parsing and serialization at unknown boundaries.
- App tests prove composition and transport behavior.

Tests do not import sibling feature internals merely for convenience. Shared
builders belong in `test/support`, not source foundations.

## 13. Manifest as Formal Data

Every module declares its allowed structure as immutable data:

```ts
export default defineModule({
  id: 'business/pricing',
  packageName: '@pressly/pricing',
  features: defineNamespace({
    catalog: defineNamespace({
      'load-pricing-catalog': defineFeature.httpQuery({
        dependsOn: ['language/pricing'],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      pricing: defineFoundation.language(),
    }),
  },
});
```

The manifest is not descriptive documentation. It is compiled into filesystem
and import constraints. New feature profiles, roles, or dependency edges
require an intentional architecture change with compiler tests.

## 14. Review Checklist

Before accepting a new file or feature, verify:

1. Its semantic owner is unambiguous.
2. A feature name describes an application action or query.
3. Shared code has earned a narrowly named foundation or package owner.
4. The suffix accurately declares meaning and dependency position.
5. Pure decisions have no ambient effects.
6. Every effect is visible through a package algebra or application port.
7. Expected failures are typed data; unexpected failures use the error
   language; HTTP mapping is at the edge.
8. Unknown values are parsed once and mapped explicitly.
9. Peer modules are composed only by an app.
10. Tests mirror the same ownership tree.
11. Each feature leaf has at most one use-case file, and module root surfaces
    use explicit canonical exports.
12. `module.architecture.ts`, architecture lint, typecheck, tests, and build
    all pass.

If a proposed placement needs an exception to this decision tree, change the
architecture deliberately. Do not hide the exception behind a vague directory
or suffix.
