import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderAutomaticallyCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { placeOrderAutomaticallyContract } from './contract.ts';
import {
  placeOrderAutomaticallyContextNotFound,
  placeOrderAutomaticallyIdempotencyConflict,
} from './failures.ts';
import type {
  AutomaticProductionOrderPlacementResult,
  PlaceProductionOrderAutomaticallyCommand,
} from './types.ts';

const ids = {
  run: '51000000-0000-4000-8000-000000000001',
  order: '51000000-0000-4000-8000-000000000002',
  batch: '51000000-0000-4000-8000-000000000003',
} as const;

const command: PlaceProductionOrderAutomaticallyCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  expectedQueueVersion: 4,
  idempotencyKey: 'place-automatic-1',
  actorId: 'actor-1',
  authorizedAction: 'production:override',
};

const results: readonly AutomaticProductionOrderPlacementResult[] = [
  {
    status: 'placed',
    mode: 'automatic',
    productionRunId: ids.run,
    productionOrderId: ids.order,
    productionBatchId: ids.batch,
    createdBatch: false,
    affectedBatchIds: [ids.batch],
    queueVersion: 5,
    proposalHash: 'a'.repeat(64),
    plannedCompletionAt: '2026-08-22T21:00:00.000Z',
    overtimeMinutes: 0,
    replayed: false,
  },
  {
    status: 'confirmation_required',
    mode: 'automatic',
    productionRunId: ids.run,
    productionOrderId: ids.order,
    target: {
      kind: 'existing_batch',
      productionBatchId: ids.batch,
      sequence: 1,
    },
    affectedBatchIds: [ids.batch],
    queueVersion: 4,
    proposalHash: 'b'.repeat(64),
    projectedCompletionAt: '2026-08-22T22:15:00.000Z',
    overtimeMinutes: 15,
    replayed: false,
  },
  {
    status: 'not_placed',
    mode: 'automatic',
    productionRunId: ids.run,
    productionOrderId: ids.order,
    reason: 'queue_conflict',
    message: 'The production queue changed before placement committed.',
    queueVersion: 5,
    replayed: false,
  },
];

describe('place-order-automatically contract', () => {
  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips exact body and params while deriving override authority',
        proves: ['contract'],
        run: () => {
          const serialized =
            placeOrderAutomaticallyContract.input.encode(command);
          expect(serialized).toEqual({
            params: {
              locationId: command.locationId,
              productionRunId: command.productionRunId,
              productionOrderId: command.productionOrderId,
            },
            body: {
              expectedQueueVersion: command.expectedQueueVersion,
              idempotencyKey: command.idempotencyKey,
            },
            actorId: command.actorId,
          });
          expect(
            placeOrderAutomaticallyContract.input.decode(serialized),
          ).toEqual({
            kind: 'valid',
            value: command,
          });
        },
      },
    ],
  });

  it('orders body issues before params and trusted actor issues', () => {
    const decoded = placeOrderAutomaticallyContract.input.decode({
      body: { expectedQueueVersion: 0, idempotencyKey: 'short' },
      params: {
        locationId: '',
        productionRunId: 'bad',
        productionOrderId: 'bad',
      },
      actorId: '',
    });
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid') {
      expect(decoded.issues[0]?.path[0]).toBe('body');
      expect(decoded.issues.some((issue) => issue.path[0] === 'params')).toBe(
        true,
      );
      expect(decoded.issues.at(-1)?.path).toEqual(['actorId']);
    }
  });

  it.each(results)('round-trips canonical $status output', (value) => {
    expect(
      placeOrderAutomaticallyContract.output.decode(
        placeOrderAutomaticallyContract.output.encode(value),
      ),
    ).toEqual({ kind: 'valid', value });
  });

  it('keeps the closed expected-failure contract', () => {
    for (const failure of [
      placeOrderAutomaticallyContextNotFound(),
      placeOrderAutomaticallyIdempotencyConflict(),
    ])
      expect(
        placeOrderAutomaticallyContract.failure.decode(
          placeOrderAutomaticallyContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
    expect(
      placeOrderAutomaticallyContract.failure.decode({
        kind: 'conflict',
        code: 'unknown',
        message: 'No.',
        safeMessage: 'No.',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('retains the deployed confirmation-replay presentation mismatch', () => {
    const confirmation = results[1]!;
    expect(confirmation.status).toBe('confirmation_required');
    expect(() =>
      placeOrderAutomaticallyContract.output.encode({
        ...confirmation,
        replayed: true,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_api_success_response',
        status: 500,
      }),
    );
  });
});
