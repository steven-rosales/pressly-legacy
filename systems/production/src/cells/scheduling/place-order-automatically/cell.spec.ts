import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makePlaceOrderAutomaticallyCell } from './cell.ts';
import { placeOrderAutomaticallyIdempotency } from './idempotency.ts';

describe('production.place-order-automatically.v1 cell', () => {
  it('is selected, independently observable, staged, and override-authorized', () => {
    const cell = makePlaceOrderAutomaticallyCell({
      repo: { transaction: vi.fn() },
      idempotency: placeOrderAutomaticallyIdempotency,
      policy: productionRules,
      proposeOnlinePlacement: vi.fn(),
      clock: { now: () => new Date(0) },
    });
    expect(cell).toMatchObject({
      id: 'production.place-order-automatically.v1',
      kind: 'command',
      authentication: 'required',
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
        scope: expect.any(Function),
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        expectedVersion: expect.any(Function),
      },
      idempotency: { required: true, key: expect.any(Function) },
      emits: [],
      consumes: [],
      observability: { operation: 'production.place_order_automatically' },
    });
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'POST',
        path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
        authorization: 'staged',
      },
    ]);
    const surface = cell.surfaces[0];
    if (surface?.kind !== 'http') {
      expect.unreachable('Automatic placement must expose an HTTP surface.');
      return;
    }
    expect(surface.decodeAuthorizationScope).toEqual(expect.any(Function));
  });
});
