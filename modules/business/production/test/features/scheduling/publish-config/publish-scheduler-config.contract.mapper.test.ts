import { describe, expect, it } from 'vitest';
import { toSchedulerConfigResult } from '../../../../src/features/scheduling/publish-config/publish-scheduler-config.contract.mapper.ts';

describe('publish scheduler config mapper', () => {
  it('copies module-owned configuration into the serialized result shape', () => {
    const config = {
      id: '00000000-0000-4000-8000-000000000001',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 1.25,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 4,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
        assertedBy: '00000000-0000-4000-8000-000000000002',
        assertedAt: '2026-08-02T16:00:00.000Z',
      },
      publishedAt: '2026-08-02T16:00:00.000Z',
    } as const;

    expect(toSchedulerConfigResult(config)).toEqual(config);
    expect(toSchedulerConfigResult(config)).not.toBe(config);
    expect(toSchedulerConfigResult(config).stageFitAssertion).not.toBe(
      config.stageFitAssertion,
    );
  });
});
