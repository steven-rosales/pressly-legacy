# Pressly Documentation

Use this page to find the current source of truth before changing or operating
the system.

## Authority By Question

Different sources own different kinds of truth:

1. **What the current checkout implements** — code, runtime contracts, database
   schema, and migrations.
2. **What the domain must continue to mean** — Stateworks memory and its
   source-backed decisions and invariants.
3. **What work is active or blocked** — active Stateworks state, evidence, and
   human gates.
4. **How to understand or operate the system** — living architecture,
   operations, security, domain, and runbook documentation.
5. **What was true at an earlier checkpoint** — completed work, plans, and
   agent artifacts.

If implementation and durable memory disagree, treat that as drift to
reconcile—not permission to silently choose one and erase the other.

Never edit a generated Stateworks `context-pack.md` directly. Apply a memory
delta, then regenerate it with the Stateworks tooling.

## Living References

| Need                                              | Read                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Repository boundaries and dependency direction    | [Architecture](./architecture.md)                             |
| LPMS domain model and scheduling concepts         | [LPMS model](./plan/lpms.md)                                  |
| CI, Docker, deployment, and recovery              | [Devops](./devops.md)                                         |
| Signals, Sentry, alerts, and incident correlation | [Observability](./observability.md)                           |
| Database release safety                           | [Production migrations](./ops/production-migrations.md)       |
| Application security controls                     | [Application controls](./security/application-controls.md)    |
| Authentication and authorization                  | [Authentication and authorization](./security/authz-authn.md) |
| Test commands and test boundaries                 | [Test guide](./test-guide.md)                                 |
| Processor visual and interaction rules            | [Processor design](../apps/processor/DESIGN.md)               |

`docs/plan/lpms.md` is the exception inside `docs/plan`: it remains a living,
rich modeling reference because Stateworks decisions and historical evidence
link to that exact path. Code and schema still win when implementation details
differ.

## Runbooks

- [Local LPMS production-run simulation](./runbooks/lpms-local-production-run.md)
- [Cents webhook local proof](./runbooks/cents-webhook.md)

Runbooks are operational procedures. Keep prerequisites, safety boundaries,
expected results, and recovery steps beside the commands they govern.

## Historical Material

- [`docs/plan`](./plan/README.md) contains planning records and the living LPMS
  model exception.
- [`docs/agents`](./agents/README.md) contains non-authoritative screenshots and
  agent artifacts.
- [`docs/requirements.md`](./requirements.md) records the historical website-only
  v0 scope.
- `stateworks/work/done` is immutable historical evidence. Do not rewrite it to
  match later implementation.

## Stateworks

Use these paths for durable domain context and current delivery status:

```text
stateworks/memory/domains/<domain>/memory.yaml       durable decisions
stateworks/memory/domains/<domain>/context-pack.md   generated context
stateworks/work/active/<work>/state.yaml             current task state
stateworks/work/active/<work>/human-actions.md       current human gates
stateworks/work/active/<work>/evidence.md             accumulated proof
stateworks/work/done/<work>/                          historical completion record
```

## Maintenance Rule

Update a living document in the same change that makes its current statement
false. Preserve historical plans and evidence; add a status banner or pointer
instead of rewriting history.
