import { decodeBase64UrlJson } from '@pressly/codec';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { historyPlansCursor } from './cursor.ts';
import type { ListHistoryPlansInput } from './types.ts';

const input: ListHistoryPlansInput = {
  locationId: 'location-1',
  runId: '10000000-0000-4000-8000-000000000002',
  search: 'algorithm',
  status: 'accepted',
  createdAfter: new Date('2026-08-20T12:00:00.000Z'),
  limit: 25,
};

const point = {
  createdAtKey: '2026-08-21T12:00:00.000123Z',
  id: '10000000-0000-4000-8000-000000000003',
} as const;

describe('list-history-plans cursor', () => {
  it('preserves the version-2, kind-bound, complete-filter envelope', () => {
    const cursor = historyPlansCursor.encode(input, point);

    expect(decodeBase64UrlJson(cursor)).toEqual({
      version: 2,
      kind: 'plans',
      filterKey: JSON.stringify({
        runId: input.runId,
        search: input.search,
        status: input.status,
        createdAfter: input.createdAfter?.toISOString(),
      }),
      ...point,
    });
    expect(historyPlansCursor.decode(cursor, input)).toEqual(point);
  });

  it('rejects a cursor when any bound filter changes', () => {
    const cursor = historyPlansCursor.encode(input, point);
    const { runId: _runId, ...withoutRunId } = input;

    expect(
      historyPlansCursor.decode(cursor, { ...input, search: 'different' }),
    ).toBeNull();
    expect(
      historyPlansCursor.decode(cursor, { ...input, status: 'draft' }),
    ).toBeNull();
    expect(historyPlansCursor.decode(cursor, withoutRunId)).toBeNull();
  });

  it('requires a UUID and an exact six-digit PostgreSQL timestamp point', () => {
    for (const invalidPoint of [
      { ...point, id: 'not-a-uuid' },
      { ...point, createdAtKey: '2026-08-21T12:00:00.000Z' },
    ]) {
      try {
        historyPlansCursor.encode(input, invalidPoint);
        expect.unreachable('an invalid cursor point should throw');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error))
          expect(error).toMatchObject({
            code: 'production_history_cursor_point_invalid',
            status: 500,
          });
      }
    }
  });
});
