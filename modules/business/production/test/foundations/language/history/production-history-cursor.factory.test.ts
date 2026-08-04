import { describe, expect, it } from 'vitest';
import { defineProductionHistoryCursor } from '../../../../src/foundations/language/history/production-history-cursor.factory.ts';

const cursor = defineProductionHistoryCursor<
  Readonly<{ status?: string; since?: Date }>,
  'example'
>({
  kind: 'example',
  projectFilter: (filter) => ({
    status: filter.status ?? null,
    since: filter.since?.toISOString() ?? null,
  }),
});

describe('defineProductionHistoryCursor', () => {
  it('binds a cursor to its compiled view and canonical filter projection', () => {
    const filter = {
      status: 'completed',
      since: new Date('2026-08-02T12:00:00.000Z'),
    };
    const point = {
      createdAt: new Date('2026-08-02T13:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000001',
    };

    const encoded = cursor.encode(filter, point);

    expect(cursor.decode(encoded, filter)).toEqual(point);
    expect(cursor.decode(encoded, { ...filter, status: 'started' })).toBeNull();
  });

  it('fails closed for malformed payloads and invalid cursor points', () => {
    expect(cursor.decode('not-a-cursor', {})).toBeNull();
    expect(() =>
      cursor.encode({}, { createdAt: new Date('invalid'), id: 'not-a-uuid' }),
    ).toThrow('Production-history cursor point is invalid.');
  });
});
