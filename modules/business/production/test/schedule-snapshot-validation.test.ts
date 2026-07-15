import { describe, expect, it } from 'vitest';
import { scheduleCoversInputExactly } from '../src/persistence/schedule-snapshot-validation.ts';

const order = (id: string) => ({
  id,
  externalOrderId: id,
  dueAt: '2026-07-14T20:00:00.000Z',
  priority: false,
  derivedWeightLbs: 10,
  bagCount: 1,
  version: 1,
});

const batch = (orderIds: string[]) => ({
  sequence: 0,
  orderIds,
  derivedWeightLbs: 10,
  bagCount: 1,
  stages: [],
});

describe('schedule snapshot coverage', () => {
  const input = { orders: [order('order-1'), order('order-2')] };

  it('accepts the exact union of batched and explicitly unplaced orders', () => {
    expect(
      scheduleCoversInputExactly(
        { batches: [batch(['order-1'])], unplacedOrderIds: ['order-2'] },
        input,
      ),
    ).toBe(true);
  });

  it.each([
    {
      name: 'an omitted snapshot order',
      schedule: { batches: [batch(['order-1'])], unplacedOrderIds: [] },
    },
    {
      name: 'a duplicate across a batch and the unplaced set',
      schedule: {
        batches: [batch(['order-1'])],
        unplacedOrderIds: ['order-1', 'order-2'],
      },
    },
    {
      name: 'a duplicate between batches',
      schedule: {
        batches: [batch(['order-1']), batch(['order-1'])],
        unplacedOrderIds: ['order-2'],
      },
    },
    {
      name: 'an order absent from the input snapshot',
      schedule: {
        batches: [batch(['order-1'])],
        unplacedOrderIds: ['order-3'],
      },
    },
  ])('rejects $name', ({ schedule }) => {
    expect(scheduleCoversInputExactly(schedule, input)).toBe(false);
  });
});
