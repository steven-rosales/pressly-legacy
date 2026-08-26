# Worker host

The Worker executes two explicitly selected jobs:

1. Ingress claims and processes durable external events.
2. Production applies Orders fulfillment-demand events.

```text
hosts/jobs/src/main.ts
  -> topology/jobs.ts
  -> topology/runtime/jobs/catalog.ts
  -> topology/runtime/jobs/public.ts
  -> owner job surface
  -> owner executor and PostgreSQL adapter
```

The generic jobs host owns polling, leases, heartbeat, retry timing,
cancellation, observation, and shutdown. The topology catalog owns the selected
job registrations. Neither layer owns Ingress, Orders, or Production policy.

Ingress owns receipts, claims, leases, retries, dead letters, and source
bindings. Orders owns candidates, canonical Orders, fulfillments, and its
transactional outbox. Production owns source-neutral demand and floor truth.

## Run

```bash
pnpm --filter @pressly/jobs-host dev
```

Production startup still fails closed unless the required jobs and observability
configuration is present. The Worker exposes no HTTP route or host port.

## Verify

```bash
pnpm --filter @pressly/jobs-host test
pnpm --filter @pressly/jobs-host typecheck
pnpm --filter @pressly/jobs-host lint
pnpm --filter @pressly/jobs-verification test
pnpm --filter @pressly/flow-verification test:postgres
```

See [docs/observability.md](../../docs/observability.md) for the catalog and
bounded signal rules.
