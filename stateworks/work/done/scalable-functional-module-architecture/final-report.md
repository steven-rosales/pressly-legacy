# Scalable Functional Module Architecture Final Report

Status: complete locally on 2026-08-03

## Outcome

Pressly now has one traversable, mechanically enforced architecture for the
next phase of growth. Each backend authority has the same internal grammar:

```text
modules/<family>/<authority>/
  src/
    features/<namespace>/<one-application-action>/
    foundations/{language,algorithms,ports,adapters}/
    composition/
    main.ts
    public.ts
```

The repository has nine authorities: Orders, Pricing, Production, Users,
Identity, Authorization, Webhook Ingestion, Control Experience, and Processor
Experience. Their immutable manifests declare 102 use cases in 102 unique
feature leaves. The architecture compiler, ESLint, topology tests, TypeScript,
and documentation all enforce the same vocabulary and dependency direction.

## Dependency and placement system

Unknown protocol data is validated by Contracts, mapped at an edge, and then
handled in module-owned application language. Features are complete actions or
queries. Reused domain language, algorithms, effects, and implementations move
to narrowly named foundations only after actual reuse. Apps compose peer module
public capabilities; modules never import peer modules.

Entities are reserved for owner-controlled identity continuity. Commands,
snapshots, pages, results, proposals, and read views are models. Persistence
records and wire values are representation shapes transformed by qualified
pure mappers. All 80 source mappers passed the qualified-role and purity audit.

Generic design patterns are admitted as typed immutable functional factories
only when repeated semantics earn them. State machines, production rules,
approved algorithms, cookie-CSRF, units of work, and other retained factories
have explicit algebras. No DI container, service locator, generic repository,
base entity hierarchy, universal policy engine, or ceremonial layer was added.

## Authority corrections

- Identity and Authorization are Security authorities and are framework-free.
- Production owns its intrinsic policy/lifecycle language and versioned
  scheduling algorithms. The former top-level Policy and Computation families
  are gone.
- Webhook Ingestion is an Integration authority with granular inbox,
  quarantine, and source-binding applications.
- Control and Processor own cross-domain experience applications. API is a
  process/protocol adapter rather than an application-policy owner.
- Shared clocks, IDs, codecs, hashes, money, transactions, unit-of-work
  construction, HTTP mechanisms, observability, errors, and test doubles have
  explicit package owners.
- Owner bootstrap is a CLI process over Identity's public mechanism, not an
  Identity-owned operational workflow.

## Failures and public boundaries

Expected validation, authentication, permission, not-found, conflict, and
policy outcomes are feature-owned typed `Result` data. Unexpected database,
cryptographic, configuration, corrupt-state, invariant, and programming
failures are normalized `AppError` values. HTTP, CLI, Worker, and browser edges
perform presentation mapping.

Contracts, DB, and Errors now expose explicit subpaths with no package-root
barrels or compatibility indexes. The migration replaced 432 root imports.
Persisted JSON uses Codec's closed JSON algebra and is guarded again on read.
Live Node tooling uses Errors' standalone tooling-failure entry; automated
ownership tests reject all native throwable constructors outside Errors and
intentional fixtures.

## Scale and operability guards

Every checked-in Turbo and Vitest entry point caps concurrency/workers at two,
including CI, Docker builds, browser contracts, and LPMS end-to-end paths.
Database integration remains sequential. This prevents the former
Turbo-tasks-by-Vitest-instances-by-workers multiplication from exhausting WSL.

The normative rules and placement decision trees live in `AGENTS.md`,
`docs/architecture.md`, and `docs/module-architecture.md`. They are backed by
compiler fixtures rather than documentation alone.

## Verification

The final tree passed frozen installation, formatting, architecture checks,
all workspace lint/typecheck/unit gates, a forced cold 28-task build, the full
PostgreSQL integration suite, LPMS end-to-end tests, and 9 Docker-backed
Chromium smoke journeys. The browser environment cleaned up its disposable
containers, networks, volumes, and images; the integration database was
stopped afterward. `git diff --check` passed.

The independent structural audit found no peer-module imports, generic module
buckets, compatibility barrels, obsolete package identities, empty leaves,
ambient effects in pure module roles, or live native throwable construction
outside Errors. Detailed command counts and scoped evidence are recorded in
`evidence.md`.

The Processor build still emits a non-blocking bundle-size warning. The Web
build still emits a Sentry navigation-instrumentation notice. No production
migration, deployment, external write, commit, push, or pull request was
performed.

## Explicitly still open

This architecture work does not fix or relabel the four queued
`lpms-order-control-correctness-hardening` defects:

1. Routing machine-capacity invalidation.
2. Between-stage routing eligibility.
3. Route idempotency under run-first locking and note identity.
4. History cursor PostgreSQL timestamp precision.

That queued work remains the authority for their implementation and proof.
