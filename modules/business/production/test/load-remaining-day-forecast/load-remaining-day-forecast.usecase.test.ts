import { productionRemainingDayForecastSchema } from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  RemainingDayForecastDemandRow,
  RemainingDayForecastReadModel,
} from '../../src/load-remaining-day-forecast/load-remaining-day-forecast.port.ts';
import { makeLoadRemainingDayForecast } from '../../src/load-remaining-day-forecast/load-remaining-day-forecast.usecase.ts';
import { allowPolicy } from '../support/production.fake.ts';

const ids = {
  shift: '00000000-0000-4000-8000-000000000001',
  run: '00000000-0000-4000-8000-000000000002',
  batch: '00000000-0000-4000-8000-000000000003',
  activeDemand: '00000000-0000-4000-8000-000000000004',
  activeOrder: '00000000-0000-4000-8000-000000000005',
  finishedDemand: '00000000-0000-4000-8000-000000000006',
  finishedOrder: '00000000-0000-4000-8000-000000000007',
  readyDemand: '00000000-0000-4000-8000-000000000008',
  readyOrder: '00000000-0000-4000-8000-000000000009',
  releaseDemand: '00000000-0000-4000-8000-000000000010',
  releaseOrder: '00000000-0000-4000-8000-000000000011',
  missingDemand: '00000000-0000-4000-8000-000000000012',
} as const;

const asOf = new Date('2026-07-26T15:00:00.000Z');

const row = (
  input: Partial<RemainingDayForecastDemandRow> &
    Pick<RemainingDayForecastDemandRow, 'orderDemandId' | 'displayReference'>,
): RemainingDayForecastDemandRow => {
  const { orderDemandId, displayReference, ...overrides } = input;
  return {
    orderDemandId,
    productionOrderId: null,
    displayReference,
    admissionState: 'released',
    phase: 'production_released',
    dueAt: new Date('2026-07-26T20:00:00.000Z'),
    estimatedWeightLbs: 10,
    priority: false,
    operationalStatus: null,
    executionStatus: null,
    admissionOverride: null,
    derivedWeightLbs: null,
    bagCount: null,
    productionOrderVersion: null,
    activePlacement: null,
    ...overrides,
  };
};

const readModel = (): RemainingDayForecastReadModel => ({
  locationId: 'location-1',
  timezone: 'America/New_York',
  serviceDay: '2026-07-26',
  startsAt: new Date('2026-07-26T04:00:00.000Z'),
  endsAt: new Date('2026-07-27T04:00:00.000Z'),
  asOf,
  shifts: [
    {
      productionShiftId: ids.shift,
      startsAt: new Date('2026-07-26T12:00:00.000Z'),
      endsAt: new Date('2026-07-26T22:00:00.000Z'),
      status: 'open',
      activeRunId: ids.run,
    },
  ],
  activeRuns: [
    {
      run: {
        id: ids.run,
        queueVersion: 4,
        startsAt: '2026-07-26T12:00:00.000Z',
        shiftEndsAt: '2026-07-26T22:00:00.000Z',
        pulseMinutes: 56,
        pulseCapacityLbs: 100,
      },
      machines: [],
      batches: [],
    },
  ],
  demandRows: [
    row({
      orderDemandId: ids.activeDemand,
      productionOrderId: ids.activeOrder,
      displayReference: 'ACTIVE',
      estimatedWeightLbs: 40,
      operationalStatus: 'scheduled',
      executionStatus: null,
      derivedWeightLbs: 40,
      bagCount: 2,
      productionOrderVersion: 2,
      activePlacement: {
        productionRunId: ids.run,
        productionBatchId: ids.batch,
      },
    }),
    row({
      orderDemandId: ids.finishedDemand,
      productionOrderId: ids.finishedOrder,
      displayReference: 'FINISHED',
      estimatedWeightLbs: 50,
      operationalStatus: 'finished',
      executionStatus: 'finished',
      derivedWeightLbs: 50,
      bagCount: 2,
      productionOrderVersion: 3,
    }),
    row({
      orderDemandId: ids.readyDemand,
      productionOrderId: ids.readyOrder,
      displayReference: 'READY',
      estimatedWeightLbs: 30,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 30,
      bagCount: 1,
      productionOrderVersion: 4,
      priority: true,
    }),
    row({
      orderDemandId: ids.releaseDemand,
      productionOrderId: ids.releaseOrder,
      displayReference: 'RELEASE',
      admissionState: 'unreleased',
      phase: 'expected',
      estimatedWeightLbs: 20,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 20,
      bagCount: null,
      productionOrderVersion: 1,
    }),
    row({
      orderDemandId: ids.missingDemand,
      displayReference: 'MISSING',
      admissionState: 'unreleased',
      phase: 'expected',
      estimatedWeightLbs: null,
    }),
  ],
});

describe('load remaining-day forecast', () => {
  it('projects authoritative execution, ready placement, and non-executable expected work', async () => {
    const snapshot = readModel();
    const load = vi.fn(async () => snapshot);
    const project = vi.fn(() => ({
      algorithmVersion: 'online-stable-insertion-v1' as const,
      decisions: [
        {
          productionOrderId: ids.readyOrder,
          disposition: 'ready_to_place' as const,
          reason: null,
        },
      ],
    }));
    const forecast = makeLoadRemainingDayForecast({
      repo: { load },
      clock: { now: () => asOf },
      policy: allowPolicy,
      project,
    });

    const first = await forecast({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
    });
    const second = await forecast({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      tag: 'ok',
      value: {
        assumptions: {
          algorithmVersion: 'online-stable-insertion-v1',
          preciseFinishForecasted: false,
        },
        totals: {
          all: {
            orderCount: 4,
            knownWeightLbs: 90,
            missingEstimateOrderCount: 1,
          },
          inProduction: { orderCount: 1, knownWeightLbs: 40 },
          readyToPlace: { orderCount: 1, knownWeightLbs: 30 },
          expectedLater: {
            orderCount: 2,
            knownWeightLbs: 20,
            missingEstimateOrderCount: 1,
          },
          needsShift: { orderCount: 0 },
        },
        capacityRisk: {
          level: 'attention',
          reasons: [
            'all_ready_work_appendable',
            'expected_later',
            'missing_estimates',
          ],
          pulseCapacityLbs: 100,
        },
        groups: {
          inProduction: [
            {
              externalOrderId: 'ACTIVE',
              activeRunId: ids.run,
              activeBatchId: ids.batch,
              actionability: { action: 'open_production' },
            },
          ],
          readyToPlace: [
            {
              externalOrderId: 'READY',
              activeRunId: ids.run,
              actionability: { action: 'place_in_active_run' },
            },
          ],
          expectedLater: [
            {
              externalOrderId: 'RELEASE',
              readiness: 'awaiting_release',
              actionability: { action: 'release_to_production' },
            },
            {
              externalOrderId: 'MISSING',
              readiness: 'not_admitted',
              estimatedWeightLbs: null,
              actionability: {
                action: 'monitor',
                reason: 'missing_estimate',
              },
            },
          ],
          needsShift: [],
        },
      },
    });
    if (first.tag !== 'ok') return;
    expect(
      productionRemainingDayForecastSchema.safeParse(first.value).success,
    ).toBe(true);
    expect(
      first.value.groups.inProduction.some(
        (item) => item.externalOrderId === 'FINISHED',
      ),
    ).toBe(false);
    expect(project).toHaveBeenCalledWith({
      activeRuns: snapshot.activeRuns,
      readyOrders: [
        {
          id: ids.readyOrder,
          dueAt: '2026-07-26T20:00:00.000Z',
          priority: true,
          derivedWeightLbs: 30,
          bagCount: 1,
          version: 4,
        },
      ],
    });
    expect(load).toHaveBeenCalledWith({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
      asOf,
      rowLimit: 500,
    });
  });

  it('keeps non-fitting ready work unassigned without fabricating a shift or completion', async () => {
    const snapshot = readModel();
    const forecast = makeLoadRemainingDayForecast({
      repo: { load: async () => ({ ...snapshot, activeRuns: [] }) },
      clock: { now: () => asOf },
      policy: allowPolicy,
      project: () => ({
        algorithmVersion: 'online-stable-insertion-v1',
        decisions: [
          {
            productionOrderId: ids.readyOrder,
            disposition: 'needs_shift',
            reason: 'no_active_run',
          },
        ],
      }),
    });

    const output = await forecast({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
    });

    expect(output).toMatchObject({
      tag: 'ok',
      value: {
        capacityRisk: {
          level: 'unknown',
          reasons: [
            'needs_shift',
            'expected_later',
            'missing_estimates',
            'no_active_run',
          ],
          pulseCapacityLbs: null,
        },
        groups: {
          readyToPlace: [],
          needsShift: [
            {
              productionOrderId: ids.readyOrder,
              activeRunId: null,
              reason: 'no_active_run',
              actionability: {
                action: 'plan_shift',
                reason: 'no_active_run',
              },
            },
          ],
        },
      },
    });
    if (output.tag !== 'ok') return;
    expect(JSON.stringify(output.value)).not.toMatch(
      /projectedCompletion|completesAt|overtimeMinutes|proposedBatch/,
    );
  });

  it.each([
    {
      repositoryValue: null,
      code: 'production_location_not_found',
      status: 404,
    },
    {
      repositoryValue: 'scope_too_large' as const,
      code: 'production_forecast_scope_too_large',
      status: 409,
    },
    {
      repositoryValue: 'invalid_service_day' as const,
      code: 'production_forecast_service_day_invalid',
      status: 400,
    },
  ])(
    'maps bounded repository result $repositoryValue to $code',
    async ({ repositoryValue, code, status }) => {
      const forecast = makeLoadRemainingDayForecast({
        repo: { load: async () => repositoryValue },
        clock: { now: () => asOf },
        policy: allowPolicy,
        project: vi.fn(),
      });

      await expect(
        forecast({
          locationId: 'location-1',
          serviceDay: '2026-07-26',
        }),
      ).resolves.toMatchObject({
        tag: 'err',
        error: { code, status },
      });
    },
  );
});
