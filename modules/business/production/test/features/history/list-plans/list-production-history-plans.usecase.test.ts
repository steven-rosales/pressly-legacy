import { describe, expect, it } from 'vitest';
import type { ListProductionHistoryPlansRepository } from '../../../../src/features/history/list-plans/list-production-history-plans.port.ts';
import { makeListProductionHistoryPlans } from '../../../../src/features/history/list-plans/list-production-history-plans.usecase.ts';

describe('list production-history plans', () => {
  it('preserves the missing-location failure', async () => {
    const repo: ListProductionHistoryPlansRepository = {
      list: async () => ({ tag: 'location_not_found' }),
    };
    const listPlans = makeListProductionHistoryPlans({
      repo,
      clock: { now: () => new Date('2026-07-15T12:00:00.000Z') },
    });

    await expect(
      listPlans({ locationId: 'missing', limit: 50 }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_not_found', kind: 'not_found' },
    });
  });
});
