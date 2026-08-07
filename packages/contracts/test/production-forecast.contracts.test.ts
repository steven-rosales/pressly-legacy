import { describe, expect, it } from 'vitest';
import {
  productionRemainingDayForecastQuerySchema,
  productionRemainingDayForecastSchema,
  productionServiceDaySchema,
  type ProductionRemainingDayForecast,
} from '../src/production/index.ts';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const summary = {
  orderCount: 0,
  knownWeightLbs: 0,
  missingEstimateOrderCount: 0,
} as const;

const forecast = (): ProductionRemainingDayForecast => ({
  locationId: 'location-1',
  serviceDay: '2026-07-26',
  timezone: 'America/New_York',
  window: {
    startsAt: '2026-07-26T04:00:00.000Z',
    endsAt: '2026-07-27T04:00:00.000Z',
  },
  asOf: '2026-07-26T16:00:00.000Z',
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
  shifts: [],
  totals: {
    all: summary,
    inProduction: summary,
    readyToPlace: summary,
    expectedLater: summary,
    needsShift: summary,
  },
  capacityRisk: {
    level: 'unknown',
    reasons: ['no_ready_work'],
    pulseCapacityLbs: null,
  },
  groups: {
    inProduction: [],
    readyToPlace: [],
    expectedLater: [],
    needsShift: [],
  },
});

describe('production remaining-day forecast contracts', () => {
  it.each(['2024-02-29', '2026-07-26'])(
    'accepts real service day %s',
    (serviceDay) => {
      expect(productionServiceDaySchema.parse(serviceDay)).toBe(serviceDay);
    },
  );

  it.each(['2026-02-29', '2026-13-01', '07-26-2026', '2026-07-26T00:00:00Z'])(
    'rejects invalid service day %s',
    (serviceDay) => {
      expect(productionServiceDaySchema.safeParse(serviceDay).success).toBe(
        false,
      );
    },
  );

  it('requires a strict service-day query', () => {
    expect(
      productionRemainingDayForecastQuerySchema.safeParse({}).success,
    ).toBe(false);
    expect(
      productionRemainingDayForecastQuerySchema.safeParse({
        serviceDay: '2026-07-26',
        shiftId: id(1),
      }).success,
    ).toBe(false);
  });

  it('accepts all four groups while retaining a missing estimate explicitly', () => {
    const value = forecast();
    value.groups.inProduction.push({
      orderDemandId: id(1),
      productionOrderId: id(2),
      externalOrderId: 'ORDER-1',
      dueAt: '2026-07-26T18:00:00.000Z',
      priority: false,
      estimatedWeightLbs: 40,
      bagCount: 2,
      activeRunId: id(3),
      activeBatchId: id(4),
      actionability: {
        action: 'open_production',
        state: 'available',
        reason: 'already_in_production',
      },
    });
    value.groups.readyToPlace.push({
      orderDemandId: id(5),
      productionOrderId: id(6),
      externalOrderId: 'ORDER-2',
      dueAt: '2026-07-26T19:00:00.000Z',
      priority: true,
      estimatedWeightLbs: 35,
      bagCount: 1,
      activeRunId: id(3),
      actionability: {
        action: 'place_in_active_run',
        state: 'available',
        reason: 'ready_for_placement',
      },
    });
    value.groups.expectedLater.push({
      orderDemandId: id(7),
      productionOrderId: null,
      externalOrderId: 'ORDER-3',
      dueAt: '2026-07-26T20:00:00.000Z',
      priority: false,
      estimatedWeightLbs: null,
      bagCount: null,
      readiness: 'not_admitted',
      actionability: {
        action: 'monitor',
        state: 'informational',
        reason: 'missing_estimate',
      },
    });
    value.groups.needsShift.push({
      orderDemandId: id(8),
      productionOrderId: id(9),
      externalOrderId: 'ORDER-4',
      dueAt: '2026-07-26T21:00:00.000Z',
      priority: false,
      estimatedWeightLbs: 120,
      bagCount: 4,
      activeRunId: id(3),
      reason: 'placement_rejected',
      actionability: {
        action: 'plan_shift',
        state: 'available',
        reason: 'placement_rejected',
      },
    });

    expect(productionRemainingDayForecastSchema.parse(value)).toEqual(value);
  });

  it('rejects fabricated execution details at every strict boundary', () => {
    expect(
      productionRemainingDayForecastSchema.safeParse({
        ...forecast(),
        projectedCompletionAt: '2026-07-26T22:00:00.000Z',
      }).success,
    ).toBe(false);

    const value = forecast();
    value.groups.readyToPlace.push({
      orderDemandId: id(1),
      productionOrderId: id(2),
      externalOrderId: 'ORDER-1',
      dueAt: '2026-07-26T18:00:00.000Z',
      priority: false,
      estimatedWeightLbs: 40,
      bagCount: 2,
      activeRunId: id(3),
      actionability: {
        action: 'place_in_active_run',
        state: 'available',
        reason: 'ready_for_placement',
      },
      targetBatchId: id(4),
    } as never);

    expect(productionRemainingDayForecastSchema.safeParse(value).success).toBe(
      false,
    );
  });
});
