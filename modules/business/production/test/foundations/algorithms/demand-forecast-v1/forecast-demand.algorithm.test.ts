import { describe, expect, it } from 'vitest';
import { forecastDemand } from '../../../../src/foundations/algorithms/demand-forecast-v1/forecast-demand.algorithm.ts';

const input = {
  demand: [
    {
      id: 'expected-1',
      dueAt: '2026-07-18T14:00:00.000Z',
      priority: false,
      estimatedWeightLbs: 120,
      disposition: 'expected' as const,
    },
    {
      id: 'ready-1',
      dueAt: '2026-07-18T14:00:00.000Z',
      priority: true,
      estimatedWeightLbs: 100,
      disposition: 'ready' as const,
    },
  ],
  machines: [
    {
      id: 'washer-1',
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 224,
      active: true,
    },
    {
      id: 'dryer-1',
      stationKind: 'drying' as const,
      effectiveCapacityLbs: 224,
      active: true,
    },
  ],
  shift: {
    startsAt: '2026-07-18T03:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
  },
  config: { pulseMinutes: 56, foldLbsPerFolderMinute: 2 },
};

describe('advisory demand forecast', () => {
  it('packs whole demand by shared pulse capacity without bag counts', () => {
    expect(forecastDemand(input)).toEqual({
      algorithmVersion: 'fixed-pulse-demand-outlook-v1',
      startsAt: '2026-07-18T03:00:00.000Z',
      completesAt: '2026-07-18T06:44:00.000Z',
      pulseMinutes: 56,
      pulseCapacityLbs: 224,
      batchCount: 1,
      makespanMinutes: 224,
      batches: [
        {
          sequence: 0,
          demandIds: ['ready-1', 'expected-1'],
          estimatedWeightLbs: 220,
          expectedOrderCount: 1,
          readyOrderCount: 1,
        },
      ],
      unplacedDemandIds: [],
    });
  });

  it('reports whole demand that exceeds hard pulse capacity', () => {
    expect(
      forecastDemand({
        ...input,
        demand: [
          { ...input.demand[0]!, id: 'oversized', estimatedWeightLbs: 225 },
        ],
      }),
    ).toMatchObject({
      batchCount: 0,
      makespanMinutes: 0,
      unplacedDemandIds: ['oversized'],
    });
  });
});
