import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { projectRemainingDayForecast } from './project.ts';
import type {
  OnlinePlacementInput,
  RemainingDayForecastDemandRow,
  RemainingDayForecastReadModel,
} from './types.ts';

const id = (suffix: number): string =>
  `75000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const asOf = new Date('2026-03-08T15:00:00.000Z');
const row = (
  suffix: number,
  overrides: Partial<RemainingDayForecastDemandRow> = {},
): RemainingDayForecastDemandRow => ({
  orderDemandId: id(suffix),
  productionOrderId: null,
  displayReference: `ORDER-${suffix}`,
  admissionState: 'unreleased',
  phase: 'expected',
  dueAt: new Date(
    `2026-03-08T${String(10 + suffix).padStart(2, '0')}:00:00.000Z`,
  ),
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
});

const readModel = (): RemainingDayForecastReadModel => ({
  locationId: 'location-1',
  timezone: 'America/New_York',
  serviceDay: '2026-03-08',
  startsAt: new Date('2026-03-08T05:00:00.000Z'),
  endsAt: new Date('2026-03-09T04:00:00.000Z'),
  asOf,
  shifts: [
    {
      productionShiftId: id(90),
      startsAt: new Date('2026-03-08T12:00:00.000Z'),
      endsAt: new Date('2026-03-08T22:00:00.000Z'),
      status: 'open',
      activeRunId: id(91),
    },
  ],
  activeRuns: [
    {
      run: {
        id: id(91),
        queueVersion: 3,
        startsAt: '2026-03-08T12:00:00.000Z',
        shiftEndsAt: '2026-03-08T22:00:00.000Z',
        pulseMinutes: 30,
        pulseCapacityLbs: 100,
      },
      machines: [],
      batches: [],
    },
  ],
  demandRows: [
    row(1, {
      productionOrderId: id(51),
      displayReference: 'IN-PRODUCTION',
      admissionState: 'released',
      phase: 'production_released',
      estimatedWeightLbs: 25,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 25,
      bagCount: 2,
      productionOrderVersion: 2,
      activePlacement: {
        productionRunId: id(91),
        productionBatchId: id(92),
      },
    }),
    row(2, {
      productionOrderId: id(52),
      displayReference: 'READY',
      admissionState: 'released',
      phase: 'production_released',
      estimatedWeightLbs: 30,
      priority: true,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 30,
      bagCount: 1,
      productionOrderVersion: 4,
    }),
    row(3, {
      displayReference: 'NOT-ADMITTED-MISSING',
      estimatedWeightLbs: null,
    }),
    row(4, {
      displayReference: 'AWAITING-INTAKE-PREADMISSION',
      phase: 'production_released',
    }),
    row(5, {
      productionOrderId: id(55),
      displayReference: 'AWAITING-RELEASE',
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 15,
      productionOrderVersion: 1,
    }),
    row(6, {
      productionOrderId: id(56),
      displayReference: 'AWAITING-INTAKE',
      admissionState: 'released',
      phase: 'production_released',
      operationalStatus: 'intake_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 20,
      productionOrderVersion: 1,
    }),
    row(7, {
      productionOrderId: id(57),
      displayReference: 'FINISHED',
      admissionState: 'released',
      phase: 'production_released',
      operationalStatus: 'finished',
      executionStatus: 'finished',
      derivedWeightLbs: 40,
      bagCount: 2,
      productionOrderVersion: 3,
    }),
  ],
});

const accepted = (input: OnlinePlacementInput) => ({
  kind: 'proposed' as const,
  affectedFromSequence: 0,
  affectedBatches: [
    {
      sourceBatchId: null,
      sequence: 0,
      status: 'queued' as const,
      membershipFrozen: false,
      orderIds: [input.order.id],
      priorityOrderIds: [input.order.id],
      derivedWeightLbs: input.order.derivedWeightLbs,
      bagCount: input.order.bagCount,
      stages: [],
    },
  ],
  overtime: { required: false },
});

describe('remaining-day lifecycle projector', () => {
  it('partitions every unfinished row exactly once with exact assumptions and summaries', () => {
    const projected = projectRemainingDayForecast({
      readModel: readModel(),
      asOf,
      policy: productionRules,
      scheduler: { proposeOnlinePlacement: accepted },
    });
    expect(projected.kind).toBe('success');
    if (projected.kind !== 'success') return;
    expect(projected.value).toMatchObject({
      window: {
        startsAt: '2026-03-08T05:00:00.000Z',
        endsAt: '2026-03-09T04:00:00.000Z',
      },
      asOf: asOf.toISOString(),
      assumptions: {
        algorithmVersion: 'online-stable-insertion-v1',
        overdueUnfinishedIncluded: true,
        placementRevalidatedOnCommit: true,
      },
      totals: {
        all: {
          orderCount: 6,
          knownWeightLbs: 85,
          missingEstimateOrderCount: 1,
        },
        inProduction: { orderCount: 1, knownWeightLbs: 25 },
        readyToPlace: { orderCount: 1, knownWeightLbs: 30 },
        expectedLater: {
          orderCount: 4,
          knownWeightLbs: 30,
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
    });
    expect(
      Object.values(projected.value.groups)
        .flat()
        .map((item) => item.externalOrderId),
    ).toEqual([
      'IN-PRODUCTION',
      'READY',
      'NOT-ADMITTED-MISSING',
      'AWAITING-INTAKE-PREADMISSION',
      'AWAITING-RELEASE',
      'AWAITING-INTAKE',
    ]);
    expect(
      projected.value.groups.expectedLater.map((item) => ({
        externalOrderId: item.externalOrderId,
        readiness: item.readiness,
        action: item.actionability.action,
      })),
    ).toEqual([
      {
        externalOrderId: 'NOT-ADMITTED-MISSING',
        readiness: 'not_admitted',
        action: 'monitor',
      },
      {
        externalOrderId: 'AWAITING-INTAKE-PREADMISSION',
        readiness: 'awaiting_intake',
        action: 'monitor',
      },
      {
        externalOrderId: 'AWAITING-RELEASE',
        readiness: 'awaiting_release',
        action: 'release_to_production',
      },
      {
        externalOrderId: 'AWAITING-INTAKE',
        readiness: 'awaiting_intake',
        action: 'record_intake',
      },
    ]);
  });

  it('returns the exact typed execution-state conflict', () => {
    const model = readModel();
    const invalid = {
      ...model,
      demandRows: [
        row(1, {
          productionOrderId: id(51),
          operationalStatus: 'eligible',
          executionStatus: 'invalid',
          derivedWeightLbs: 10,
          bagCount: 1,
          productionOrderVersion: 1,
        }),
      ],
    };
    expect(
      projectRemainingDayForecast({
        readModel: invalid,
        asOf,
        policy: productionRules,
        scheduler: { proposeOnlinePlacement: accepted },
      }),
    ).toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_order_execution_state_invalid',
        kind: 'conflict',
      },
    });
  });
});
