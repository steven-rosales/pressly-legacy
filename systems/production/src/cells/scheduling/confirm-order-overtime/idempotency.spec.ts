import { describe, expect, it } from 'vitest';
import type { ConfirmOrderOvertimeWorkEventCommand } from './execute.ts';
import {
  resolveConfirmOrderOvertimeReplay,
  serializeConfirmOrderOvertimeWorkEventCommand,
  type StoredConfirmOrderOvertimeWorkEvent,
} from './idempotency.ts';
import type { ConfirmOrderOvertimeTransactionResult } from './types.ts';

const command: ConfirmOrderOvertimeWorkEventCommand = {
  operation: 'production_order_overtime_confirmed',
  locationId: 'location-1',
  actorId: 'actor-1',
  target: {
    entityType: 'production_order',
    entityId: '65000000-0000-4000-8000-000000000001',
  },
  expectedVersion: 4,
  payload: {
    expectedQueueVersion: 4,
    authorizedAction: 'production:override',
    mode: 'manager_exact',
    productionBatchId: '65000000-0000-4000-8000-000000000002',
    proposalHash: 'a'.repeat(64),
  },
};
const results: readonly ConfirmOrderOvertimeTransactionResult[] = [
  {
    status: 'placed',
    mode: 'manager_exact',
    productionRunId: '65000000-0000-4000-8000-000000000003',
    productionOrderId: command.target.entityId,
    productionBatchId: command.payload.productionBatchId!,
    createdBatch: false,
    affectedBatchIds: [command.payload.productionBatchId!],
    queueVersion: 5,
    proposalHash: command.payload.proposalHash,
    plannedCompletionAt: '2026-08-22T22:15:00.000Z',
    overtimeMinutes: 15,
    replayed: false,
  },
  {
    status: 'not_placed',
    mode: 'manager_exact',
    productionRunId: '65000000-0000-4000-8000-000000000003',
    productionOrderId: command.target.entityId,
    reason: 'proposal_stale',
    message: 'The proposal is stale.',
    queueVersion: 5,
    replayed: false,
  },
  {
    status: 'confirmation_required',
    mode: 'manager_exact',
    productionRunId: '65000000-0000-4000-8000-000000000003',
    productionOrderId: command.target.entityId,
    target: {
      kind: 'existing_batch',
      productionBatchId: command.payload.productionBatchId!,
      sequence: 1,
    },
    affectedBatchIds: [command.payload.productionBatchId!],
    queueVersion: 4,
    proposalHash: command.payload.proposalHash,
    projectedCompletionAt: '2026-08-22T22:15:00.000Z',
    overtimeMinutes: 15,
    replayed: false,
  },
];
const stored = (
  result: ConfirmOrderOvertimeTransactionResult,
): StoredConfirmOrderOvertimeWorkEvent => ({
  command: serializeConfirmOrderOvertimeWorkEventCommand(command),
  result: result as never,
  valid: true,
});

describe('confirm-order-overtime idempotency', () => {
  it('serializes mode, exact target, hash, queue, action, and actor identity', () => {
    expect(serializeConfirmOrderOvertimeWorkEventCommand(command)).toEqual({
      operation: 'production_order_overtime_confirmed',
      locationId: 'location-1',
      actorId: 'actor-1',
      target: command.target,
      expectedVersion: 4,
      payload: command.payload,
    });
  });

  it('distinguishes miss, malformed storage, and divergent identity', () => {
    expect(resolveConfirmOrderOvertimeReplay(null, command)).toEqual({
      kind: 'miss',
    });
    expect(
      resolveConfirmOrderOvertimeReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolveConfirmOrderOvertimeReplay(
        {
          ...stored(results[0]!),
          command: {
            ...serializeConfirmOrderOvertimeWorkEventCommand(command),
            expectedVersion: 5,
          },
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it.each(results)('replays stored $status and marks it replayed', (value) => {
    expect(resolveConfirmOrderOvertimeReplay(stored(value), command)).toEqual({
      kind: 'replay',
      result: { ...value, replayed: true },
    });
  });
});
