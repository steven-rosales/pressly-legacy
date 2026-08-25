# Architecture

Pressly is a cellular TypeScript modular monolith.

The filesystem answers four questions:

1. Who owns the meaning?
2. Where does one observable operation execute?
3. Which effects cross a boundary?
4. Which operations does the deployed topology select?

```text
systems own durable business truth
cells own independently observable operations
experiences own cross-system workflows and presentation
hosts own protocols, frameworks, and process lifecycle
platform provides business-neutral mechanisms
topology selects and assembles the deployed graph
generated records that selection mechanically
```

There is one architecture grammar. `apps/`, `modules/`, `packages/`, and
`infra/` are not source-architecture roots.

The detailed placement contract is in
[Cell and system placement](./module-architecture.md). Test ownership and
commands are in [Test guide](./test-guide.md).

## Sources of Truth

1. Source, contracts, schema factories, migrations, and runtime configuration
   say what the checkout implements.
2. Stateworks domain memory preserves accepted domain decisions and
   invariants.
3. Active Stateworks work preserves current status, evidence, and human gates.
4. Living docs explain the current architecture and operations.
5. Completed work, plans, and agent artifacts are historical evidence.

When sources disagree, record and reconcile the drift. Never rewrite history
to resemble the current checkout.

## Repository Map

```text
hosts/          HTTP, jobs, CLI, and browser process boundaries
systems/        Access, Customers, Ingress, Orders, Pricing, Production
experiences/    Control, Customer, and Processor workflows and presentation
platform/       auth, cells, codec, config, errors, HTTP, jobs, logging,
                observability, PostgreSQL, testing, and time mechanisms
topology/       hand-authored deployment selection and owner assembly
generated/      deterministic catalogs, clients, maps, and runtime bindings
verification/   cross-owner conformance, flow, and migration proof
deploy/         container and infrastructure packaging
tooling/        repository, browser, PostgreSQL, release, and architecture tools
docs/           current guidance and protected historical plans
stateworks/     durable domain memory and delivery state
```

Root manifests and configuration may remain as files. Business source does not
belong at the repository root.

## Runtime Graph

```text
owner cell declaration and public assembly
                    |
                    v
            topology/pressly.topology.ts
                    |
                    v
       deterministic generated catalog or binding
                    |
                    v
                 generic host
                    |
                    v
          HTTP / job / CLI / browser process
```

Topology selects and constructs behavior. It does not implement business
behavior. Generated files bind that selection without adding policy. Hosts
interpret protocols and own process effects without handwritten domain
branches.

### Systems

Each system is the semantic authority for its durable truth.

| System       | Authority                                                                              |
| ------------ | -------------------------------------------------------------------------------------- |
| `access`     | identities, sessions, workforce, authorization, business and location scope            |
| `customers`  | canonical customer identity and customer-owned facts                                   |
| `ingress`    | external receipts, quarantine, inbox leasing, replay, dead letters, source bindings    |
| `orders`     | incoming proposals, canonical Orders, fulfillments, lifecycle, transactional outbox    |
| `pricing`    | pricebooks, pricing plans, and publication                                             |
| `production` | laundry demand, scheduling, floor execution, resources, history, and operational reads |

A system may expose versioned contracts and narrow capabilities. It never
imports a peer system's private cells, model, persistence, or schema, and it
never writes a peer's tables.

### Cells

A cell owns one independently observable command, query, reaction, process, or
subscription.

Its declaration makes these facts explicit:

- stable versioned operation identity;
- input, output, and expected-failure contracts;
- authentication and authorization requirements;
- transaction, concurrency, and idempotency semantics;
- HTTP, job, CLI, or event-stream surfaces;
- emitted and consumed messages; and
- bounded observability identity.

One operation has one cell path. Operation-specific contracts, decisions,
executors, persistence, protocol mapping, and tests remain in that cell.
Stable system language may be promoted only when it has one semantic owner and
genuine reuse.

### Experiences

An Experience owns a user workflow that crosses system boundaries. It may
compose public system contracts and capabilities into Control, Customer, or
Processor behavior.

Experiences also own browser features, presentation state, components, and
experience-specific projections. They do not own another system's durable
truth and do not import system internals, persistence, or schema.

### Hosts

Hosts are generic protocol and process executors.

- `hosts/http` owns Express, middleware execution, request context, tracing,
  process startup, signals, readiness, and shutdown.
- `hosts/jobs` owns polling, leases, heartbeats, retry timing, cancellation,
  observation, and shutdown.
- `hosts/cli` owns arguments, environment, stdin/stdout, session files,
  prompts, presentation, signals, and exit behavior.
- `hosts/browser/*` owns framework startup, routing entrypoints, browser
  globals, telemetry SDKs, hydration, and lifecycle.

A host may import Platform and generated bindings. Host source does not import
Systems, Experiences, or Topology directly. It contains no Orders,
Production, Access, Cents, or other business branch.

### Platform

`platform/` owns reusable mechanisms with no Pressly business knowledge:

- `auth`: credential, cookie, signature, and cryptographic mechanisms;
- `cells`: declarations, contracts, surfaces, catalogs, and core algebra;
- `codec`: canonical serialization, cursors, JSON, UTC, and digests;
- `config`: environment and runtime configuration parsing;
- `errors`: unexpected throwable error language;
- `http`: framework-neutral HTTP mechanisms;
- `jobs`: durable job-loop mechanisms;
- `logging` and `observability`: bounded reporting mechanisms;
- `postgres`: pooling, transactions, migrations, health, and ledger custody;
- `testing`: deterministic fixtures and typed operation-proof registration;
- `time`: clocks and calendar transformations.

Platform never imports a business owner.

### Topology and Generated Code

`topology/` is the hand-authored deployment graph. It selects owner assemblies,
connects narrow capabilities, supplies concrete mechanisms, and checks route,
job, event, contract, schema, and operation identity.

`generated/` contains compiler-owned output:

- HTTP, job, CLI, event-stream, and observability catalogs;
- typed browser clients;
- the architecture map; and
- `generated/runtime`, the executable bindings consumed by hosts.

Generated files contain static imports and wiring, never business decisions.
Edit source declarations or topology, then regenerate.

## Dependency Direction

Allowed direction is narrow:

```text
hosts -> generated runtime, generated catalogs, platform
topology -> public system and Experience assembly, platform
generated runtime -> topology, public owner assembly, platform
generated catalogs and clients -> public owner contracts, platform/cells
experiences -> public system contracts and capabilities, platform
systems -> own cells/model/schema, peer public contracts, platform
platform -> platform
```

Forbidden edges include:

```text
host -> system, Experience, or topology
platform -> business owner
system -> peer runtime, private cell, model, persistence, or schema
Experience -> system private cell, model, persistence, or schema
cell -> sibling-cell private implementation
pure decision -> SQL, HTTP, filesystem, process, clock, random, or logging
browser presentation -> system runtime or persistence
```

Import from the semantic owner. Non-surface files export only declarations they
own. Direct named re-exports are reserved for declared package or owner
surfaces. Export-star, identity aliases, and compatibility re-exports are
forbidden.

## Contracts and Unknown Values

The producer owns every serialized boundary. A cell owns its input, output,
failure, event, and job contracts. An Experience owns cross-system workflow
contracts. Consumers import explicit public owner subpaths.

```text
unknown
  -> owner contract decode
  -> trusted serialized value
  -> pure boundary mapping
  -> application language
```

Boundary contracts contain serialized values, schemas, and versions. They do
not contain entities, repositories, database rows, framework objects, or
internal `Date`-rich models.

## Persistence and Migration Ownership

Each system owns a schema factory and receives only its schema segment.
Topology composes those factories into one PostgreSQL database, but every
foreign key remains inside one owner. Cross-system identity is carried as
data and reconciled through public capabilities, messages, or an
Experience-owned process; an owner table never points at a peer table.

```text
system schema factory -> topology schema composition -> one Drizzle schema
platform/postgres/migrations -> one immutable ledger -> one migration runner
```

The current migration history begins at the clean, pre-user database epoch.
That epoch deliberately retired the compatibility-era non-Pricing history
while preserving Pricing exactly. Its SQL files and journal order are now the
immutable baseline: future migrations append to it, and fresh apply, upgrade,
restore, and checked byte hashes use the same runner and ledger.

Storage rows are representations, not domain entities. SQL stays inside the
owning cell's PostgreSQL adapter or precisely shared system persistence. Pure
mappers validate and translate rows synchronously.

Use cases and executors own atomic intent. Transactions keep invariant checks,
idempotency receipts, audit, durable messages, and mutation together when the
operation requires it. External network calls normally remain outside the
transaction.

## Decisions, Effects, and Failures

Pure decisions receive complete facts and return immutable data. Executors
obtain facts and commit plans through explicit capabilities.

```text
contract -> execute -> load facts -> decide -> commit effects
```

Time, IDs, transactions, persistence, crypto, network, queues, files, logging,
and observation are explicit dependencies. Ambient effects are forbidden below
the boundary that owns them.

Expected application rejection is typed data. Unexpected mechanism,
configuration, corruption, or invariant failure uses the Errors-owned
throwable language and is observed once at the process edge.

## HTTP and Security Boundaries

Cells declare structural HTTP surfaces. Topology binds each selected operation
to a checked boundary profile. Generated runtime supplies the catalog to the
HTTP host.

Request locations are parsed once. When authorization needs route scope before
body parsing, the order is:

```text
params validation -> authorization -> body validation -> handler
```

One Express 5 promise boundary handles unexpected failures. Do not add a local
promise wrapper or a second error boundary. Browser capability visibility is
presentation only; the HTTP boundary remains authoritative.

## Operation Proof

Every selected operation has meaningful tests in its exact cell directory.
Tests register literal operation IDs and named claims through
`@pressly/testkit/operation-proof`.

The strict verifier derives required claims from positive operation semantics.
Applicable write cells prove real PostgreSQL commit, expected rejection without
partial state, unexpected rollback, replay, divergent-key conflict,
concurrency, and state-message atomicity. Cross-system flow tests are recorded
separately and never certify missing local proof.

## Architecture Enforcement

- dependency-cruiser checks cycles and legal direction;
- ESLint checks surfaces, purity, framework effects, SQL placement, and
  throwable ownership;
- topology tests check identities, collisions, profiles, contracts, schemas,
  generated freshness, and exact cell locality;
- typed executable proof checks named operation scenarios; and
- TypeScript checks public assembly and capability conformance.

Run:

```bash
pnpm architecture:check
pnpm lint:architecture
pnpm typecheck
pnpm test:topology
```

## Adding One Operation

1. Name the System or Experience that owns the meaning.
2. Create one verb-object cell and versioned contract.
3. Put pure decisions and explicit effects in that cell.
4. Add cell-local unit, contract, protocol, component, and PostgreSQL proof as
   applicable.
5. Register the cell in its owner's explicit public assembly.
6. Select it in topology and declare its boundary profile.
7. Run `pnpm architecture:generate`.
8. Run the affected architecture, lint, type, test, PostgreSQL, and build
   gates.

If ownership cannot be named, the design is not ready. Do not hide ambiguity
in `common`, `shared`, `utils`, `services`, a host, or topology.
