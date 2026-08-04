import { describe, expect, it, vi } from 'vitest';
import {
  decodeOrderCursor,
  encodeOrderCursor,
} from '../../../../src/features/queries/read-orders/order-pagination.policy.ts';
import { canonicalOrderItemFromRow } from '../../../../src/features/queries/read-orders/read-orders.persistence.mapper.ts';
import { makeGetCanonicalOrder } from '../../../../src/features/queries/read-orders/read-orders.usecase.ts';

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
      error: { kind: 'not_found', code: 'order_not_found' },
    });
  });

  it('fails closed when persisted item metadata is not a JSON object', () => {
    expect(() =>
      canonicalOrderItemFromRow({
        lineKey: 'line-1',
        itemType: 'wash_fold',
        code: 'wash_fold',
        description: 'Wash and fold',
        quantity: 1,
        unit: 'lb',
        unitPriceCents: 200,
        totalAmountCents: 200,
        sourceMetadata: new Date('2026-07-29T12:00:00.000Z'),
      }),
    ).toThrow(
      expect.objectContaining({
        tag: 'AppError',
        kind: 'InvariantViolationError',
        code: 'order_item_source_metadata_invalid',
      }),
    );
  });
});
