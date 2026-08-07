# Foundation Cohesion And HTTP Boundary Hardening

## Purpose

Make Pressly's feature grammar express actual application ownership instead of
allowing table-oriented foundation stores or multi-operation use-case facades.
At the HTTP edge, remove the obsolete asynchronous-handler wrapper and converge
request parsing, typed input carriage, execution, and unexpected-error
propagation on one explicit Express 5 boundary.

## Outcomes

- A persistence operation used by one feature is owned by that feature.
- A foundation exists only for proven reuse or explicit module-owned domain
  continuity.
- Architecture tooling reports and rejects unearned foundation promotion.
- One feature leaf exposes one independently named application operation.
- Express handlers return their promises directly to Express 5.
- Each configured request location is parsed synchronously once, remains typed
  across intervening middleware, and is checked for mutation before the
  controller executes.
- Expected application failures remain typed `Result` data; unexpected errors
  reach the final process error middleware exactly once.

## Non-Goals

- No product, pricing, identity, workforce, webhook, or Production behavior
  change.
- No generic repository, service locator, endpoint DSL, class hierarchy, or
  line-count gate.
- No implementation of queued distributed authentication.
- No weakening of transaction, idempotency, audit, or authorization boundaries.

## Existing Worktree Boundary

The existing MFA signature-cleanup edits and
`docs/lectures/repo-traversing.md` are user-owned. In-scope Identity work must
preserve and compose with the MFA edits. The lecture file remains untouched.
