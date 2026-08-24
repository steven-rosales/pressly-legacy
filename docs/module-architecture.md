# Cell and System Placement

This is the placement contract for Pressly source.

There is one grammar:

```text
systems own durable meaning
cells own observable operations
experiences own cross-system workflows and presentation
hosts own protocols, frameworks, and process lifecycle
platform owns business-neutral mechanisms
topology selects the deployment
generated records that selection
```

## Placement Decision

Answer these questions in order:

1. Who owns the meaning?
2. Is this one observable operation or stable shared language?
3. Which parts decide and which parts perform effects?
4. Does the value cross a trust, process, or durable boundary?

```text
one durable business authority
  -> systems/<owner>

one command, query, reaction, process, or subscription
  -> systems/<owner>/src/cells/<namespace>/<verb-object>

one cross-system user workflow or browser feature
  -> experiences/<experience>

one Experience-owned operation
  -> experiences/<experience>/src/cells/<namespace>/<verb-object>

business-neutral mechanism
  -> platform/<mechanism>

protocol, framework, or process lifecycle
  -> hosts/<protocol>

deployment selection and construction
  -> topology/

mechanically derived catalog, client, map, or binding
  -> generated/

container or infrastructure packaging
  -> deploy/
```

If no semantic owner can be named, stop. `common`, `shared`, `utils`,
`helpers`, and `services` are not owners.

## Canonical Owners

```text
systems/{access,customers,ingress,orders,pricing,production}/
experiences/{control,customer,processor}/
hosts/{http,jobs,cli}/
hosts/browser/{control,customer,processor}/
platform/{auth,cells,codec,config,errors,http,jobs,logging,
          observability,postgres,testing,time}/
topology/
generated/
verification/
deploy/
```

Do not add another top-level source grammar.

## System Shape

A System normally has this shape:

```text
systems/<owner>/
  src/
    cells/
      <namespace>/
        <verb-object>/
    capabilities/       versioned capabilities offered to other owners
    contracts/          genuinely shared public owner contracts
    model/              stable owner language and pure algorithms
    postgres/           genuinely shared owner persistence
    schema/             owner schema factories
    system.ts           owner assembly
    public.ts           explicit public surface
  package.json
```

Directories are optional. Create only the roles the owner needs.

Feature-local behavior and persistence stay in the cell. Promote language or
mechanisms only after source-observed reuse proves that a wider semantic owner
is clearer.

System assembly constructs cells and exposes an immutable record of named
cells and capabilities. It does not implement result-dependent business
branches.

## Cell Shape

A cell owns one stable operation ID.

```text
systems/production/src/cells/floor/advance-stage/
  cell.ts
  contract.ts
  decide.ts
  execute.ts
  postgres.ts
  http.ts
  events.ts
  decide.spec.ts
  execute.spec.ts
  contract.spec.ts
  postgres.int.spec.ts
```

This is an example, not a file quota.

| Role            | Responsibility                                            |
| --------------- | --------------------------------------------------------- |
| `cell.ts`       | immutable declaration and binding                         |
| `contract.ts`   | versioned serialized input, output, and expected failures |
| `decide.ts`     | pure decision from complete facts                         |
| `execute.ts`    | effect sequencing and atomic intent                       |
| `postgres.ts`   | operation-owned SQL, locking, mapping, and persistence    |
| `http.ts`       | framework-neutral HTTP mapping                            |
| `job.ts`        | framework-neutral job mapping                             |
| `cli.ts`        | framework-neutral CLI mapping                             |
| `events.ts`     | produced or consumed message contracts                    |
| `*.spec.ts`     | local contract, decision, executor, and protocol proof    |
| `*.int.spec.ts` | real mechanism proof, normally PostgreSQL                 |

Existing precise names such as `.usecase.ts`, `.policy.ts`, `.repo.ts`, and
`.persistence.mapper.ts` remain valid when they name the role honestly.

One independently nameable operation means one cell. A cell does not import a
sibling cell's private implementation. Connect operations through System
assembly and a narrow capability with explicit meaning.

## Cell Declaration

The declaration is immutable operational data. It states:

- stable `<owner>.<verb-object>.v<version>` identity;
- command, query, reaction, process, or subscription kind;
- authentication and authorization requirements;
- input, output, and expected-failure contract versions;
- transaction, concurrency, and idempotency requirements;
- HTTP, job, CLI, or event-stream surfaces;
- emitted and consumed message contracts;
- retry and timeout policy when applicable; and
- a bounded observability operation name.

Topology selects declarations and records their public source location and
assembly key. A cell is deployed only through that checked selection.

Do not hide route, retry, authorization, or idempotency behavior in host or
topology branches.

## Experience Shape

An Experience coordinates public system capabilities and owns its own
workflow and presentation language.

```text
experiences/<experience>/
  src/
    cells/                 Experience-owned observable operations
    features/              browser features and component-local state
    presentation/          reusable Experience presentation language
    projections/           Experience-owned read projections, when earned
    experience.ts          explicit assembly
    public.ts              explicit public surface
  package.json
```

An Experience may import public system contracts and capabilities. It may not
import system cells, models, repositories, schema, or private source.

Browser features own interaction and presentation state. Backend systems remain
authoritative for eligibility, capacity, lifecycle, authorization, and durable
truth.

## Host Shape

A host contains process and mechanism effects only.

```text
hosts/http/                Express and HTTP process lifecycle
hosts/jobs/                polling, leases, retry timing, shutdown
hosts/cli/                 arguments, streams, files, prompts, exit
hosts/browser/<surface>/   framework entrypoints and browser globals
```

Hosts consume generated catalogs or runtime bindings. They do not handwrite
business routes, jobs, operation lists, or owner construction.

Environment, process arguments, stdin/stdout, files, signals, global browser
objects, SDK initialization, and exit behavior belong here.

## Platform Shape

Platform code is reusable only when it is business-neutral.

Good Platform concepts include:

- transactions, pools, and migration runners;
- codecs and boundary parsing mechanisms;
- clocks and ID sources;
- generic authentication and cryptographic mechanisms;
- generic HTTP and job execution;
- structured logging and observation sinks;
- test database safety and operation-proof registration.

Platform code does not know Pressly capabilities, routes, table meaning,
workflow states, or business owner names.

## Topology, Generated, and Deploy

Topology may know which owners exist because deployment selection is its job.
It may construct several owners and connect public capabilities. It does not
make business decisions or interpret protocols.

Generated output contains only deterministic catalogs, clients, maps, and
runtime bindings. Never edit it by hand.

Deploy owns Dockerfiles, Compose/release packaging, and infrastructure assets.
It may name image and process identities. It does not become a source owner.

## Contracts and Boundaries

The producer owns serialized values.

- Cell contracts stay beside the owning operation.
- Shared producer contracts move to the owning System only after genuine reuse.
- Experience workflow contracts stay with the Experience.
- Generic JSON, cursor, time, and digest codecs stay in Platform.

Contracts contain serialized data and schema versions. They do not contain
repositories, database rows, domain entities, framework requests, or vendor
SDK types.

Parse `unknown` at the boundary. Map synchronously into application language.
Do not use package-root imports to expose unrelated contracts.

## Decisions and Effects

Pure decisions receive complete facts:

```text
facts + command/query -> decision or result
```

Pure roles do not read databases, clocks, environment, random sources,
filesystem, network, logs, or process state.

Executors read as a linear protocol:

```text
load replay receipt
-> load authoritative facts under the required lock
-> decide
-> commit mutation
-> append messages and audit
-> save receipt
-> return typed result
```

Business branching belongs in the decision. Replay, transaction, and mechanism
sequencing belong in the executor.

Create a port only for a real replacement or ownership boundary. Do not wrap a
single concrete function in ceremonial factories, managers, or repositories.

## Persistence

Each System owns its schema factory. Topology alone composes the complete
business schema.

Operation-specific SQL stays in the cell. Precisely shared owner persistence
is allowed only when at least two cells use the same semantic capability for
the same reason.

Every database-controlled write has real PostgreSQL proof for applicable
semantics:

- successful commit;
- expected rejection without partial state;
- unexpected failure rollback;
- same-payload replay;
- divergent-key conflict;
- same-key concurrency;
- declared optimistic or partitioned race; and
- state-message atomicity.

Mocks do not prove locks, uniqueness, isolation, rollback, or leases.

## Failures

Expected failures are typed data in the cell contract. They contain business
meaning, not HTTP status codes or retry instructions.

Unexpected mechanism, configuration, corruption, and invariant failures use
explicit `@pressly/errors/*` subpaths. Construct unexpected throwables only
through that owner.

Protocol presentation belongs to the host boundary. Job retry disposition
belongs to the job mechanism and cell declaration.

## Public Surfaces

Each owner exports the smallest supported surface:

- versioned contracts;
- declarations selected by topology;
- assembly functions;
- narrow capabilities; and
- explicitly supported browser or read-model contracts.

Non-surface files export only declarations they own. They do not import and
re-export a symbol or create an identity alias.

Direct named re-exports belong only in declared owner or package entrypoints.
Export-star and aliased compatibility re-exports are forbidden.

## Operation Proof

Every selected operation has executable typed proof in its exact cell
directory.

```ts
proveOperation({
  operationId: 'production.advance-stage.v1',
  declaration: advanceStageCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'one optimistic contender commits',
      proves: ['postgres-commit', 'declared-concurrency-race'],
      run: proveOptimisticRace,
    },
  ],
});
```

The operation ID, layer, scenario name, and claims remain literal. The strict
verifier rejects bare proof references, owner-root matrices, import-closure
credit, cross-system fallback, missing claims, and shared cell paths.

Cross-system conformance and browser workflows remain valuable, but they never
replace missing local proof.

## Forbidden Residue

Do not introduce:

- `apps/`, `modules/`, `packages/`, or `infra/` source roots;
- compatibility or legacy directories;
- central business contract or schema authorities;
- generic `common`, `shared`, `utils`, `helpers`, or `services` buckets;
- sibling-cell private imports;
- host business branches;
- runtime filesystem discovery;
- export-star or identity aliases;
- business behavior generated from metadata; or
- a package per cell.

## Review Checklist

Before treating a structural change as complete:

1. Name the semantic owner and verb-object operation.
2. Confirm one selected operation resolves to one `cell.ts`.
3. Keep contracts, decisions, effects, persistence, protocol mapping, and tests
   local when applicable.
4. Verify dependency direction and explicit public surfaces.
5. Verify every required typed proof claim executes locally.
6. Run architecture, lint, type, affected unit, PostgreSQL, browser, and build
   gates in proportion to risk.
7. Delete the replaced source and compatibility residue.

Run at minimum:

```bash
pnpm architecture:check
pnpm lint:architecture
pnpm typecheck
pnpm test:topology
```
