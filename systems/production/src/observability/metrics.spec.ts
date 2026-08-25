import { describe, expect, it } from 'vitest';
import type { ProductionSystemUnitOfWorkOperation } from '../system.ts';
import {
  productionMetricDescriptors,
  productionMetricTransactionOperations,
} from './metrics.ts';

type MissingProductionOperation = Exclude<
  ProductionSystemUnitOfWorkOperation,
  (typeof productionMetricTransactionOperations)[number]
>;
type UnknownProductionOperation = Exclude<
  (typeof productionMetricTransactionOperations)[number],
  ProductionSystemUnitOfWorkOperation
>;

const operationsAreComplete: [
  MissingProductionOperation,
  UnknownProductionOperation,
] extends [never, never]
  ? true
  : false = true;

describe('Production metric ownership', () => {
  it('owns every current Production counter exactly once', () => {
    expect(operationsAreComplete).toBe(true);
    expect(productionMetricTransactionOperations).toHaveLength(23);
    expect(productionMetricDescriptors.map(({ name }) => name)).toEqual([
      'production.plan_supersessions',
      'production.runs_started',
      'production.placement_outcomes',
      'production.queue_conflicts',
      'production.batch_freezes',
      'production.overtime_confirmations',
      'production.order_route_outcomes',
      'production.progress_reconciliations',
    ]);
    expect(
      new Set(productionMetricDescriptors.map(({ name }) => name)).size,
    ).toBe(productionMetricDescriptors.length);
  });

  it('publishes only bounded business attribute vocabularies', () => {
    const placement = productionMetricDescriptors.find(
      ({ name }) => name === 'production.placement_outcomes',
    );
    const progress = productionMetricDescriptors.find(
      ({ name }) => name === 'production.progress_reconciliations',
    );

    expect(placement).toMatchObject({
      attributeValues: {
        status: ['placed', 'confirmation_required', 'not_placed'],
        mode: ['automatic', 'manager_exact'],
        reason: expect.arrayContaining(['none', 'queue_conflict']),
      },
    });
    expect(progress).toMatchObject({
      attributeValues: {
        target: expect.arrayContaining(['sorting_started', 'finished']),
        runCompleted: ['true', 'false'],
      },
    });

    for (const descriptor of productionMetricDescriptors)
      expect(descriptor.allowedAttributes).not.toEqual(
        expect.arrayContaining([
          'customer_id',
          'order_id',
          'request_id',
          'payload',
          'exception_message',
        ]),
      );
  });
});
