import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderExactlyCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { placeOrderExactlyContract } from './contract.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  batch: '10000000-0000-4000-8000-000000000002',
  order: '10000000-0000-4000-8000-000000000003',
  actor: '10000000-0000-4000-8000-000000000004',
} as const;
const params = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  productionOrderId: ids.order,
};
const body = {
  expectedQueueVersion: 4,
  expectedBatchVersion: 3,
  idempotencyKey: 'place-exact-1',
};

describe('place order exactly contract', () => {
  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes strict body, route identity, actor, and fixed authorization',
        proves: ['contract'],
        run: () => {
          expect(
            placeOrderExactlyContract.input.decode({
              body,
              params,
              actorId: ids.actor,
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              ...params,
              ...body,
              actorId: ids.actor,
              authorizedAction: 'production:override',
            },
          });
        },
      },
    ],
  });

  it('orders body issues before params and actor issues', () => {
    const decoded = placeOrderExactlyContract.input.decode({
      body: {},
      params: {
        locationId: '',
        productionRunId: 'bad',
        productionBatchId: 'bad',
        productionOrderId: 'bad',
      },
      actorId: '',
    });
    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid') {
      expect(decoded.issues[0]?.path[0]).toBe('body');
      expect(
        decoded.issues.findIndex((issue) => issue.path[0] === 'params'),
      ).toBeGreaterThan(0);
      expect(decoded.issues.at(-1)?.path).toEqual(['actorId']);
    }
  });

  it('round-trips placed, confirmation-required, and not-placed results', () => {
    const results = [
      {
        status: 'placed' as const,
        mode: 'manager_exact' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        productionBatchId: ids.batch,
        createdBatch: false,
        affectedBatchIds: [ids.batch],
        queueVersion: 5,
        proposalHash: 'a'.repeat(64),
        plannedCompletionAt: '2026-08-22T16:00:00.000Z',
        overtimeMinutes: 0,
        replayed: false,
      },
      {
        status: 'confirmation_required' as const,
        mode: 'manager_exact' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        target: {
          kind: 'existing_batch' as const,
          productionBatchId: ids.batch,
          sequence: 0,
        },
        affectedBatchIds: [ids.batch],
        queueVersion: 4,
        proposalHash: 'b'.repeat(64),
        projectedCompletionAt: '2026-08-22T23:00:00.000Z',
        overtimeMinutes: 60,
        replayed: false as const,
      },
      {
        status: 'not_placed' as const,
        mode: 'manager_exact' as const,
        productionRunId: ids.run,
        productionOrderId: ids.order,
        reason: 'queue_conflict' as const,
        message: 'The queue changed.',
        queueVersion: 4,
        replayed: false,
      },
    ];
    for (const result of results)
      expect(
        placeOrderExactlyContract.output.decode(
          placeOrderExactlyContract.output.encode(result),
        ),
      ).toEqual({ kind: 'valid', value: result });
  });

  it('accepts only exact not-found and conflict failure categories', () => {
    expect(
      placeOrderExactlyContract.failure.decode({
        kind: 'not_found',
        code: 'production_placement_context_not_found',
        message: 'The production run or order was not found.',
        safeMessage: 'The production run or order was not found.',
      }),
    ).toMatchObject({ kind: 'valid' });
    expect(
      placeOrderExactlyContract.failure.decode({
        kind: 'conflict',
        code: 'production_placement_order_version_conflict',
        message: 'Changed.',
        safeMessage: 'Refresh.',
      }),
    ).toMatchObject({ kind: 'valid' });
  });
});
