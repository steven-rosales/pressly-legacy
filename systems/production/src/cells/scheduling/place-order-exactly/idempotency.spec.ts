import { describe, expect, it } from 'vitest';
import type { PlaceOrderExactlyWorkEventCommand } from './execute.ts';
import {
  resolvePlaceOrderExactlyReplay,
  serializePlaceOrderExactlyWorkEventCommand,
} from './idempotency.ts';

const identity: PlaceOrderExactlyWorkEventCommand = {
  operation: 'production_order_placed_exactly',
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_order',
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 4,
  payload: {
    expectedQueueVersion: 4,
    authorizedAction: 'production:override',
    expectedBatchVersion: 3,
    mode: 'manager_exact',
    productionBatchId: '10000000-0000-4000-8000-000000000003',
  },
};

describe('place order exactly idempotency', () => {
  it('serializes the exact target and both optimistic versions', () => {
    expect(serializePlaceOrderExactlyWorkEventCommand(identity)).toEqual(
      identity,
    );
  });

  it('distinguishes miss, replay, divergent payload, and malformed receipt', () => {
    expect(resolvePlaceOrderExactlyReplay(null, identity)).toEqual({
      kind: 'miss',
    });
    const stored = {
      valid: true,
      command: serializePlaceOrderExactlyWorkEventCommand(identity),
      result: {
        status: 'not_placed',
        mode: 'manager_exact',
        productionRunId: '10000000-0000-4000-8000-000000000004',
        productionOrderId: identity.target.entityId,
        reason: 'queue_conflict',
        message: 'Queue changed.',
        queueVersion: 4,
        replayed: false,
      },
    } as const;
    expect(resolvePlaceOrderExactlyReplay(stored, identity)).toMatchObject({
      kind: 'replay',
      result: { replayed: true },
    });
    expect(
      resolvePlaceOrderExactlyReplay(stored, {
        ...identity,
        payload: { ...identity.payload, expectedBatchVersion: 4 },
      }),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolvePlaceOrderExactlyReplay(
        { valid: false, command: {}, result: {} },
        identity,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
