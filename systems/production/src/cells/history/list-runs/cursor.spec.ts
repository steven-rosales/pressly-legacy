import { describe, expect, it } from 'vitest';
import { historyRunsCursor } from './cursor.ts';

const input = {
  locationId: 'location-1',
  limit: 50,
  search: 'north',
  status: 'completed' as const,
};
const point = {
  createdAtKey: '2026-08-21T14:00:00.123456Z',
  id: '10000000-0000-4000-8000-000000000001',
};

describe('list-history-runs cursor', () => {
  it('round-trips exact microseconds and binds every filter', () => {
    const cursor = historyRunsCursor.encode(input, point);
    expect(historyRunsCursor.decode(cursor, input)).toEqual(point);
    expect(
      historyRunsCursor.decode(cursor, { ...input, status: 'started' }),
    ).toBeNull();
    expect(historyRunsCursor.decode('bad', input)).toBeNull();
  });
});
