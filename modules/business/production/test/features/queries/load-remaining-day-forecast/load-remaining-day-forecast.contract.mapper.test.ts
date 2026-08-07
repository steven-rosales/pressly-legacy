import { describe, expect, it } from 'vitest';
import {
  toLoadRemainingDayForecastCommand,
  toProductionRemainingDayForecastResult,
} from '../../../../src/features/queries/load-remaining-day-forecast/load-remaining-day-forecast.contract.mapper.ts';
import type { ProductionRemainingDayForecast } from '../../../../src/features/queries/load-remaining-day-forecast/load-remaining-day-forecast.model.ts';

const emptySummary = {
  orderCount: 0,
  knownWeightLbs: 0,
  missingEstimateOrderCount: 0,
} as const;

const forecast = {
  locationId: 'location-1',
  serviceDay: '2026-07-26',
  timezone: 'America/New_York',
  window: {
    startsAt: new Date('2026-07-26T04:00:00.000Z'),
    endsAt: new Date('2026-07-27T04:00:00.000Z'),
  },
  asOf: new Date('2026-07-26T15:00:00.000Z'),
  assumptions: {
    algorithmVersion: 'online-stable-insertion-v1',
    overdueUnfinishedIncluded: true,
    physicalIntakeRequired: true,
    wholeOrderPlacement: true,
    expectedWeightsAdvisory: true,
    missingEstimatesExcludedFromWeightTotals: true,
    placementRevalidatedOnCommit: true,
    preciseFinishForecasted: false,
  },
  shifts: [
    {
      productionShiftId: '00000000-0000-4000-8000-000000000001',
      startsAt: new Date('2026-07-26T12:00:00.000Z'),
      endsAt: new Date('2026-07-26T22:00:00.000Z'),
      status: 'open',
      activeRunId: '00000000-0000-4000-8000-000000000002',
    },
  ],
  totals: {
    all: emptySummary,
    inProduction: emptySummary,
    readyToPlace: emptySummary,
    expectedLater: emptySummary,
    needsShift: emptySummary,
  },
  capacityRisk: {
    level: 'attention',
    reasons: ['expected_later'],
    pulseCapacityLbs: 100,
  },
  groups: {
    inProduction: [
      {
        orderDemandId: '00000000-0000-4000-8000-000000000003',
        productionOrderId: '00000000-0000-4000-8000-000000000004',
        externalOrderId: 'ACTIVE',
        dueAt: new Date('2026-07-26T20:00:00.000Z'),
        priority: true,
        estimatedWeightLbs: 30,
        bagCount: 2,
        activeRunId: '00000000-0000-4000-8000-000000000002',
        activeBatchId: '00000000-0000-4000-8000-000000000005',
        actionability: {
          action: 'open_production',
          state: 'available',
          reason: 'already_in_production',
        },
      },
    ],
    readyToPlace: [],
    expectedLater: [],
    needsShift: [],
  },
} satisfies ProductionRemainingDayForecast;

describe('load remaining-day forecast boundary mapping', () => {
  it('maps decoded boundary input into the application command', () => {
    expect(
      toLoadRemainingDayForecastCommand({
        params: { locationId: 'location-1' },
        query: { serviceDay: '2026-07-26' },
      }),
    ).toEqual({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
    });
  });

  it('serializes all forecast instants only at the response edge', () => {
    expect(toProductionRemainingDayForecastResult(forecast)).toMatchObject({
      window: {
        startsAt: '2026-07-26T04:00:00.000Z',
        endsAt: '2026-07-27T04:00:00.000Z',
      },
      asOf: '2026-07-26T15:00:00.000Z',
      shifts: [
        {
          startsAt: '2026-07-26T12:00:00.000Z',
          endsAt: '2026-07-26T22:00:00.000Z',
        },
      ],
      groups: {
        inProduction: [
          {
            dueAt: '2026-07-26T20:00:00.000Z',
            actionability: { action: 'open_production' },
          },
        ],
      },
    });
    expect(forecast.groups.inProduction[0]?.dueAt).toBeInstanceOf(Date);
  });
});
