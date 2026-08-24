# Pressly Cellular Architecture Refactor

## Purpose

Replace Pressly's current app/module/package placement system with the cellular
modular-monolith architecture defined by:

- `docs/plan/refactoring-cell.md`; and
- `docs/plan/refactor-code-quality.md`.

The migration changes source ownership, dependency expression, composition,
and test ownership without changing Pressly's product behavior, public
protocols, durable state semantics, or five-image deployment contract.

## Target Shape

```text
systems own durable truth
cells own independently observable behavior
experiences own cross-system user workflows
hosts interpret protocols and own process lifecycle
platform provides business-neutral mechanisms
topology selects deployment composition
generated contains deterministic static catalogs and clients
```

The canonical directory name is `experiences/` (plural). The target includes
one `topology/` authority and no duplicate top-level `tooling/` concept.

## Ownership Decisions

- `systems/access` owns credentials and authorization policy plus canonical
  business-account and location identity used for tenancy and access scope.
- `systems/customers` replaces the overloaded Users customer authority.
- `systems/orders`, `systems/pricing`, `systems/production`, and
  `systems/ingress` retain their existing durable business authorities.
- Credential mechanisms remain under `platform/auth`; Pressly roles,
  capabilities, workforce membership, business scope, and location scope do
  not.
- General Result, identifier, state-machine, and unit-of-work primitives remain
  under `platform/kernel`; `platform/cells` owns only cell declaration and
  catalog primitives.
- Each system owns its current schema source and forward database meaning. A
  single ordered Drizzle migration ledger and runner remains authoritative for
  the shared PostgreSQL database throughout the refactor.
- Generated catalogs are deterministic, checked artifacts. They may statically
  import public assembled cells selected by topology; generic hosts import only
  generated catalogs and platform mechanisms.

## Pilot

`production.advance-stage.v1` is the first migrated write operation. The pilot
preserves the two existing `/start` and `/complete` routes, current
`production:stage` authorization, request limits, aggregate lock ordering,
optimistic versions, exact work-event idempotency envelope, work-event/live
revision behavior, and Processor refresh semantics. It does not introduce new
outbox events, a location mutex, a new route, or a new product capability.

The route's authorization-before-body-validation requirement is corrected and
characterized as its own boundary step before the behavior baseline is frozen.

## Completion Boundary

This work is complete only when the target directories are authoritative,
every runtime and browser slice has moved, central Contracts/DB business source
authority is gone, legacy modules/apps architecture and custom compiler are
deleted, deployment topology remains equivalent, and the complete verification
matrix passes. Local repository completion does not claim a production deploy,
live-vendor proof, or completion of the separate active LPMS and Control work.

## Excluded Existing Work

The pre-existing `.gitignore` edit and untracked `.agents/skills/refactor/`,
`docs/agents/08/`, and plan documents are user-owned inputs. They are preserved
and are not rewritten by this work unless a later task explicitly names them.
