# Symbol Ownership And Relay Removal

## Purpose

Make every imported symbol lead directly to its semantic owner. Internal
feature, foundation, adapter, mapper, use-case, and composition files must not
re-export an imported value or rename an imported type without adding real
meaning, behavior, or an invariant.

## Outcomes

- Module-internal consumers import from the file that declares the symbol.
- Ceremonial feature failure aliases and other identity aliases are removed.
- Contract mappers translate values; they do not act as schema barrels.
- Use cases expose their constructor only; ports and models remain directly
  discoverable at their owning files.
- Explicit module, package, and app entrypoints may still curate exports,
  because publishing a boundary is their declared function.
- Architecture lint rejects future internal symbol relays across modules,
  apps, and packages.

## Non-Goals

- No product, domain, persistence, HTTP, or serialized-contract behavior
  change.
- No ban on local import aliases used to resolve naming conflicts.
- No removal of deliberate module, package, app, or protocol surfaces.
- No compatibility barrel is introduced to ease the migration.

## Existing Worktree Boundary

This work is layered on the uncommitted module-architecture and HTTP-boundary
refactor already present on `agent/module-architecture-refactor`. The existing
MFA edits and `docs/lectures/repo-traversing.md` remain user-owned and must not
be overwritten or folded into unrelated semantic changes.
