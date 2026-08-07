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
3. Keep module code in the universal `features`, `foundations`, and
   `composition` grammar declared by that module's `module.architecture.ts`.
4. Keep serialized boundary values in explicit `@pressly/contracts/*`
   subpaths; keep application models, entities, policies, failures, and ports
   inside their owning module.
5. Return expected application failures as typed data. Construct unexpected
   throwable failures only through explicit `@pressly/errors/*` subpaths.
6. Keep one `*.usecase.ts` per feature leaf. Split independently named
   operations into sibling verb-object features and connect them in
   composition through narrow ports, never sibling imports.
7. Keep module `main.ts` and `public.ts` exports explicit and canonical. Do not
   use export-star or aliased compatibility re-exports.
8. A non-surface source file exports only declarations it owns. Do not import
   and re-export a symbol, or create an identity type or value alias. Import
   from the semantic owner at each consumer. Direct named re-exports belong
   only in declared module, package, or app entrypoints.
9. Keep qualified mappers synchronous and pure. Put result-dependent signals
   in the owning use case, concrete sinks and process effects in apps, and only
   construction/injection in composition.
10. Run `pnpm architecture:check`, `pnpm lint:architecture`, and the affected
    module gates before treating a structural change as complete.
11. Keep dependencies feature-owned until source-observed imports prove reuse
    by at least two leaves or the manifest explicitly declares
    continuity-bearing domain language. The manifest is an exact allowlist for
    those observed edges. When a shared adapter implements a genuine shared
    port, declare that exact relationship and provide real type conformance;
    do not invent ceremonial ports for reusable concrete primitives.
12. Register `defineValidatedController` pairs as `validate` then `handle` and
    return Express 5 handler promises directly. When authorization needs route
    scope before body parsing, compose `validators.params`, authorization,
    `validators.body`, and `handle` in that order. Request schemas stay
    synchronous and pure. Preserve non-default location validation responses
    as declarative `invalidRequest` data on the same controller. Do not
    introduce `catchAsync` or another local promise/error boundary.

Do not introduce compatibility directories, bare mapper suffixes, generic
`common` or `shared` buckets, sibling-module imports, or package-root imports
from Contracts, DB, or Errors to bypass the placement system. Environment,
arguments, stdin/stdout, signals, and exit behavior are app-owned process
effects; modules receive derived data or narrow capabilities.

Executable tooling follows the same throwable-ownership rule. Tooling that
must run before workspace installation uses the package-owned,
dependency-free `packages/errors/src/tooling-error.mjs` factory. Native
throwables are permitted outside Errors only in deliberate test fault fixtures.

Keep every checked-in Turbo entrypoint at `--concurrency=2`. Unit-test paths
also set `VITEST_MAX_WORKERS=2`; database integration stays at one worker.
