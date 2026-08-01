import { describe, expect, it, vi } from 'vitest';
import {
  decodeOrderCursor,
  encodeOrderCursor,
} from '../src/order-pagination.policy.ts';
import { makeGetCanonicalOrder } from '../src/read-orders/read-orders.usecase.ts';

const businessId = '00000000-0000-4000-8000-000000000100';

describe('canonical Order read boundary', () => {
  it('binds the opaque cursor to business, locations, and filters', () => {
    const filter = {
      businessId,
      locationIds: ['east', 'west'],
      query: 'P-100',
      state: 'open' as const,
    };
    const cursor = encodeOrderCursor(filter, {
      dueAt: new Date('2026-07-29T12:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000010',
    });
    expect(
      decodeOrderCursor({ ...filter, locationIds: ['west', 'east'] }, cursor),
    ).not.toBeNull();
    expect(
      decodeOrderCursor(
        {
          ...filter,
          businessId: '00000000-0000-4000-8000-000000000200',
        },
        cursor,
      ),
    ).toBeNull();
  });

  it('does not distinguish a cross-business Order from a missing Order', async () => {
    const get = makeGetCanonicalOrder({
      list: vi.fn(),
      get: vi.fn(async () => null),
    });
    await expect(
      get({
        businessId,
        locationIds: ['east'],
        orderId: '00000000-0000-4000-8000-000000000999',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'order_not_found', status: 404 },
    });
  });
});
