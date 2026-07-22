# API and Worker Executable-Edge Architecture

## Status

Completed behavior-preserving executable-edge refactor on 2026-07-22.
The work reshapes `apps/api` and `apps/worker` so their directory ownership
matches their runtime functions without changing business policy, persistence,
public HTTP contracts, webhook semantics, or durable job behavior.

## Task Shape

This is a bounded application-shell refactor. Business rules already live in
isolated modules, so API and Worker do not need duplicate domain, application,
and infrastructure layers. They need explicit composition roots, closed runtime
foundations, and capability-owned HTTP surfaces or durable jobs.

## Target Shape

```text
API:    main -> bootstrap -> runtime + HTTP capabilities -> module public ports
Worker: main -> bootstrap -> runtime + durable jobs      -> module public ports
```

Canonical Orders, Users, Production, and Webhook Ingestion HTTP surfaces remain
application-neutral. Only the browser session adapter and composed Order Control
view belong to the Processor-specific HTTP surface.

## Boundaries

- Preserve Users, Orders, Auth, Production, and Webhook Ingestion as isolated
  peer modules.
- Preserve exact source identity, webhook idempotency, monotonic revisions,
  atomic Order outbox delivery, release-gated Production admission, and
  operator-confirmed floor truth.
- Preserve every route path, request and response contract, authentication
  outcome, retry limit, lease rule, metric name, heartbeat, and shutdown
  behavior.
- Keep API and Worker as the only cross-module composition roots.
- Do not introduce a DI container, service locator, generic queue framework,
  new package, database migration, endpoint, event type, or deployment change.
- Preserve all unrelated dirty-worktree changes.
- Keep the queued LPMS correctness hardening work out of scope.

## Done Means

- API source is zoned into bootstrap, runtime, and capability-owned HTTP slices.
- Worker source is zoned into bootstrap, runtime, and explicit durable jobs.
- Canonical Orders and Users APIs are not owned by Processor.
- The production bootstrap operator command lives in the CLI application.
- Unsupported unwired reconciliation code is absent from the Worker runtime.
- Automated architecture checks prevent the old catch-all shape from returning.
- Focused tests, full repository lint, typecheck, test, application builds, and
  deployment-topology contract checks pass locally.
