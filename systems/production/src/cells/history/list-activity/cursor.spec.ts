import { decodeBase64UrlJson } from '@pressly/codec';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { historyActivityCursor } from './cursor.ts';
import type { ListHistoryActivityInput } from './types.ts';

const input: ListHistoryActivityInput = {
  locationId: 'location-1',
  runId: '10000000-0000-4000-8000-000000000002',
  entityType: 'production_order',
  eventType: 'production_order_restored',
  orderResolution: 'restored',
  search: 'manager',
  occurredAfter: new Date('2026-08-20T12:00:00.000Z'),
  limit: 25,
};

const point = {
  createdAtKey: '2026-08-21T12:00:00.000123Z',
  id: '10000000-0000-4000-8000-000000000003',
} as const;

const exactCursor =
  'eyJ2ZXJzaW9uIjoyLCJraW5kIjoiYWN0aXZpdHkiLCJmaWx0ZXJLZXkiOiJ7XCJydW5JZFwiOlwiMTAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyXCIsXCJlbnRpdHlUeXBlXCI6XCJwcm9kdWN0aW9uX29yZGVyXCIsXCJldmVudFR5cGVcIjpcInByb2R1Y3Rpb25fb3JkZXJfcmVzdG9yZWRcIixcIm9yZGVyUmVzb2x1dGlvblwiOlwicmVzdG9yZWRcIixcInNlYXJjaFwiOlwibWFuYWdlclwiLFwib2NjdXJyZWRBZnRlclwiOlwiMjAyNi0wOC0yMFQxMjowMDowMC4wMDBaXCJ9IiwiY3JlYXRlZEF0S2V5IjoiMjAyNi0wOC0yMVQxMjowMDowMC4wMDAxMjNaIiwiaWQiOiIxMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDMifQ';

describe('list-history-activity cursor', () => {
  it('preserves the exact version-2 bytes and complete semantic filter key', () => {
    const cursor = historyActivityCursor.encode(input, point);

    expect(cursor).toBe(exactCursor);
    expect(decodeBase64UrlJson(cursor)).toEqual({
      version: 2,
      kind: 'activity',
      filterKey: JSON.stringify({
        runId: input.runId,
        entityType: input.entityType,
        eventType: input.eventType,
        orderResolution: input.orderResolution,
        search: input.search,
        occurredAfter: input.occurredAfter?.toISOString(),
      }),
      ...point,
    });
    expect(historyActivityCursor.decode(cursor, input)).toEqual(point);
  });

  it('rejects a cursor when any semantic filter changes', () => {
    const cursor = historyActivityCursor.encode(input, point);
    const alternatives: readonly ListHistoryActivityInput[] = [
      { ...input, runId: '10000000-0000-4000-8000-000000000004' },
      { ...input, entityType: 'stage_run' },
      { ...input, eventType: 'production_order_rebatched' },
      { ...input, orderResolution: 'archived' },
      { ...input, search: 'different' },
      { ...input, occurredAfter: new Date('2026-08-20T12:00:00.001Z') },
    ];

    for (const alternative of alternatives)
      expect(historyActivityCursor.decode(cursor, alternative)).toBeNull();
  });

  it('retains location and page-size independence', () => {
    const cursor = historyActivityCursor.encode(input, point);

    expect(
      historyActivityCursor.decode(cursor, {
        ...input,
        locationId: 'location-2',
        limit: 100,
      }),
    ).toEqual(point);
  });

  it('requires exact PostgreSQL precision and a UUID cursor point', () => {
    for (const invalidPoint of [
      { ...point, id: 'not-a-uuid' },
      { ...point, createdAtKey: '2026-08-21T12:00:00.000Z' },
      { ...point, createdAtKey: '2026-02-31T12:00:00.000123Z' },
    ]) {
      try {
        historyActivityCursor.encode(input, invalidPoint);
        expect.unreachable('invalid cursor point should throw');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error))
          expect(error).toMatchObject({
            code: 'production_history_cursor_point_invalid',
            status: 500,
          });
      }
    }

    expect(historyActivityCursor.decode('not-a-cursor', input)).toBeNull();
  });
});
