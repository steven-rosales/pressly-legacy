import { describe, expect, it } from 'vitest';
import type { ListProductionHistoryActivityRepository } from '../../../../src/features/history/list-activity/list-production-history-activity.port.ts';
import { makeListProductionHistoryActivity } from '../../../../src/features/history/list-activity/list-production-history-activity.usecase.ts';

describe('list production-history activity', () => {
  it('bounds malformed and filter-mismatched cursors', async () => {
    const repo: ListProductionHistoryActivityRepository = {
      list: async () => ({ tag: 'invalid_cursor' }),
    };
    const listActivity = makeListProductionHistoryActivity({
      repo,
      clock: { now: () => new Date('2026-07-15T12:00:00.000Z') },
    });

    await expect(
      listActivity({
        locationId: 'pressly-one',
        limit: 50,
        cursor: 'wrong-page',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_history_cursor_invalid',
        kind: 'validation',
        classification: 'malformed',
      },
    });
  });
});
