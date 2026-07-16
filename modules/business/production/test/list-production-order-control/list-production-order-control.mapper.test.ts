import { describe, expect, it } from 'vitest';
import {
  decodeProductionOrderControlCursor,
  encodeProductionOrderControlCursor,
  productionOrderControlFilterKey,
} from '../../src/list-production-order-control/list-production-order-control.mapper.ts';

const orderId = '10000000-0000-4000-8000-000000000001';

describe('production order-control cursor', () => {
  it('binds the keyset position to the complete server filter', () => {
    const activeFilter = productionOrderControlFilterKey({
      view: 'active',
      priority: true,
      limit: 25,
    });
    const point = {
      dueAt: '2026-07-15T20:00:00.000Z',
      id: orderId,
    };
    const cursor = encodeProductionOrderControlCursor(activeFilter, point);

    expect(decodeProductionOrderControlCursor(cursor, activeFilter)).toEqual(
      point,
    );
    expect(
      decodeProductionOrderControlCursor(
        cursor,
        productionOrderControlFilterKey({
          view: 'active',
          priority: false,
          limit: 25,
        }),
      ),
    ).toBeNull();
  });
});
