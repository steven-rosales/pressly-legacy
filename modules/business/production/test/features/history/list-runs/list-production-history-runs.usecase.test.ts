import { describe, expect, it } from 'vitest';
import type { ListProductionHistoryRunsRepository } from '../../../../src/features/history/list-runs/list-production-history-runs.port.ts';
import { makeListProductionHistoryRuns } from '../../../../src/features/history/list-runs/list-production-history-runs.usecase.ts';

const now = new Date('2026-07-15T12:00:00.000Z');

describe('list production-history runs', () => {
  it('returns the repository snapshot without changing its read timestamp', async () => {
    const repo: ListProductionHistoryRunsRepository = {
      list: async () => ({
        tag: 'found',
        value: { items: [], nextCursor: null, asOf: now },
      }),
    };
    const listRuns = makeListProductionHistoryRuns({
      repo,
      clock: { now: () => now },
    });

    await expect(
      listRuns({ locationId: 'pressly-one', limit: 50 }),
    ).resolves.toEqual({
      tag: 'ok',
      value: { items: [], nextCursor: null, asOf: now },
    });
  });
});
