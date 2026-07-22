# API and Worker Executable-Edge Architecture Evidence

## Baseline — 2026-07-22

Confirmed structural defects:

- API source is split across technical catch-alls (`common`, `routes`,
  `vendors`, and `read-models`) rather than capability ownership.
- API `app.ts` constructs runtime policy, business modules, HTTP middleware,
  public vendor ingress, canonical commands, and Processor-specific views.
- Canonical User and Order command routes are grouped together and named by
  their current Processor caller rather than their application-neutral API
  ownership.
- Worker source mixes generic runtime mechanics under both `common` and `lpms`,
  while vendor handlers and the source-neutral Order outbox projector use
  unrelated top-level taxonomies.
- Worker `index.ts` owns process initialization, module composition, durable-job
  composition, signal handling, polling, failure policy, and teardown.
- API and Worker do not yet have deterministic architecture-zone tests
  equivalent to the business-module and Processor checks.
- Cents reconciliation source is tested but not wired into the Worker runtime;
  runtime logs explicitly state automatic reconciliation is unsupported.

Preserved behavior and authority:

- Users, Orders, Auth, Production, and Webhook Ingestion remain isolated peers.
- Cents HTTP normalization remains in API; normalized observation handling
  remains in Worker.
- Orders writes the fulfillment-demand outbox atomically and Worker projects it
  into Production through the existing source-neutral command.
- Processor Order Control remains an application-owned composed read view.
- Existing public routes, contracts, database schema, durable events, queue
  leases, retries, dead letters, metrics, heartbeat, and shutdown behavior are
  unchanged by design.
- No production, deployment, secret, webhook replay, or external mutation is in
  scope.

Target dependency direction:

```text
API main -> API bootstrap -> API runtime + HTTP capabilities -> module ports
Worker main -> Worker bootstrap -> Worker runtime + durable jobs -> module ports

runtime -X-> HTTP capabilities / jobs / business modules
HTTP capability -X-> peer HTTP capability
Worker job -X-> peer Worker job
module -X-> app
```

Baseline verification before file movement:

- API typecheck passed.
- API test suite passed: 18 files, 131 tests.
- Worker typecheck passed.
- Worker test suite passed: 8 files, 33 tests.
- The first parallel API-test process exited without output; the identical
  command passed when rerun alone, so no baseline product failure was inferred.

## Implementation — 2026-07-22

- API now has a minimal `main.ts`, an explicit `bootstrap/` composition edge,
  capability-owned `http/` slices, and a package-only `runtime/` foundation.
- Canonical User and Order routes live under `http/order-management`; only the
  browser session boundary and composed Order Control query remain under the
  Processor HTTP slice.
- HTTP error observation, route normalization, and production request metrics
  are owned by HTTP middleware. Runtime observation no longer imports Express.
- Worker now has a minimal `main.ts`, explicit `bootstrap/` composition,
  source-neutral `runtime/` mechanics, and two behavior-named durable jobs:
  `process-webhook-inbox` and `project-fulfillment-demand`.
- Cents handlers are private adapters of the webhook-inbox job. The
  source-neutral fulfillment projector is a peer job; neither job imports the
  other.
- The production bootstrap executable and its tests moved from API to CLI. The
  production API image builds the CLI artifact for operator use, and deployment
  documentation and topology smoke paths point to the CLI output.
- Unwired Cents reconciliation source and its tests were removed because the
  runtime explicitly declares automatic reconciliation unsupported.
- Dormant zero-byte security placeholders and unused HTML-sanitizer dependencies
  were removed; current security documentation now describes only active
  controls.
- Architecture tests reject legacy catch-all source, runtime-to-delivery or
  runtime-to-business dependencies, peer HTTP imports, and peer job imports.

## Final verification — 2026-07-22

Passed locally:

- API: typecheck, lint, and 17 files / 126 tests.
- Worker: typecheck, lint, and 7 files / 31 tests.
- CLI: source and test typechecks, lint, and 6 files / 22 tests.
- Refactor build graph: 25 of 25 tasks for API, Worker, CLI, and dependencies.
- Repository typecheck: 49 of 49 tasks.
- Repository lint: 27 of 27 tasks.
- Repository unit/tooling suite: 50 of 50 package tasks and 11 tooling files /
  172 tooling tests.
- Architecture boundaries: 68 tests.
- Final production topology, smoke-contract, four-image deployment, and
  architecture checks: 4 files / 96 tests.
- Prettier check and scoped `git diff --check` after final formatting.

Environment-limited proof:

- The disposable production Docker topology smoke could not start because the
  local Docker CLI hung before returning its context or server information.
  The attempt made no production or external change. The production image
  TypeScript build, CLI artifact path, Dockerfile graph, and all topology
  contract tests passed; only the live container exercise remains unobserved in
  this environment.
