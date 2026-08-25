import { describe, expect, it } from 'vitest';
import {
  resolvePlaceOrderAutomaticallyReplay,
  serializePlaceOrderAutomaticallyWorkEventCommand,
  type StoredPlaceOrderAutomaticallyWorkEvent,
} from './idempotency.ts';
import type { PlaceOrderAutomaticallyWorkEventCommand } from './execute.ts';
import type { AutomaticProductionOrderPlacementResult } from './types.ts';

const command: PlaceOrderAutomaticallyWorkEventCommand = {
  operation: 'production_order_placed_automatically',
  locationId: 'location-1',
  actorId: 'actor-1',
  target: {
    entityType: 'production_order',
    entityId: '54000000-0000-4000-8000-000000000001',
  },
  expectedVersion: 4,
  payload: {
    expectedQueueVersion: 4,
    authorizedAction: 'production:override',
    mode: 'automatic',
  },
};

const results: readonly AutomaticProductionOrderPlacementResult[] = [
  {
    status: 'placed',
    mode: 'automatic',
    productionRunId: '54000000-0000-4000-8000-000000000002',
    productionOrderId: command.target.entityId,
    productionBatchId: '54000000-0000-4000-8000-000000000003',
    createdBatch: false,
    affectedBatchIds: ['54000000-0000-4000-8000-000000000003'],
    queueVersion: 5,
    proposalHash: 'a'.repeat(64),
    plannedCompletionAt: '2026-08-22T21:00:00.000Z',
    overtimeMinutes: 0,
    replayed: false,
  },
  {
    status: 'confirmation_required',
    mode: 'automatic',
    productionRunId: '54000000-0000-4000-8000-000000000002',
    productionOrderId: command.target.entityId,
    target: { kind: 'new_batch', sequence: 2 },
    affectedBatchIds: [],
    queueVersion: 4,
    proposalHash: 'b'.repeat(64),
    projectedCompletionAt: '2026-08-22T22:15:00.000Z',
    overtimeMinutes: 15,
    replayed: false,
  },
  {
    status: 'not_placed',
    mode: 'automatic',
    productionRunId: '54000000-0000-4000-8000-000000000002',
    productionOrderId: command.target.entityId,
    reason: 'queue_conflict',
    message: 'The queue changed.',
    queueVersion: 5,
    replayed: false,
  },
];

const stored = (
  result: AutomaticProductionOrderPlacementResult,
): StoredPlaceOrderAutomaticallyWorkEvent => ({
  command: serializePlaceOrderAutomaticallyWorkEventCommand(command),
  result: result as never,
  valid: true,
});

describe('place-order-automatically idempotency', () => {
  it('serializes the exact operation-owned command envelope', () => {
    expect(serializePlaceOrderAutomaticallyWorkEventCommand(command)).toEqual({
      operation: 'production_order_placed_automatically',
      locationId: 'location-1',
      actorId: 'actor-1',
      target: command.target,
      expectedVersion: 4,
      payload: {
        expectedQueueVersion: 4,
        authorizedAction: 'production:override',
        mode: 'automatic',
      },
    });
  });

  it('distinguishes a miss from malformed and divergent storage', () => {
    expect(resolvePlaceOrderAutomaticallyReplay(null, command)).toEqual({
      kind: 'miss',
    });
    expect(
      resolvePlaceOrderAutomaticallyReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolvePlaceOrderAutomaticallyReplay(
        {
          ...stored(results[0]!),
          command: {
            ...serializePlaceOrderAutomaticallyWorkEventCommand(command),
            expectedVersion: 5,
          },
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it.each(results)(
    'replays stored $status exactly and marks it replayed',
    (value) => {
      expect(
        resolvePlaceOrderAutomaticallyReplay(stored(value), command),
      ).toEqual({
        kind: 'replay',
        result: { ...value, replayed: true },
      });
    },
  );
});
