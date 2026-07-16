import { describe, expect, it } from 'vitest';
import type { ProductionHistoryRepository } from '../../src/list-production-history/list-production-history.port.ts';
import { makeListProductionHistory } from '../../src/list-production-history/list-production-history.usecase.ts';

const now = new Date('2026-07-15T12:00:00.000Z');

const repository = (
  overrides: Partial<ProductionHistoryRepository> = {},
): ProductionHistoryRepository => ({
  listRuns: async () => ({
    tag: 'found',
    value: { items: [], nextCursor: null, asOf: now.toISOString() },
  }),
  listActivity: async () => ({
    tag: 'found',
    value: { items: [], nextCursor: null, asOf: now.toISOString() },
  }),
  listPlans: async () => ({
    tag: 'found',
    value: { items: [], nextCursor: null, asOf: now.toISOString() },
  }),
  loadRun: async () => ({ tag: 'run_not_found' }),
  ...overrides,
});

describe('production history use cases', () => {
  it('returns cursor pages with one authoritative read timestamp', async () => {
    const history = makeListProductionHistory({
      repo: repository(),
      clock: { now: () => now },
    });

    await expect(
      history.listRuns({ locationId: 'pressly-one', limit: 50 }),
    ).resolves.toEqual({
      tag: 'ok',
      value: { items: [], nextCursor: null, asOf: now.toISOString() },
    });
  });

  it('bounds malformed and filter-mismatched cursors', async () => {
    const history = makeListProductionHistory({
      repo: repository({
        listActivity: async () => ({ tag: 'invalid_cursor' }),
      }),
      clock: { now: () => now },
    });

    await expect(
      history.listActivity({
        locationId: 'pressly-one',
        limit: 50,
        cursor: 'wrong-page',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_history_cursor_invalid', status: 400 },
    });
  });

  it('does not collapse missing locations and missing runs together', async () => {
    const missingLocation = makeListProductionHistory({
      repo: repository({
        loadRun: async () => ({ tag: 'location_not_found' }),
      }),
      clock: { now: () => now },
    });
    const missingRun = makeListProductionHistory({
      repo: repository(),
      clock: { now: () => now },
    });
    const command = {
      locationId: 'pressly-one',
      productionRunId: '00000000-0000-4000-8000-000000000001',
    };

    await expect(missingLocation.loadRun(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_not_found', status: 404 },
    });
    await expect(missingRun.loadRun(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_history_run_not_found', status: 404 },
    });
  });
});
