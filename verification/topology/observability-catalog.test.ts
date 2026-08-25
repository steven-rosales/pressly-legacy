import { describe, expect, it } from 'vitest';
import {
  metricCatalog,
  observabilityJobsById,
  observabilityOperationIdByName,
  observabilityOperationIdByJobLabel,
  observabilityOperationIdForJobLabel,
  observabilityOperationIds,
  observabilityOperationNames,
} from '../../generated/observability-catalog.ts';
import { genericMetricDescriptors } from '../../platform/observability/src/metric-catalog.ts';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import {
  compileTopology,
  resolveObservabilityCatalog,
  type CompiledTopology,
} from '../../topology/src/public.ts';

const compiledPresslyTopology = (): CompiledTopology => {
  const compilation = compileTopology(presslyTopology);
  expect(compilation.kind).toBe('compiled');
  if (compilation.kind !== 'compiled')
    throw new Error('The checked Pressly topology must compile in this test.');
  return compilation.topology;
};

describe('generated observability catalog', () => {
  it('derives every unique operation id, dashboard name, and job from topology', () => {
    const topology = compiledPresslyTopology();

    expect(observabilityOperationIds).toHaveLength(topology.cells.length);
    expect(new Set(observabilityOperationIds).size).toBe(
      observabilityOperationIds.length,
    );
    expect(new Set(observabilityOperationNames).size).toBe(
      observabilityOperationNames.length,
    );
    expect(Object.keys(observabilityOperationIdByName)).toHaveLength(
      topology.cells.length,
    );
    expect(Object.keys(observabilityJobsById).sort()).toEqual(
      topology.jobs.map((job) => job.surface.id).sort(),
    );
    expect(observabilityOperationIdByJobLabel).toEqual(
      Object.fromEntries(
        topology.jobs.flatMap((job) =>
          job.surface.queue === null
            ? []
            : [[job.surface.queue, job.operationId]],
        ),
      ),
    );
    for (const job of topology.jobs)
      if (job.surface.queue !== null)
        expect(observabilityOperationIdForJobLabel(job.surface.queue)).toBe(
          job.operationId,
        );
  });

  it('composes neutral mechanisms with Production and Ingress owner metrics', () => {
    expect(metricCatalog['production.plan_supersessions'].instrument).toBe(
      'counter',
    );
    expect(metricCatalog['worker.inbox_receipts'].instrument).toBe('counter');
    expect(metricCatalog['db.transactions'].attributeValues.operation).toEqual(
      observabilityOperationNames,
    );
    expect(
      metricCatalog['db.transactions'].attributeValues.operation_id,
    ).toEqual(observabilityOperationIds);
  });

  it('rejects metric-name collisions instead of choosing an implicit owner', () => {
    const topology = compiledPresslyTopology();
    const duplicate = Object.freeze([
      {
        name: 'db.transactions',
        instrument: 'counter',
        unit: 'count',
        allowedAttributes: ['runtime'],
      },
    ] as const);

    expect(
      resolveObservabilityCatalog(topology, [
        genericMetricDescriptors,
        duplicate,
      ]),
    ).toMatchObject({
      kind: 'invalid',
      violations: [
        {
          code: 'duplicate_metric_name',
          subject: 'db.transactions',
        },
      ],
    });
  });

  it('rejects duplicate dashboard operation names', () => {
    const topology = compiledPresslyTopology();
    const [first, second, ...remaining] = topology.cells;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    const duplicateNameTopology: CompiledTopology = Object.freeze({
      ...topology,
      cells: Object.freeze([
        first,
        Object.freeze({
          ...second,
          manifest: Object.freeze({
            ...second.manifest,
            observability: first.manifest.observability,
          }),
        }),
        ...remaining,
      ]),
    });

    expect(resolveObservabilityCatalog(duplicateNameTopology)).toMatchObject({
      kind: 'invalid',
      violations: [
        expect.objectContaining({ code: 'duplicate_observability_name' }),
      ],
    });
  });

  it('rejects ambiguous job labels before generating metric attribution', () => {
    const topology = compiledPresslyTopology();
    const [first, second, ...remaining] = topology.jobs;
    expect(first?.surface.queue).not.toBeNull();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    const duplicateLabelTopology: CompiledTopology = Object.freeze({
      ...topology,
      jobs: Object.freeze([
        first,
        Object.freeze({
          ...second,
          surface: Object.freeze({
            ...second.surface,
            queue: first.surface.queue,
          }),
        }),
        ...remaining,
      ]),
    });

    expect(resolveObservabilityCatalog(duplicateLabelTopology)).toMatchObject({
      kind: 'invalid',
      violations: [
        expect.objectContaining({
          code: 'duplicate_job_label',
          subject: first.surface.queue,
        }),
      ],
    });
  });
});
