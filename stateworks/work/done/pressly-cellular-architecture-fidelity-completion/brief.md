# Pressly Cellular Architecture Fidelity Completion

## Purpose

Finish `docs/plan/refactoring-cell.md` and
`docs/plan/refactor-code-quality.md` literally after the prior migration
incorrectly certified a compromise architecture.

## Required Final Shape

The final source architecture contains only these ownership roots:

```text
hosts/
systems/
experiences/
platform/
topology/
generated/
verification/
deploy/
tooling/
docs/
stateworks/
```

Root configuration and repository metadata may remain as files. `apps/`,
`packages/`, `modules/`, central business contracts/schemas, compatibility
directories, and retired architecture tooling must be absent.

## Exact Corrections

- Move every generic mechanism named by the target plan into `platform/` and
  eliminate `packages/`.
- Move process entrypoints and frontend behavior out of `apps/` into generic
  hosts, Experiences, topology, generated artifacts, and deployment tooling;
  preserve the five image/service identities without retaining an app source
  architecture.
- Make one independently observable operation resolve to one unique cell path.
- Keep operation-specific contracts, decisions, executors, persistence, and
  tests in the owning cell when applicable.
- Give every applicable write operation real PostgreSQL success, expected
  failure, replay, divergent-key, optimistic-concurrency, and rollback proof.
- Replace reference-existence DoD accounting with scenario- and behavior-aware
  evidence that cannot credit an unrelated owner-level test.
- Delete all superseded source, aliases, manifests, symlinks, generated
  residue, ignored stale outputs, and obsolete guidance only after replacement
  gates pass.

## Non-Negotiable Preservation

- Public protocols and browser-visible behavior remain unchanged unless a
  separately documented safety correction already exists.
- One shared PostgreSQL database remains. H1 supersedes the earlier 40-file
  compatibility-history constraint: the replacement uses a clean immutable
  owner-schema epoch, preserves the live public Pricing catalog exactly, and
  re-proves journal order, restore behavior, constraints, and role separation.
- Five production image/service names, ports, health checks, Caddy routing,
  migration-first startup, release switching, rollback, and process lifecycle
  remain behaviorally identical.
- Existing unrelated work and the independent LPMS and Control lifecycle
  states remain untouched.

## Completion Standard

Green builds and broad tests are necessary but insufficient. Completion
requires an exact tree audit, one-operation/one-cell audit, operation-local
test matrix, semantic DoD proof, complete residual deletion, full static and
PostgreSQL matrices, browser smoke/full E2E, restore proof, and five-image
production smoke on frozen final source.
