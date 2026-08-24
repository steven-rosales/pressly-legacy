import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeSetOrderPriorityCell } from './cell.ts';
import { setOrderPriorityIdempotency } from './idempotency.ts';

describe('set order priority cell', () => {
  it('declares the deployed PATCH protocol without registering a runtime writer', () => {
    const cell = makeSetOrderPriorityCell({
      repo: { transaction: vi.fn() },
      idempotency: setOrderPriorityIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
    });

    expect(cell.id).toBe('production.set-order-priority.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authorization).toEqual({
      capability: 'production:priority',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    expect(cell.consistency).toMatchObject({
      transaction: 'required',
      concurrency: 'optimistic',
    });
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'PATCH',
        path: '/production/locations/:locationId/orders/:productionOrderId/priority',
        bodyLimit: '64kb',
        authorization: 'staged',
      },
    ]);
  });
});
