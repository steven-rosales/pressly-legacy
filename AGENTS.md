# Pressly Agent Guidance

## Load Context First

Before substantive product, domain, architecture, or implementation work:

1. Read `stateworks/memory/index.yaml`.
2. Load `stateworks/memory/domains/steven-collaboration/context-pack.md`.
3. For LPMS work, also load
   `stateworks/memory/domains/laundry-production/context-pack.md`.
4. Inspect relevant work under `stateworks/work/active/` and
   `stateworks/work/queued/` before planning new work.

## Memory Boundaries

- Steven's explicit request in the current task overrides saved preferences.
- Collaboration preferences belong in `steven-collaboration` memory.
- Laundry-production facts, invariants, and policies belong in
  `laundry-production` memory.
- Unfinished implementation state belongs in Stateworks work items and
  evidence, not in durable domain memory.
- Apply durable memory changes through source-backed, validated deltas.
- Never store secrets, credentials, customer payloads, or private tokens in
  Stateworks.

## Architecture Placement

Before adding or moving backend application or domain code:

1. Read `docs/architecture.md` and `docs/module-architecture.md`.
2. Name the semantic authority and verb-object feature before choosing a file
   suffix.
3. Put durable business meaning in its owning system, a cross-system user
   workflow in its owning Experience, protocol lifecycle in a generic host,
   deployment selection in topology, and process effects in the owning host.
4. Keep one independently observable command, query, reaction, process, or
   subscription in one cell. Separate pure decision from effectful execution
   when those roles exist.
5. Keep versioned serialized contracts beside their producing cell or
   Experience. Consumers import only the producer's explicit public contract
   or capability subpath.
6. Keep SQL and row mapping in owner-local `postgres.ts`, `*.postgres.ts`, or
   `*.repo.ts` files. Cells receive an injected owner schema segment; only
   topology may compose all owner schema factories.
7. Return expected application failures as typed data. Construct unexpected
   throwable failures only through explicit `@pressly/errors/*` subpaths.
8. Keep every System, Experience, host, Platform, and generated surface explicit and
   canonical. Do not use export-star or aliased compatibility re-exports.
9. A non-surface source file exports only declarations it owns. Do not import
   and re-export a symbol, or create an identity type or value alias. Import
   from the semantic owner at each consumer. Direct named re-exports belong
   only in declared Platform, owner, host, or generated entrypoints.
10. Keep qualified mappers synchronous and pure. Put result-dependent signals
    in the owning executor or use case, concrete sinks and process effects in
    hosts, and only construction/injection in topology or generated runtime.
11. Keep code cell-local until source-observed reuse or continuity-bearing
    language justifies a precisely owned system model, capability, contract,
    or platform mechanism. Do not invent ceremonial ports for reusable
    concrete primitives.
12. Register `defineValidatedController` pairs as `validate` then `handle` and
    return Express 5 handler promises directly. When authorization needs route
    scope before body parsing, compose `validators.params`, authorization,
    `validators.body`, and `handle` in that order. Request schemas stay
    synchronous and pure. Preserve non-default location validation responses
    as declarative `invalidRequest` data on the same controller. Do not
    introduce `catchAsync` or another local promise/error boundary.
13. Change topology selection by updating the owning declaration or assembly,
    then regenerate artifacts. Never hand-edit generated catalogs or clients.
14. Register executable proof through an inline literal `proveOperation` call
    in the exact cell directory. Owner-root, imported, or cross-system proof
    never certifies a missing local scenario.
15. Run `pnpm architecture:check`, `pnpm lint:architecture`, and the affected
    System, cell, Experience, host, or Platform gates before treating a structural
    change as complete.

### Dependency Direction

The allowed direction is:

```text
topology -> public system and Experience declarations/assembly, platform/cells
generated runtime -> topology, public owner assembly, platform
generated catalogs/clients -> public owner contracts, platform/cells
hosts -> generated catalogs/runtime and platform
experiences -> public system capabilities/contracts and platform
systems -> own cells/model/schema, peer public contracts, and platform
platform -> platform
```

Do not introduce `apps/`, `modules/`, `packages/`, or `infra/` source roots;
compatibility directories; bare mapper suffixes; generic `common`, `shared`,
`utils`, or `services` buckets; peer-system private imports; or root imports
that bypass a narrower owner, Postgres, codec, or Errors surface.

Hosts remain business-neutral. Systems never import a peer's cells, model,
persistence, or schema. Experiences never import system internals. Pure
decisions never depend on Node, SQL, HTTP, clocks, randomness, logging, or
process effects. Frontends never import server runtime or persistence code.

`platform/postgres` owns the immutable migration ledger, runner, restore
verification, and reusable PostgreSQL mechanisms. Systems own their schema
factories; only topology composes the complete schema.

### Process and Tooling Effects

Environment, arguments, stdin/stdout, files, browser globals, signals, and exit
behavior are host-owned process effects. Owners receive derived data or narrow
capabilities.

Executable tooling follows the same throwable-ownership rule. Tooling that
must run before workspace installation uses the package-owned,
dependency-free `platform/errors/src/tooling-error.mjs` factory. Native
throwables are permitted outside Errors only in deliberate test fault fixtures.

### Bounded Concurrency

Keep every checked-in Turbo entrypoint at `--concurrency=2`. Unit-test paths
also set `VITEST_MAX_WORKERS=2`; database integration stays at one worker.
