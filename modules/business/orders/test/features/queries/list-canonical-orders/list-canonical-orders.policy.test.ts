import { describe, expect, it } from 'vitest';
import {
  decodeOrderCursor,
  encodeOrderCursor,
} from '../../../../src/features/queries/list-canonical-orders/order-pagination.policy.ts';

const businessId = '00000000-0000-4000-8000-000000000100';

describe('list canonical Orders', () => {
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
});
