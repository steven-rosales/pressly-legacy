# Evidence

## Work

- Work ID: `symbol-ownership-relay-removal`
- Network:
  `stateworks/work/done/symbol-ownership-relay-removal/network.yaml`
- Started: `2026-08-05`
- Finished: `2026-08-05`

## T0 - Baseline

- The module AST inventory found 228 non-root relay symbols across 111 files.
  The dominant classes were 96 contract-schema re-exports in Production
  mappers, 46 port/model type re-exports in Production use cases, 34
  transparent failure aliases, and 41 composition relays.
- Five composition mini-barrels alone relayed 85 symbols across Orders,
  Production, Users, Processor Experience, and Authorization.
- The app/package inventory found 16 identity type aliases and 20 identity
  value aliases, plus session, model, view, worker, clock, and unit-of-work
  relays.
- The retained exceptions have actual boundary functions: module `main.ts`
  and `public.ts`, package targets declared by `package.json#exports`, declared
  app entrypoints, Next.js metadata bindings, and the aggregate Drizzle schema
  consumed by the database runtime and migration tooling.
- The pre-existing dirty architecture/HTTP refactor, MFA work, and
  `docs/lectures/repo-traversing.md` were preserved.

## T1 - Executable Ownership Rule

- `architecture/symbol-ownership` now rejects internal direct re-exports,
  import-then-export relays, identity type aliases, identity value aliases,
  and empty interfaces that only rename one imported type.
- The rule applies to module, app, and package source. Package surfaces are
  derived from `package.json#exports`; exceptional app and protocol surfaces
  are immutable `symbolSurfaces` in the repository architecture definition.
- Module dependency compilation now permits `public.ts` to publish canonical
  pure semantic owners directly. `main.ts` remains construction-owned.
- ESLint fixtures cover each rejected relay form, locally owned transformed
  shapes, module/package/app surfaces, and the required Next.js metadata
  binding.

## T2 - Owner-Direct Consumers

- Production's ceremonial feature failure aliases, contract-schema relays,
  use-case port/model relays, and composition relays were removed. Controllers
  now parse Contracts schemas directly; routes and tests import declaration
  owners.
- Orders, Users, Authorization, Identity, Processor Experience, and Webhook
  Ingestion no longer route canonical names through composition, factories,
  models, or use cases that do not own them.
- API, CLI, Control, Processor, Web, Worker, Time, and DB consumers now import
  session, contract, view, clock, retry, time, and unit-of-work declarations
  from their owners. Relay-only customer, order, team, and clock files were
  deleted.
- Explicit UI, CLI, content, i18n, module, package, and DB-schema entrypoints
  remain because curation or protocol composition is their declared job.

## T3 - Published Rule

- `AGENTS.md` requires non-surface files to export only owned declarations.
- `docs/architecture.md` defines owner-direct dependency direction and the
  formal-surface exception.
- `docs/module-architecture.md` includes forbidden code forms and adds symbol
  provenance to the review checklist.

## V1 - Verification

All commands used bounded repository concurrency.

- `pnpm format:check` - passed.
- `pnpm lint` - passed, including `architecture:check`, 28 Turbo lint tasks,
  browser lint, and architecture lint.
- `pnpm typecheck` - passed: 50 Turbo tasks plus browser and architecture
  typechecks.
- `pnpm clean && pnpm build` - passed: 26 clean tasks and 28 build tasks. This
  regenerated the stale Production declaration artifacts.
- `pnpm test` - passed: 51 Turbo tasks and 18 tooling files / 224 tooling
  tests. The affected workspace suites include Production 89 files / 423
  tests, Identity 41 / 148, API 31 / 208, Processor 40 / 275, Control 20 / 80,
  and the remaining module, app, and package suites.
- `pnpm exec vitest run tooling/test/architecture-compiler-v2.test.mjs tooling/test/architecture-eslint-v2.test.mjs --maxWorkers=2`
  - passed: 2 files / 37 tests.
- `rg -n "makeReviewProductionOrderBacklogRoutes" modules/business/production/dist`
  - no match after the clean build.
- `git diff --check` - passed.

The first full typecheck exposed an AST helper union mismatch; the helper was
corrected and the complete typecheck passed. The first full test run exposed
four legacy tooling fixtures that treated identity relays as allowed examples;
the fixtures were rewritten to declare real composite shapes and the complete
test command passed.
