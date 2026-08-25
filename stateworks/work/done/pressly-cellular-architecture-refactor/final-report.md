# Pressly Cellular Architecture Refactor Final Report

Status: complete locally on 2026-08-23; not deployed.

## Outcome

Pressly now has one cellular TypeScript modular-monolith architecture. Six
systems own durable business truth, 181 cells own independently observable
operations, three Experiences own cross-system workflows, topology selects the
deployment graph, generated artifacts record that selection, generic hosts
execute it, and apps own process composition and presentation.

The legacy modules, central business Contracts source, retired Auth package,
central business schema source, and custom architecture compiler are absent.
Dependency Cruiser, ESLint, TypeScript, topology tests, generated freshness,
owner-local tests, and permanent conformance suites enforce the final grammar.

## Completed Architecture

- Access owns identity, sessions, workforce, authorization policy, business
  scope, and production-location scope.
- Customers, Ingress, Orders, Pricing, and Production each own their durable
  language, cells, contracts, schema factory, and persistence.
- Control, Customer, and Processor Experiences own user-facing cross-system
  workflows without becoming durable-state authorities.
- `platform/` and focused `packages/` contain business-neutral mechanisms.
  `packages/db` retains only the immutable migration ledger, runner, restore
  verification, and seeds.
- Topology alone composes the six owner schema factories. The deployed schema
  remains one PostgreSQL database with 59 tables and eight enums.
- Generated artifacts contain 181 operations, 101 HTTP surfaces over 100
  unique HTTP IDs, 70 profiles, 12 CLI commands, two jobs, one event stream,
  and the architecture explain map.

Every operation is covered by the permanent 15-obligation definition-of-done
index: 2,715 outcomes, with 1,998 directly met, 717 semantically not
applicable, and zero unmet. Explain output resolves operations to their cell,
contract, decision, executor, persistence, state, protocol, event, and test
paths.

## Correctness and Safety

The migration preserved single-writer authority, transaction boundaries,
locks, optimistic versions, idempotency, rollback, inbox/outbox delivery,
leases, retries, dead letters, work events, live revisions, authentication,
authorization, cookies, CSRF, and browser-visible workflows.

One later safety correction is explicit: schema-invalid persisted
idempotency-result objects now fail closed as typed
`production_idempotency_conflict` instead of replaying untrusted JSON. The
focused corruption fixtures retain their no-mutation, event, revision, and
evidence assertions.

Live non-test source has zero non-null assertions. The only two nested
`as unknown as` coercions are reviewed generic Kernel cases with exact markers
and permanent inventory. SQL is isolated in owner-local persistence files;
system cell declarations contain no direct query-mechanism imports.

## Verification

The final implementation overlay
`38e9d0c1865bcf9f990af23ba8703ddd405641edd5d60e8e3c95db4315e9329a`
passed:

- offline frozen install across 54 workspaces;
- 50/50 clean tasks, 50/50 builds, and 83/83 typechecks plus browser;
- 3,059 modules and 12,109 dependencies with zero graph violations;
- topology and topology-verification suites at 10 files / 92 tests each;
- 12 architecture-rule tests and generated freshness;
- 52/52 lint tasks plus browser and architecture lint;
- 84/84 Turbo unit tasks and 19 tooling files / 292 tests;
- formatting, diff hygiene, architecture explain, Stateworks, memory,
  retired-root, symlink, and living-document checks;
- browser smoke 10/10 and full E2E 11/11, including the Processor production,
  stale-refresh, and native event-stream reconnect journey;
- encrypted restore, `39 -> 40` upgrade, abort/resume, and kill-fence proof;
  and
- all five production images, clean bootstrap, API and Worker restart,
  four-stage completion, release-B switch, release-A rollback, and durable
  board recovery.

The final PostgreSQL overlay
`4c4cba19391c954e4db6e3e3ccfc5af59ea8c34be4bd1494e60a7f72e9b3c79e`
passed 19 commands, 108 files, and 897 tests at one worker. It verified 40
applied migrations, 59 tables, eight enums, runtime/migration role separation,
and forced absence of all 22 observed test databases and connections.

The immutable migration identities remain:

```text
journal SHA-256: 18421b8899eba1d88a9fad35c73435bcb6a7bfeb3f43b748b1d04d0d150c3dc3
ordered tree SHA-256: 4fc34cdebe6899dc9a8d9ac5dabc4ba508657400f68291d474bd4431076e7c53
```

Full evidence, including artifact hashes and requirement-by-requirement
status, is in [the evidence ledger](./evidence.md).

## Limits and Independent Work

This proves the current repository locally. It does not prove a production
deployment, compatibility between two historical binaries, live Cents or
other vendor acceptance, production capacity, or a human floor pilot. The
release switch used two synthetic tags of the same current-tree build.

LPMS remains independently blocked at its H1 human gate. The Control workforce
work remains active. Their task statuses and historical evidence were not
advanced by this refactor.
