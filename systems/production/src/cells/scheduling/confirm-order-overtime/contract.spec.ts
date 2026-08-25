import { proveOperation } from '@pressly/testkit/operation-proof';
import { confirmOrderOvertimeCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { confirmOrderOvertimeContract } from './contract.ts';
import {
  confirmOrderOvertimeContextNotFound,
  confirmOrderOvertimeIdempotencyConflict,
} from './failures.ts';
import type {
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
} from './types.ts';

const ids = {
  run: '63000000-0000-4000-8000-000000000001',
  order: '63000000-0000-4000-8000-000000000002',
  batch: '63000000-0000-4000-8000-000000000003',
} as const;
const proposalHash = 'a'.repeat(64);
const command: ConfirmProductionOrderOvertimeCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  expectedQueueVersion: 4,
  proposalHash,
  idempotencyKey: 'confirm-overtime-1',
  actorId: 'actor-1',
  authorizedAction: 'production:override',
};
const results: readonly ConfirmProductionOrderOvertimeResult[] = [
  {
    status: 'placed',
    mode: 'manager_exact',
    productionRunId: ids.run,
    productionOrderId: ids.order,
    productionBatchId: ids.batch,
    createdBatch: false,
    affectedBatchIds: [ids.batch],
    queueVersion: 5,
    proposalHash,
    plannedCompletionAt: '2026-08-22T22:15:00.000Z',
    overtimeMinutes: 15,
    replayed: false,
  },
  {
    status: 'not_placed',
    mode: 'automatic',
    productionRunId: ids.run,
    productionOrderId: ids.order,
    reason: 'proposal_stale',
    message: 'The overtime proposal no longer matches the production queue.',
    queueVersion: 5,
    replayed: false,
  },
];

describe('confirm-order-overtime contract', () => {
  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the exact body, params, and override actor identity',
        proves: ['contract'],
        run: () => {
          const serialized = confirmOrderOvertimeContract.input.encode(command);
          expect(serialized).toEqual({
            params: {
              locationId: command.locationId,
              productionRunId: command.productionRunId,
              productionOrderId: command.productionOrderId,
            },
            body: {
              expectedQueueVersion: 4,
              proposalHash,
              idempotencyKey: command.idempotencyKey,
            },
            actorId: command.actorId,
          });
          expect(confirmOrderOvertimeContract.input.decode(serialized)).toEqual(
            {
              kind: 'valid',
              value: command,
            },
          );
        },
      },
    ],
  });

  it('orders body issues before params and actor issues', () => {
    const decoded = confirmOrderOvertimeContract.input.decode({
      body: {
        expectedQueueVersion: 0,
        proposalHash: 'bad',
        idempotencyKey: 'bad',
      },
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
      confirmOrderOvertimeContract.output.decode(
        confirmOrderOvertimeContract.output.encode(value),
      ),
    ).toEqual({ kind: 'valid', value });
  });

  it('rejects confirmation-required output and unknown failures', () => {
    expect(
      confirmOrderOvertimeContract.output.decode({
        status: 'confirmation_required',
      }),
    ).toMatchObject({ kind: 'invalid' });
    for (const failure of [
      confirmOrderOvertimeContextNotFound(),
      confirmOrderOvertimeIdempotencyConflict(),
    ])
      expect(
        confirmOrderOvertimeContract.failure.decode(
          confirmOrderOvertimeContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
    expect(
      confirmOrderOvertimeContract.failure.decode({
        kind: 'conflict',
        code: 'unknown',
        message: 'No.',
        safeMessage: 'No.',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
