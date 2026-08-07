import { describe, expect, it, vi } from 'vitest';
import { canonicalOrderItemFromRow } from '../../../../src/features/queries/get-canonical-order/get-canonical-order.persistence.mapper.ts';
import { makeGetCanonicalOrder } from '../../../../src/features/queries/get-canonical-order/get-canonical-order.usecase.ts';

const businessId = '00000000-0000-4000-8000-000000000100';

describe('canonical Order read boundary', () => {
  it('does not distinguish a cross-business Order from a missing Order', async () => {
    const get = makeGetCanonicalOrder(vi.fn(async () => null));
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
