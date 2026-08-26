# Traversing Pressly

Use the operation ID as the join key. Do not start with a repository-wide search
for generic names such as `service`, `handler`, or `manager`.

## Start at a process entrypoint

```text
HTTP      hosts/http/main.ts
Jobs      hosts/jobs/src/main.ts
CLI       hosts/cli/src/main.ts
Control   hosts/browser/control/src/main.tsx
Customer  hosts/browser/customer/src/app/layout.tsx
Processor hosts/browser/processor/src/main.tsx
```

Follow the host into the matching topology composition root:

```text
HTTP      topology/http.ts
Jobs      topology/jobs.ts
CLI       topology/cli.ts
Database  topology/database.ts
Control   topology/browser/control.ts
Customer  topology/browser/customer.ts
Processor topology/browser/processor.ts
```

## Entry-to-leaf paths

### HTTP command

```text
hosts/http/main.ts
  -> topology/http.ts
  -> topology/runtime/http/catalog.ts
  -> topology/runtime/http/bootstrap/target-owners.ts
  -> systems/production/src/cells/floor/advance-stage/http.ts
  -> systems/production/src/cells/floor/advance-stage/execute.ts
  -> systems/production/src/cells/floor/advance-stage/decide.ts
  -> systems/production/src/cells/floor/advance-stage/postgres.ts
```

### Jobs

```text
hosts/jobs/src/main.ts
  -> topology/jobs.ts
  -> topology/runtime/jobs/catalog.ts
  -> topology/runtime/jobs/public.ts
  -> systems/ingress/src/cells/processing/process-inbound-event/job.ts
  -> systems/ingress/src/cells/processing/process-inbound-event/execute.ts
  -> systems/ingress/src/cells/processing/process-inbound-event/postgres.ts
```

### Processor browser workflow

```text
hosts/browser/processor/src/main.tsx
  -> topology/browser/processor.ts
  -> topology/browser-operations.ts
  -> experiences/processor/src/browser/processor-browser-experience.tsx
  -> experiences/processor/src/features/production-board
  -> hosts/browser/processor/src/runtime/fetch-request.adapter.ts
  -> production HTTP operation contract
```

### Customer pricing page

```text
hosts/browser/customer/src/app/(marketing)/services-pricing/page.tsx
  -> topology/browser/customer.ts
  -> experiences/customer/src/web/features/pricing
  -> hosts/browser/customer/src/transport/fetch-request-client.ts
  -> systems/pricing/src/cells/catalog/load-pricing-catalog
```

### CLI bootstrap

```text
hosts/cli/src/main.ts
  -> topology/cli.ts
  -> topology/runtime/cli/catalog.ts
  -> topology/runtime/cli/composition.ts
  -> systems/access/src/cells/bootstrap/bootstrap-owner
  -> systems/access/src/cells/bootstrap/bootstrap-owner/execute.ts
```

## Search commands

```bash
rg -n "production\.advance-stage\.v1" systems experiences topology verification
rg -n "operationId:.*production\.advance-stage" systems/production
rg -n "advanceStage|advance-stage" topology hosts verification
pnpm exec depcruise --config dependency-cruiser.config.mjs hosts systems experiences platform topology verification
```

The declaration's `id` tells you the owner and version. Its `surfaces` tell you
whether to follow HTTP, jobs, CLI, or event-stream code. Its contract tells you
the wire shape. Its executor tells you effect order. Its decision and
PostgreSQL adapter tell you the business rule and durable state change.

## What each tool proves

- TypeScript: names and types line up.
- ESLint: local language and ownership rules hold.
- dependency-cruiser: imports point in the allowed direction.
- unit tests: pure decisions and orchestration branches.
- PostgreSQL tests: transactions, locks, idempotency, and durable state.
- flow/browser tests: assembled cross-owner behavior.

Static architecture green is not proof that a live database, queue, or browser
flow is healthy.
