import { describe, expect, it, vi } from 'vitest';
import { projectDemandOutlook } from '../../../../src/features/queries/load-workspace/demand-outlook.policy.ts';
import type { DemandForecastOutput } from '../../../../src/foundations/language/scheduling/production-scheduling.model.ts';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const emptyForecast: DemandForecastOutput = {
  algorithmVersion: 'fixed-pulse-demand-outlook-v1',
  startsAt: '2026-07-18T03:00:00.000Z',
  completesAt: '2026-07-18T03:00:00.000Z',
  pulseMinutes: 56,
  pulseCapacityLbs: 224,
  batchCount: 0,
  makespanMinutes: 0,
  batches: [],
  unplacedDemandIds: [],
};

describe('production demand outlook projection', () => {
  it('uses the shift service day and separates expected, ready, and committed demand', () => {
    const forecastDemand = vi.fn(() => emptyForecast);
    const outlook = projectDemandOutlook({
      shift: {
        id: id(1),
        locationId: 'location-1',
        startsAt: new Date('2026-07-18T03:00:00.000Z'),
        endsAt: new Date('2026-07-18T10:00:00.000Z'),
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        status: 'open',
        version: 1,
      },
      config: {
        id: id(2),
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
          assertedBy: id(3),
          assertedAt: '2026-07-17T20:00:00.000Z',
        },
        publishedAt: '2026-07-17T20:00:00.000Z',
      },
      machines: [],
      activeRunExists: false,
      rows: [
        {
          orderDemandId: id(10),
          productionOrderId: id(20),
          externalOrderId: 'expected',
          phase: 'expected',
          dueAt: new Date('2026-07-18T12:00:00.000Z'),
          estimatedWeightLbs: 50,
          priority: false,
          productionStatus: 'intake_pending',
          bagCount: null,
        },
        {
          orderDemandId: id(11),
          productionOrderId: id(21),
          externalOrderId: 'ready',
          phase: 'inbound',
          dueAt: new Date('2026-07-18T13:00:00.000Z'),
          estimatedWeightLbs: 75,
          priority: true,
          productionStatus: 'eligible',
          bagCount: 3,
        },
        {
          orderDemandId: id(12),
          productionOrderId: id(22),
          externalOrderId: 'committed',
          phase: 'post_production',
          dueAt: new Date('2026-07-18T14:00:00.000Z'),
          estimatedWeightLbs: 40,
          priority: false,
          productionStatus: 'scheduled',
          bagCount: 2,
        },
        {
          orderDemandId: id(13),
          productionOrderId: null,
          externalOrderId: 'cancelled-before-intake',
          phase: 'withdrawn',
          dueAt: new Date('2026-07-18T15:00:00.000Z'),
          estimatedWeightLbs: 30,
          priority: false,
          productionStatus: null,
          bagCount: null,
        },
        {
          orderDemandId: id(15),
          productionOrderId: id(25),
          externalOrderId: 'finished-history',
          phase: 'production_released',
          dueAt: new Date('2026-07-17T18:00:00.000Z'),
          estimatedWeightLbs: 2_410,
          priority: false,
          productionStatus: 'finished',
          bagCount: 100,
        },
        {
          orderDemandId: id(14),
          productionOrderId: id(24),
          externalOrderId: 'outside-horizon',
          phase: 'expected',
          dueAt: new Date('2026-07-19T04:00:00.000Z'),
          estimatedWeightLbs: 60,
          priority: false,
          productionStatus: 'intake_pending',
          bagCount: null,
        },
      ],
      scheduler: { forecastDemand },
    });

    expect(outlook).toMatchObject({
      horizonCutoffAt: new Date('2026-07-19T04:00:00.000Z'),
      totalOrderCount: 3,
      totalEstimatedWeightLbs: 165,
      estimateMissingOrderCount: 0,
      expectedOrderCount: 1,
      expectedEstimatedWeightLbs: 50,
      readyOrderCount: 1,
      readyEstimatedWeightLbs: 75,
      inProductionOrderCount: 1,
      inProductionEstimatedWeightLbs: 40,
      forecast: emptyForecast,
    });
    expect(outlook.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalOrderId: 'finished-history' }),
      ]),
    );
    expect(forecastDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        demand: [
          expect.objectContaining({
            id: id(10),
            disposition: 'expected',
          }),
          expect.objectContaining({ id: id(11), disposition: 'ready' }),
        ],
      }),
    );
  });

  it('does not forecast across an active production run', () => {
    const forecastDemand = vi.fn(() => emptyForecast);
    const outlook = projectDemandOutlook({
      shift: {
        id: id(1),
        locationId: 'location-1',
        startsAt: new Date('2026-07-18T03:00:00.000Z'),
        endsAt: new Date('2026-07-18T10:00:00.000Z'),
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        status: 'open',
        version: 1,
      },
      config: null,
      machines: [],
      activeRunExists: true,
      rows: [],
      scheduler: { forecastDemand },
    });

    expect(outlook.forecast).toBeNull();
    expect(forecastDemand).not.toHaveBeenCalled();
  });
});
