import type { CellSurfaceManifest } from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  composeMetricCatalog,
  genericMetricDescriptors,
  type CatalogMetricDescriptor,
  type RuntimeObservabilityCatalog,
} from '@pressly/observability';
import { ingressMetricDescriptors } from '@pressly/ingress-system/observability/metrics';
import { productionMetricDescriptors } from '@pressly/production-system/observability/metrics';
import { presslyTopology } from './pressly.topology.js';

const runtimeValues = Object.freeze([
  'api',
  'worker',
  'web',
  'processor',
  'control',
] as const);

const transactionMetrics = new Set([
  'db.transactions',
  'db.transaction_duration_seconds',
]);

const selectedCells = Object.freeze(
  [...presslyTopology.systems, ...presslyTopology.experiences].flatMap(
    (owner) => owner.cells,
  ),
);

const operations = Object.freeze(
  selectedCells
    .map((manifest) =>
      Object.freeze({
        id: manifest.id,
        name: manifest.observability.operation,
      }),
    )
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
);

export const observabilityOperationIds = Object.freeze(
  operations.map(({ id }) => id),
);
export const observabilityOperationNames = Object.freeze(
  operations.map(({ name }) => name),
);

export const observabilityOperationIdByName = Object.freeze(
  Object.fromEntries(operations.map(({ id, name }) => [name, id])),
);

const jobs = Object.freeze(
  selectedCells
    .flatMap((manifest) =>
      manifest.surfaces.flatMap((surface: CellSurfaceManifest) =>
        surface.kind === 'job'
          ? [
              Object.freeze({
                id: surface.id,
                operationId: manifest.id,
                operation: manifest.observability.operation,
                queue: surface.queue,
              }),
            ]
          : [],
      ),
    )
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
);

export const observabilityJobsById = Object.freeze(
  Object.fromEntries(
    jobs.map(({ id, operationId, operation, queue }) => [
      id,
      { operationId, operation, queue },
    ]),
  ),
);

export const observabilityOperationIdByJobLabel = Object.freeze(
  Object.fromEntries(
    jobs.flatMap(({ operationId, queue }) =>
      queue === null ? [] : [[queue, operationId]],
    ),
  ),
);

const enrichMetricDescriptor = (
  descriptor: CatalogMetricDescriptor<string, string>,
): CatalogMetricDescriptor<string, string> => {
  const operationAware =
    descriptor.allowedAttributes.includes('operation') ||
    descriptor.allowedAttributes.includes('job');
  const allowedAttributes = Object.freeze([
    ...new Set([
      'runtime',
      ...descriptor.allowedAttributes,
      ...(operationAware ? ['operation_id'] : []),
    ]),
  ]);
  const attributeValues: Partial<Record<string, readonly string[]>> = {
    ...(descriptor.attributeValues ?? {}),
  };
  if (allowedAttributes.includes('runtime'))
    attributeValues['runtime'] = runtimeValues;
  if (
    transactionMetrics.has(descriptor.name) &&
    allowedAttributes.includes('operation')
  )
    attributeValues['operation'] = observabilityOperationNames;
  if (operationAware)
    attributeValues['operation_id'] = observabilityOperationIds;

  return Object.freeze({
    ...descriptor,
    allowedAttributes,
    attributeValues: Object.freeze(attributeValues),
  });
};

const metricComposition = composeMetricCatalog(
  genericMetricDescriptors.map(enrichMetricDescriptor),
  productionMetricDescriptors.map(enrichMetricDescriptor),
  ingressMetricDescriptors.map(enrichMetricDescriptor),
);

if (metricComposition.kind === 'collision')
  throw invariantViolationError({
    code: 'observability_metric_name_collision',
    message: `Metric names are duplicated: ${metricComposition.duplicateNames.join(', ')}.`,
    safeMessage: 'Observability configuration is invalid.',
  });

export const metricCatalog = metricComposition.catalog;

export const isMetricName = (name: string): boolean =>
  Object.hasOwn(metricCatalog, name);

export const observabilityOperationIdFor = (
  operation: string,
): string | undefined =>
  Object.hasOwn(observabilityOperationIdByName, operation)
    ? (observabilityOperationIdByName as Readonly<Record<string, string>>)[
        operation
      ]
    : undefined;

export const observabilityOperationIdForJobLabel = (
  job: string,
): string | undefined =>
  Object.hasOwn(observabilityOperationIdByJobLabel, job)
    ? (observabilityOperationIdByJobLabel as Readonly<Record<string, string>>)[
        job
      ]
    : undefined;

export const presslyObservabilityCatalog = Object.freeze({
  metrics: metricCatalog,
  operationIdFor: observabilityOperationIdFor,
  operationIdForJobLabel: observabilityOperationIdForJobLabel,
}) satisfies RuntimeObservabilityCatalog;
