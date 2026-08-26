# Architecture

Pressly is a handwritten TypeScript modular monolith. The repository has one
purposeful dependency direction:

```text
hosts       process and framework entrypoints
systems     durable business truth and operations
experiences browser workflows and UI
platform    reusable technical mechanisms
topology    composition roots and deployment choices
verification cross-owner and behavioral proof
```

There is no generated source tree and no architecture compiler. TypeScript
defines behavior; dependency-cruiser and ESLint enforce the boundaries.

## Repository map

```text
hosts/
  http/                  Express process
  jobs/                  durable worker process
  cli/                   admin process
  browser/{control,...}/ React, Next, and browser lifecycle

systems/
  access/ customers/ ingress/ orders/ pricing/ production/

experiences/
  control/ customer/ processor/

platform/
  auth/ cells/ codec/ config/ errors/ http/ jobs/ logging/
  observability/ postgres/ testing/ time/

topology/
  http.ts                HTTP composition root
  jobs.ts                worker composition root
  cli.ts                 CLI composition root
  database.ts            PostgreSQL composition root
  browser/               browser composition roots
  browser-operations.ts  explicit browser wire descriptors
  observability.ts       explicit metric and operation catalog
  pressly.topology.ts    selected owner declarations

verification/             contract, flow, integration, and architecture proof
```

## Ownership

Systems own durable meaning. Experiences own cross-system user workflows and
presentation. Hosts own protocol and process effects. Platform owns mechanisms
that have no Pressly business vocabulary. Topology connects these pieces; it
does not make business decisions.

| Area       | Owns                                                              |
| ---------- | ----------------------------------------------------------------- |
| Access     | identities, sessions, workforce, authorization, scope             |
| Customers  | canonical customer identity and customer facts                    |
| Ingress    | external receipts, inbox leases, quarantine, replay, dead letters |
| Orders     | proposals, canonical Orders, fulfillments, lifecycle, outbox      |
| Pricing    | pricebooks, pricing plans, publication                            |
| Production | demand, scheduling, floor execution, resources, history           |
| Control    | operator workflow and management UI                               |
| Customer   | customer-facing web workflow                                      |
| Processor  | production-floor workflow and UI                                  |

## The main traversal

Start at the entrypoint for the runtime you are changing.

```text
HTTP:
hosts/http/main.ts
  -> topology/http.ts
  -> topology/runtime/http/catalog.ts
  -> topology/runtime/http/bootstrap/target-owners.ts
  -> owner cell http.ts
  -> execute.ts
  -> decide.ts / postgres.ts

Jobs:
hosts/jobs/src/main.ts
  -> topology/jobs.ts
  -> topology/runtime/jobs/catalog.ts
  -> topology/runtime/jobs/public.ts
  -> owner cell job.ts
  -> execute.ts / postgres.ts

CLI:
hosts/cli/src/main.ts
  -> topology/cli.ts
  -> topology/runtime/cli/catalog.ts
  -> experience-control CLI declarations
  -> cell executor

Browser:
hosts/browser/<name>/src/main.tsx
  -> topology/browser/<name>.ts
  -> topology/browser-operations.ts
  -> Experience browser composition
  -> browser feature model
  -> HTTP request transport
```

For one operation, search its versioned ID. Then open its owner declaration,
contract, executor, decision, persistence adapter, protocol surface, and local
tests. The operation ID is the stable join key; no architecture map is needed.

## Operations and cells

A cell keeps one independently observable command, query, reaction, process, or
subscription together. The useful cell shape is:

```text
<verb-object>/
  cell.ts       operation declaration and binding
  contract.ts   serialized input/output/failure
  decide.ts     pure decision, when one exists
  execute.ts    effect sequencing and atomic intent
  postgres.ts   owner-local SQL and row mapping
  http.ts       protocol mapping, when exposed
  job.ts        job mapping, when exposed
  *.spec.ts     focused proof
```

The declaration is typed source data. It records the operation ID, contracts,
auth policy, transaction/concurrency/idempotency facts, protocol surfaces,
messages, retry policy, and observability name. Topology selects declarations
directly into owner compositions.

Keep business meaning in the owning system. Keep pure decisions independent of
Node, SQL, HTTP, clocks, randomness, logging, and process effects. Return
expected application failures as typed data; construct unexpected throwables
through the Errors-owned factories.

## Topology

Topology is intentionally boring and searchable. It contains direct imports,
arrays, and small adapters:

- `pressly.topology.ts` selects the owner declarations used by this deploy;
- `runtime/http/catalog.ts`, `runtime/jobs/catalog.ts`, and
  `runtime/cli/catalog.ts` select executable owner cells for generic hosts;
- `browser-operations.ts` owns explicit browser operation descriptors;
- `browser/*.ts` composes each Experience with its descriptors;
- `observability.ts` joins operation declarations to bounded metric metadata;
- `database.ts` composes the owner schema factories into one PostgreSQL runtime.

Topology has no source scanners, freshness checks, export-name metadata, artifact
writers, or generated runtime package. Change the direct composition and let
TypeScript, tests, dependency-cruiser, and ESLint report mistakes.

## Dependency direction

```text
topology    -> public systems, public experiences, platform
hosts       -> topology and platform
experiences -> public systems, public contracts, platform
systems     -> own cells/model/schema, peer public contracts, platform
platform    -> platform
verification -> public owner/topology surfaces and platform test mechanisms
```

Forbidden edges include:

- a system importing a peer's private cell, model, persistence, or schema;
- an Experience importing system internals;
- business source importing a host;
- a pure decision importing IO or process effects;
- a host branching on business policy;
- a frontend importing server runtime or persistence code; and
- generic `common`, `shared`, `utils`, or `services` buckets.

Import from the narrow semantic owner. Public entrypoints may provide named
exports; internal files export only declarations they own.

## Persistence and boundaries

Each system owns its schema factory. Only `topology/pressly-postgres-schema.ts`
composes all owner schema segments. SQL and row mapping remain in the owning
system or cell.

```text
owner schema -> topology database.ts -> platform/postgres
unknown wire input -> owner decoder -> typed contract -> application logic
```

HTTP route policy is declared beside the operation and bound in topology. The
generic HTTP host owns middleware order, request context, tracing, readiness,
signals, and shutdown. Jobs own leases, retry timing, heartbeat, and
shutdown. Browser hosts own browser globals and framework lifecycle.

## Enforcement

Dependency-cruiser checks import direction and source-vs-build resolution.
ESLint checks language rules, surfaces, purity, SQL placement, and throwable
ownership. TypeScript checks types and package composition. Runtime and
cross-owner tests prove behavior that static tools cannot.

```bash
pnpm architecture:check
pnpm lint:architecture
pnpm typecheck
pnpm test:topology
```

For a feature, also run its owner tests, affected host tests, PostgreSQL
integration proof, and browser smoke path as applicable. Architecture checks
are not runtime-equivalence or production-readiness proof.

## Adding an operation

1. Name the semantic owner and verb-object operation.
2. Add the contract, decision, executor, persistence, and protocol files that
   the operation actually needs.
3. Register it in the owner's explicit assembly.
4. Add it to the direct topology composition only when deployed.
5. Add local unit/contract/integration proof.
6. Run dependency-cruiser, ESLint, TypeScript, and affected behavior gates.

If the path is difficult to traverse, improve ownership or naming before adding
another abstraction.
