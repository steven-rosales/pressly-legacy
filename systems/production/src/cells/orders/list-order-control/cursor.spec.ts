import { describe, expect, it } from 'vitest';
import { orderControlCursor } from './cursor.ts';
import type { ListOrderControlInput } from './types.ts';

const runId = '66000000-0000-4000-8000-000000000001';
const batchId = '66000000-0000-4000-8000-000000000002';
const orderId = '66000000-0000-4000-8000-000000000003';
const input: ListOrderControlInput = {
  locationId: 'location-1',
  view: 'active',
  search: 'ORDER',
  status: 'scheduled',
  dueBucket: 'today',
  productionRunId: runId,
  productionBatchId: batchId,
  stage: 'washing',
  priority: true,
  movable: false,
  limit: 25,
};
const point = {
  dueAt: new Date('2026-08-22T20:00:00.000Z'),
  id: orderId,
};

describe('order control cursor', () => {
  it('binds version 1 to every filter except limit', () => {
    const cursor = orderControlCursor.encode(input, point);
    expect(orderControlCursor.decode(cursor, input)).toEqual(point);
    expect(orderControlCursor.decode(cursor, { ...input, limit: 100 })).toEqual(
      point,
    );
    for (const changed of [
      { ...input, view: 'all' as const },
      { ...input, search: 'OTHER' },
      { ...input, status: 'eligible' as const },
      { ...input, dueBucket: 'tomorrow' as const },
      { ...input, productionRunId: orderId },
      { ...input, productionBatchId: orderId },
      { ...input, stage: 'drying' as const },
      { ...input, priority: false },
      { ...input, movable: true },
    ])
      expect(orderControlCursor.decode(cursor, changed)).toBeNull();
  });

  it('rejects malformed payloads', () => {
    expect(orderControlCursor.decode('not-a-cursor', input)).toBeNull();
  });
});
