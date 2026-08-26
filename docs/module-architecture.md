# Module architecture

This document answers where new code goes. The rule is ownership first, then
operation shape, then technical boundary.

## The six source areas

| Area                   | Responsibility                                    | May depend on                                    |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `systems/<owner>`      | durable business truth and owner operations       | own internals, public peer contracts, Platform   |
| `experiences/<name>`   | cross-system workflows, browser features, UI      | public System capabilities/contracts, Platform   |
| `hosts/<name>`         | framework, protocol, process, and ambient effects | Topology and Platform                            |
| `platform/<mechanism>` | reusable business-neutral mechanism               | Platform                                         |
| `topology/`            | deployment selection and composition              | public Systems/Experiences, Platform             |
| `verification/`        | cross-owner and behavioral proof                  | public owner surfaces, Topology, test mechanisms |

`deploy/` contains packaging and infrastructure. It is not an application
source area.

## Placement questions

Ask these in order:

1. Who owns the meaning?
2. Is this one independently observable operation?
3. Which part decides and which part performs effects?
4. Does it cross a wire, process, durable, or trust boundary?

Use the answer:

```text
durable business meaning              -> systems/<owner>
one command/query/reaction/process    -> systems/<owner>/src/cells/<scope>/<verb-object>
cross-system user workflow            -> experiences/<name>
browser feature/presentation           -> experiences/<name>/src/features
HTTP/jobs/CLI/browser process effect  -> hosts/<host>
business-neutral mechanism            -> platform/<mechanism>
deployment choice and wiring          -> topology/
cross-owner proof                     -> verification/
```

Do not create `common`, `shared`, `utils`, `services`, `modules`, or
compatibility directories to avoid naming the owner.

## System shape

A system normally looks like:

```text
systems/production/
  src/
    cells/
      floor/advance-stage/
      scheduling/create-schedule/
    capabilities/       versioned capabilities offered to peers
    contracts/          versioned owner contracts
    model/              stable pure owner language
    postgres/           shared owner persistence, only when justified
    schema/             owner schema factories
    system.ts           explicit assembly
    public.ts           explicit public surface
```

The assembly is the obvious entry node for the system. It receives concrete
mechanisms and returns named cells/capabilities. It does not contain a second
business policy implementation.

Systems never import a peer's private cell, model, persistence, or schema.
Peer collaboration crosses an explicit public capability or contract.

## Cell shape

Keep one observable operation in one directory:

```text
systems/production/src/cells/floor/advance-stage/
  cell.ts
  contract.ts
  decide.ts
  execute.ts
  postgres.ts
  http.ts
  job.ts
  *.spec.ts
```

Only add files for roles the operation actually has.

| File          | Owns                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `cell.ts`     | operation identity, typed contract, policy, surfaces, and assembly binding |
| `contract.ts` | serialized input/output/expected-failure contract                          |
| `decide.ts`   | pure decision from complete facts                                          |
| `execute.ts`  | effect order, transaction intent, and result-dependent signals             |
| `postgres.ts` | owner-local SQL, locks, row mapping, and persistence                       |
| `http.ts`     | framework-neutral request/response mapping                                 |
| `job.ts`      | framework-neutral job mapping                                              |
| `*.spec.ts`   | proof at the boundary that owns the behavior                               |

Pure decisions do not import Node, SQL, HTTP, clocks, randomness, logging, or
process effects. Expected application failures are returned as typed data.
Unexpected throwables are created through `@pressly/errors/*`.

## Experience shape

An Experience is a user-facing workflow, not a second System. It may combine
public System capabilities and contracts, then own presentation state and
components:

```text
experiences/processor/
  src/
    cells/          Experience-owned server operations
    capabilities/   narrow injected dependencies
    contracts/      serialized Experience projections
    features/
      production-board/
      scheduling/
    browser/        browser composition and presentation
    server.ts       explicit server assembly
    public.ts       explicit public surface
```

Experiences do not import server persistence or System internals. A browser
component should receive data and capabilities; it should not decide server
authorization, schedule production work, or recreate a System policy.

## Hosts

Hosts own ambient effects and framework lifecycle:

- `hosts/http`: Express, middleware order, request context, tracing, readiness,
  signals, and shutdown.
- `hosts/jobs`: polling, leases, retry timing, heartbeats, cancellation, and
  shutdown.
- `hosts/cli`: argv, environment, stdin/stdout, prompts, session files, and
  exit behavior.
- `hosts/browser/*`: React/Next/Vite startup, browser globals, SDKs, routing,
  hydration, and lifecycle.

A host should be boring. Its main job is to read configuration, call a
Topology composition root, and hand lifecycle effects to the generic host
implementation. It does not select business operations by hand.

## Topology

Topology is handwritten composition. The public files are intentionally
small and named after the runtime they assemble:

```text
topology/
  http.ts                 API composition root
  jobs.ts                 Worker composition root
  cli.ts                  admin composition root
  database.ts             PostgreSQL composition root
  browser/control.ts      Control browser composition
  browser/customer.ts     Customer web composition
  browser/processor.ts    Processor browser composition
  browser-operations.ts   explicit browser wire descriptors
  observability.ts        bounded metric/operation catalog
  pressly.topology.ts    selected owner declarations
  pressly-target-owners.ts owner assemblies used by the selection
```

A topology file may import public owner assembly surfaces and concrete
business-neutral mechanisms. It may provide dependencies, select cells, and
assemble arrays. It must not decide business outcomes.

Browser subpaths are separate so a Next server page does not pull the Control
or Processor browser graph into its bundle:

```text
@pressly/topology/browser/customer
@pressly/topology/browser/customer-client
@pressly/topology/browser/processor
@pressly/topology/browser
```

Use the narrowest runtime subpath.

## Traversal recipes

For an HTTP operation:

```text
hosts/http/main.ts
  -> topology/http.ts
  -> topology/runtime/http/catalog.ts
  -> owner assembly in topology/runtime/http/bootstrap/target-owners.ts
  -> <owner>/src/cells/<scope>/<verb-object>/http.ts
  -> execute.ts
  -> decide.ts or postgres.ts
```

For a job:

```text
hosts/jobs/src/main.ts
  -> topology/jobs.ts
  -> topology/runtime/jobs/catalog.ts
  -> <owner>/src/cells/<scope>/<verb-object>/job.ts
  -> execute.ts
  -> postgres.ts
```

For a browser action:

```text
hosts/browser/<name>/src/main.tsx
  -> topology/browser/<name>.ts
  -> topology/browser-operations.ts
  -> experiences/<name>/src/browser or src/features
  -> host transport adapter
  -> HTTP operation contract
```

Search the versioned operation ID first. The declaration's `id` is the
stable join key across contract, route, job, browser descriptor, tests, and
observability. No separate architecture map is required.

## Public surfaces

A public entrypoint is an intentional API. It may use named exports, but
internal files export only declarations they own.

Consumers import:

- exact System capability or contract subpaths;
- exact Experience contract or browser subpaths;
- Topology runtime subpaths for process composition;
- Platform mechanism subpaths for technical behavior.

Do not use export-star, identity aliases, aggregate business roots, or
compatibility re-exports.

## Persistence

Each System owns a schema factory. Only
`topology/pressly-postgres-schema.ts` composes the complete database schema.

```text
owner schema factory
  -> topology/pressly-postgres-schema.ts
  -> topology/database.ts
  -> platform/postgres
```

SQL belongs in the owning cell's `postgres.ts`, an owner-local
`*.postgres.ts`, or a precisely shared owner persistence module. Storage rows
are representations, not domain entities. Qualified mappers are synchronous
and pure.

## Enforcement

Dependency-cruiser checks import direction, cycles, and source-vs-build
resolution. ESLint checks language, public surfaces, purity, SQL placement,
and throwable ownership. TypeScript and tests provide behavior and contract
proof.

```bash
pnpm architecture:check
pnpm lint:architecture
pnpm typecheck
pnpm test:topology
```

Static gates prove structure only. Run the affected owner, host, PostgreSQL,
flow, and browser gates before claiming runtime equivalence.
