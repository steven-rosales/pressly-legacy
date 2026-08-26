# Observability

Observability is a bounded interpretation of runtime signals. The generic HTTP
and Worker hosts own Sentry SDK effects; topology supplies the finite catalog
that maps operation names and job labels to stable IDs.

## Composition

```text
owner cell declarations
  -> topology/observability.ts
  -> presslyObservabilityCatalog
  -> hosts/http/src/runtime/observability/sentry.ts
  -> hosts/jobs/src/runtime/observability/worker-observability.ts
  -> Sentry
```

`topology/observability.ts` is handwritten. It combines the generic metric
descriptors with the Ingress and Production descriptors, adds the selected
operation IDs, and rejects metric-name collisions at startup.

The public runtime shape is:

```ts
type RuntimeObservabilityCatalog = Readonly<{
  metrics: Readonly<Record<string, CatalogMetricDefinition>>;
  operationIdFor: (operation: string) => string | undefined;
  operationIdForJobLabel: (job: string) => string | undefined;
}>;
```

The host receives this catalog as a dependency. It does not import an owner
manifest, guess operation IDs, or own business metric vocabulary.

## Traversal

For an API signal:

```text
hosts/http/src/runtime/process.ts
  -> hosts/http/src/runtime/observability/sentry.ts
  -> topology/observability.ts
  -> operation declaration in the owning cell
```

For a Worker signal:

```text
hosts/jobs/src/process-main.ts
  -> hosts/jobs/src/runtime/observability/worker-observability.ts
  -> topology/observability.ts
  -> topology/runtime/jobs/catalog.ts
  -> owner job surface
```

Search the operation's stable ID first. The observability name usually uses the
underscore form (for example `production.advance_stage`) while the operation
ID is versioned (for example `production.advance-stage.v1`). Job labels such
as `order_outbox` resolve through the same catalog.

## Boundaries

Hosts may record bounded runtime, method, route, status, outcome, operation,
and job labels. They must not export customer, order, event, worker, or other
unbounded business identifiers as metric attributes.

A metric name or attribute value outside the finite catalog is rejected or
dropped according to the owning sink's contract. Telemetry must not replace the
application failure or cause a retry.

## Verification

The catalog's identity and collision invariants are tested in
`verification/topology/topology.test.ts`. Host sink tests inject the same
catalog and verify metric filtering, operation mapping, and failure isolation.

Run:

```bash
pnpm --filter @pressly/observability test
pnpm --filter @pressly/http-host test
pnpm --filter @pressly/jobs-host test
pnpm --filter @pressly/topology-verification test
```
