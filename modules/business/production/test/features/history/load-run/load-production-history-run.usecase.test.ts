import { describe, expect, it } from 'vitest';
import type { LoadProductionHistoryRunRepository } from '../../../../src/features/history/load-run/load-production-history-run.port.ts';
import { makeLoadProductionHistoryRun } from '../../../../src/features/history/load-run/load-production-history-run.usecase.ts';

const command = {
  locationId: 'pressly-one',
  productionRunId: '00000000-0000-4000-8000-000000000001',
};

const loadWith = (repo: LoadProductionHistoryRunRepository) =>
  makeLoadProductionHistoryRun({
    repo,
    clock: { now: () => new Date('2026-07-15T12:00:00.000Z') },
  });

describe('load production-history run', () => {
  it('does not collapse missing locations and missing runs together', async () => {
    const missingLocation = loadWith({
      load: async () => ({ tag: 'location_not_found' }),
    });
    const missingRun = loadWith({
      load: async () => ({ tag: 'run_not_found' }),
    });

    await expect(missingLocation(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_not_found', kind: 'not_found' },
    });
    await expect(missingRun(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_history_run_not_found', kind: 'not_found' },
    });
  });
});
