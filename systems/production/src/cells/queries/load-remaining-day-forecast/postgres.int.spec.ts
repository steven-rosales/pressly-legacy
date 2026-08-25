import { invariantViolationError } from '@pressly/errors/factories';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { makeExecuteLoadRemainingDayForecast } from './execute.ts';
import { makeLoadRemainingDayForecastPostgresRepository } from './postgres.ts';
import type {
  OnlinePlacementInput,
  OnlinePlacementResult,
  RemainingDayForecastScheduler,
} from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_remaining_day_forecast_cell_test',
  ),
  tableNames: [
    'stage_machine_assignments',
    'production_machines',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_stations',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 6,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const uuid = (suffix: number, prefix = 76000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const ids = {
  business: '00000000-0000-4000-8000-000000000760',
  actor: uuid(1),
  shift: uuid(2),
  config: uuid(3),
  schedule: uuid(4),
  run: uuid(5),
  batch0: uuid(6),
  batch1: uuid(7),
  sortingStation: uuid(8),
  washingStation: uuid(9),
  dryingStation: uuid(10),
  foldingStation: uuid(11),
  washerA: uuid(12),
  washerB: uuid(13),
  dryerA: uuid(14),
  activeA: uuid(101),
  activeB: uuid(102),
  ready: uuid(103),
  rejected: uuid(104),
  release: uuid(105),
  intake: uuid(106),
  finished: uuid(107),
  resolved: uuid(108),
} as const;
const locationId = 'location-remaining-forecast';
const inactiveLocationId = 'location-remaining-forecast-inactive';
const siblingLocationId = 'location-remaining-forecast-sibling';
const asOf = new Date('2026-03-08T15:00:00.000Z');
const serviceDay = '2026-03-08';
const windowEnd = new Date('2026-03-09T04:00:00.000Z');

const seedRoots = async () => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Remaining Forecast Facility',
      timezone: 'America/New_York',
    },
    {
      id: inactiveLocationId,
      businessId: ids.business,
      name: 'Inactive Remaining Forecast Facility',
      timezone: 'America/New_York',
      isActive: false,
    },
    {
      id: siblingLocationId,
      businessId: ids.business,
      name: 'Sibling Remaining Forecast Facility',
      timezone: 'America/Chicago',
    },
  ]);
};

type DemandInput = Readonly<{
  ordinal: number;
  display: string;
  dueAt: Date;
  location?: string;
  phase?: 'expected' | 'inbound' | 'production_released' | 'post_production';
  admission?: 'unreleased' | 'released' | 'withdrawn';
  estimatedWeightLbs?: number | null;
  productionOrderId?: string;
  operationalStatus?:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  executionStatus?: 'unassigned' | 'scheduled' | 'finished';
  resolutionState?: 'open' | 'resolved_without_production';
  derivedWeightLbs?: number;
  bagCount?: number | null;
  priority?: boolean;
}>;

const seedDemand = async (input: DemandInput) => {
  const location = input.location ?? locationId;
  const fulfillmentId = uuid(input.ordinal, 76200000);
  const demandId = uuid(input.ordinal, 76300000);
  const estimate =
    input.estimatedWeightLbs === undefined ? 10 : input.estimatedWeightLbs;
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: demandId,
    fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: input.admission ?? 'unreleased',
    commercialState: 'open',
    displayReference: input.display,
    locationId: location,
    revisionAt: input.dueAt,
    phase: input.phase ?? 'expected',
    estimatedWeightLbs: estimate,
    estimatedWeightSource: estimate === null ? null : 'test',
    dueAt: input.dueAt,
  });
  if (input.productionOrderId === undefined)
    return { orderDemandId: demandId, productionOrderId: null };

  const resolution = input.resolutionState ?? 'open';
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: demandId,
    locationId: location,
    dueAt: input.dueAt,
    operationalStatus: input.operationalStatus ?? 'eligible',
    executionStatus: input.executionStatus ?? 'unassigned',
    resolutionState: resolution,
    ...(resolution === 'resolved_without_production'
      ? {
          resolvedAt: asOf,
          resolvedBy: ids.actor,
          resolutionReason: 'processor_not_in_use',
        }
      : {}),
    derivedWeightLbs: input.derivedWeightLbs ?? estimate ?? 10,
    bagCount: input.bagCount ?? null,
    ...(input.bagCount === null || input.bagCount === undefined
      ? {}
      : {
          bagCountSource: 'operator_intake',
          intakeRecordedAt: input.dueAt,
          intakeVersion: 1,
        }),
    priority: input.priority ?? false,
    version: 2,
  });
  return {
    orderDemandId: demandId,
    productionOrderId: input.productionOrderId,
  };
};

const requireProductionOrderId = (seeded: {
  productionOrderId: string | null;
}): string => {
  if (seeded.productionOrderId === null) {
    throw invariantViolationError({
      code: 'remaining_day_forecast_test_fixture_invalid',
      message: 'The seeded demand must own a production order.',
    });
  }
  return seeded.productionOrderId;
};

const schedulingInput = (input: {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
  configId: string;
}) => ({
  orders: [],
  machines: [
    {
      id: ids.washerB,
      stationKind: 'washing',
      effectiveCapacityLbs: 60,
      active: true,
    },
    {
      id: ids.washerA,
      stationKind: 'washing',
      effectiveCapacityLbs: 60,
      active: true,
    },
    {
      id: ids.dryerA,
      stationKind: 'drying',
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  shift: {
    id: input.shiftId,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: input.configId,
    pulseMinutes: 30,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
});

const schedulingOutput = (plannedCompletionAt: Date) => ({
  algorithmVersion: 'fixed-pulse-ffd-v2',
  inputSnapshotHash: 'c'.repeat(64),
  outputPlanHash: 'd'.repeat(64),
  canonicalOutput: '{}',
  pulseMinutes: 30,
  pulseCapacityLbs: 100,
  batchCount: 2,
  makespanMinutes: 180,
  plannedCompletionAt: plannedCompletionAt.toISOString(),
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
});

const seedRun = async (input: {
  ordinal?: number;
  shiftId?: string;
  configId?: string;
  scheduleId?: string;
  runId?: string;
  startsAt?: Date;
  endsAt?: Date;
}) => {
  const ordinal = input.ordinal ?? 1;
  const shiftId = input.shiftId ?? ids.shift;
  const configId = input.configId ?? ids.config;
  const scheduleId = input.scheduleId ?? ids.schedule;
  const runId = input.runId ?? ids.run;
  const startsAt = input.startsAt ?? new Date('2026-03-08T12:00:00.000Z');
  const endsAt = input.endsAt ?? new Date('2026-03-08T22:00:00.000Z');
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: shiftId,
    locationId,
    startsAt,
    endsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: configId,
    locationId,
    pulseMinutes: 30,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: ordinal,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: ids.actor,
    publishedAt: startsAt,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: scheduleId,
    locationId,
    productionShiftId: shiftId,
    schedulerConfigId: configId,
    status: 'accepted',
    inputSnapshot: schedulingInput({ shiftId, startsAt, endsAt, configId }),
    inputSnapshotHash: 'c'.repeat(64),
    outputPlan: schedulingOutput(endsAt),
    outputPlanHash: 'd'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 180,
    plannedCompletionAt: endsAt,
    acceptedAt: startsAt,
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: runId,
    locationId,
    productionShiftId: shiftId,
    scheduleRunId: scheduleId,
    status: 'started',
    startedAt: startsAt,
    queueVersion: ordinal,
    plannedCompletionAt: endsAt,
  });
  return { shiftId, configId, scheduleId, runId, startsAt, endsAt };
};

const acceptedPlacement = (
  input: OnlinePlacementInput,
): OnlinePlacementResult =>
  input.order.derivedWeightLbs > input.run.pulseCapacityLbs
    ? { kind: 'rejected' }
    : {
        kind: 'proposed',
        affectedFromSequence: input.batches.length,
        affectedBatches: [
          {
            sourceBatchId: null,
            sequence: input.batches.length,
            status: 'queued',
            membershipFrozen: false,
            orderIds: [input.order.id],
            priorityOrderIds: input.order.priority ? [input.order.id] : [],
            derivedWeightLbs: input.order.derivedWeightLbs,
            bagCount: input.order.bagCount,
            stages: [],
          },
        ],
        overtime: { required: false },
      };

const scheduler = (): RemainingDayForecastScheduler => ({
  proposeOnlinePlacement: acceptedPlacement,
});

const seedFloorGraph = async () => {
  await seedRun({});
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: ids.batch1,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 20,
      pulseMinutes: 30,
      plannedDoneAt: new Date('2026-03-08T16:00:00.000Z'),
    },
    {
      id: ids.batch0,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 40,
      pulseMinutes: 30,
      plannedDoneAt: new Date('2026-03-08T15:30:00.000Z'),
    },
  ]);
  await database.db.insert(productionTestSchema.stations).values([
    {
      id: ids.sortingStation,
      locationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    },
    {
      id: ids.washingStation,
      locationId,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
    },
    {
      id: ids.dryingStation,
      locationId,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 3,
    },
    {
      id: ids.foldingStation,
      locationId,
      kind: 'folding_packaging',
      label: 'Folding',
      sortOrder: 4,
    },
  ]);
  await database.db.insert(productionTestSchema.machines).values([
    {
      id: ids.washerB,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer B',
      effectiveCapacityLbs: 60,
    },
    {
      id: ids.washerA,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer A',
      effectiveCapacityLbs: 60,
    },
    {
      id: ids.dryerA,
      locationId,
      stationId: ids.dryingStation,
      label: 'Dryer A',
      effectiveCapacityLbs: 100,
    },
  ]);
  const stageKinds = [
    ['sorting', ids.sortingStation],
    ['washing', ids.washingStation],
    ['drying', ids.dryingStation],
    ['folding_packaging', ids.foldingStation],
  ] as const;
  const stages = [ids.batch1, ids.batch0].flatMap((batchId, batchIndex) =>
    [...stageKinds].reverse().map(([stageKind, stationId], reverseIndex) => {
      const stageIndex = 3 - reverseIndex;
      const startsAt = new Date(
        Date.parse('2026-03-08T12:00:00.000Z') +
          (batchIndex + stageIndex) * 30 * 60_000,
      );
      return {
        id: uuid(batchIndex * 10 + stageIndex + 201),
        locationId,
        productionBatchId: batchId,
        stationId,
        stageKind,
        status: 'planned',
        plannedStartAt: startsAt,
        plannedEndAt: new Date(startsAt.getTime() + 30 * 60_000),
      };
    }),
  );
  await database.db.insert(productionTestSchema.stageRuns).values(stages);
  const batch0Washing = stages.find(
    (stage) =>
      stage.productionBatchId === ids.batch0 && stage.stageKind === 'washing',
  );
  if (batch0Washing === undefined) return;
  await database.db
    .insert(productionTestSchema.stageMachineAssignments)
    .values([
      {
        id: uuid(301),
        locationId,
        stageRunId: batch0Washing.id,
        machineId: ids.washerB,
        plannedStartAt: batch0Washing.plannedStartAt,
        plannedEndAt: batch0Washing.plannedEndAt,
        status: 'planned',
      },
      {
        id: uuid(302),
        locationId,
        stageRunId: batch0Washing.id,
        machineId: ids.washerA,
        plannedStartAt: batch0Washing.plannedStartAt,
        plannedEndAt: batch0Washing.plannedEndAt,
        status: 'planned',
      },
    ]);
};

const durableState = async () => {
  const [
    locations,
    demands,
    productionOrders,
    shifts,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    stations,
    machines,
    stages,
    assignments,
  ] = await Promise.all([
    database.db.select().from(productionTestSchema.productionLocations),
    database.db.select().from(productionTestSchema.orderDemands),
    database.db.select().from(productionTestSchema.productionOrders),
    database.db.select().from(productionTestSchema.productionShifts),
    database.db.select().from(productionTestSchema.schedulerConfigs),
    database.db.select().from(productionTestSchema.scheduleRuns),
    database.db.select().from(productionTestSchema.productionRuns),
    database.db.select().from(productionTestSchema.productionBatches),
    database.db.select().from(productionTestSchema.productionBatchOrders),
    database.db.select().from(productionTestSchema.stations),
    database.db.select().from(productionTestSchema.machines),
    database.db.select().from(productionTestSchema.stageRuns),
    database.db.select().from(productionTestSchema.stageMachineAssignments),
  ]);
  return {
    locations,
    demands,
    productionOrders,
    shifts,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    stations,
    machines,
    stages,
    assignments,
  };
};

describe('load remaining-day forecast native Postgres query', () => {
  it('preserves spring/fall service days and missing or inactive location distinctions', async () => {
    await seedRoots();
    const repo = makeLoadRemainingDayForecastPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    for (const [day, startsAt, endsAt] of [
      [
        '2026-03-08',
        new Date('2026-03-08T05:00:00.000Z'),
        new Date('2026-03-09T04:00:00.000Z'),
      ],
      [
        '2026-11-01',
        new Date('2026-11-01T04:00:00.000Z'),
        new Date('2026-11-02T05:00:00.000Z'),
      ],
    ] as const)
      await expect(
        repo.load({
          locationId,
          serviceDay: day,
          asOf,
          rowLimit: 500,
        }),
      ).resolves.toEqual({
        locationId,
        timezone: 'America/New_York',
        serviceDay: day,
        startsAt,
        endsAt,
        asOf,
        demandRows: [],
        shifts: [],
        activeRuns: [],
      });
    await expect(
      repo.load({
        locationId,
        serviceDay: '2026-02-30',
        asOf,
        rowLimit: 500,
      }),
    ).resolves.toBe('invalid_service_day');
    for (const missing of ['missing-location', inactiveLocationId])
      await expect(
        repo.load({
          locationId: missing,
          serviceDay,
          asOf,
          rowLimit: 500,
        }),
      ).resolves.toBeNull();
  });

  it('loads ordered floor facts, merges outside-window placements, and partitions read-only state', async () => {
    await seedRoots();
    await seedFloorGraph();
    const activeA = await seedDemand({
      ordinal: 1,
      display: 'ACTIVE-A-OUTSIDE',
      dueAt: new Date('2026-03-10T15:00:00.000Z'),
      phase: 'post_production',
      admission: 'released',
      productionOrderId: ids.activeA,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 20,
      bagCount: 1,
    });
    const activeB = await seedDemand({
      ordinal: 2,
      display: 'ACTIVE-B-OUTSIDE',
      dueAt: new Date('2026-03-10T15:00:00.000Z'),
      phase: 'post_production',
      admission: 'released',
      productionOrderId: ids.activeB,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 20,
      bagCount: 1,
    });
    await seedDemand({
      ordinal: 3,
      display: 'READY-OVERDUE',
      dueAt: new Date('2026-03-07T20:00:00.000Z'),
      phase: 'production_released',
      admission: 'released',
      productionOrderId: ids.ready,
      operationalStatus: 'eligible',
      derivedWeightLbs: 30,
      bagCount: 1,
      priority: true,
    });
    await seedDemand({
      ordinal: 4,
      display: 'REJECTED-READY',
      dueAt: new Date('2026-03-08T18:00:00.000Z'),
      phase: 'production_released',
      admission: 'released',
      estimatedWeightLbs: 120,
      productionOrderId: ids.rejected,
      operationalStatus: 'eligible',
      derivedWeightLbs: 120,
      bagCount: 2,
    });
    await seedDemand({
      ordinal: 5,
      display: 'EXPECTED-MISSING',
      dueAt: new Date('2026-03-08T19:00:00.000Z'),
      estimatedWeightLbs: null,
    });
    await seedDemand({
      ordinal: 6,
      display: 'EXPECTED-INBOUND',
      dueAt: new Date('2026-03-08T20:00:00.000Z'),
      phase: 'inbound',
    });
    await seedDemand({
      ordinal: 7,
      display: 'AWAITING-INTAKE',
      dueAt: new Date('2026-03-08T21:00:00.000Z'),
      phase: 'production_released',
      admission: 'released',
      productionOrderId: ids.intake,
      operationalStatus: 'intake_pending',
      derivedWeightLbs: 15,
    });
    await seedDemand({
      ordinal: 8,
      display: 'AWAITING-RELEASE',
      dueAt: new Date('2026-03-08T22:00:00.000Z'),
      productionOrderId: ids.release,
      operationalStatus: 'release_pending',
      derivedWeightLbs: 10,
    });
    await seedDemand({
      ordinal: 9,
      display: 'FINISHED',
      dueAt: new Date('2026-03-08T23:00:00.000Z'),
      phase: 'production_released',
      admission: 'released',
      productionOrderId: ids.finished,
      operationalStatus: 'finished',
      executionStatus: 'finished',
      derivedWeightLbs: 25,
      bagCount: 1,
    });
    await seedDemand({
      ordinal: 10,
      display: 'RESOLVED',
      dueAt: new Date('2026-03-09T00:00:00.000Z'),
      productionOrderId: ids.resolved,
      resolutionState: 'resolved_without_production',
      derivedWeightLbs: 10,
    });
    await seedDemand({
      ordinal: 11,
      display: 'AT-END-EXCLUDED',
      dueAt: windowEnd,
    });
    await seedDemand({
      ordinal: 12,
      display: 'CROSS-LOCATION',
      dueAt: new Date('2026-03-08T18:00:00.000Z'),
      location: siblingLocationId,
    });
    await database.db
      .insert(productionTestSchema.productionBatchOrders)
      .values([
        {
          id: uuid(401),
          locationId,
          productionBatchId: ids.batch0,
          productionOrderId: requireProductionOrderId(activeB),
          active: true,
          placementProvenance: 'initial_schedule',
          placedAt: asOf,
        },
        {
          id: uuid(402),
          locationId,
          productionBatchId: ids.batch0,
          productionOrderId: requireProductionOrderId(activeA),
          active: true,
          placementProvenance: 'initial_schedule',
          placedAt: asOf,
        },
      ]);
    await database.db.insert(productionTestSchema.productionShifts).values({
      id: uuid(450),
      locationId,
      startsAt: new Date('2026-03-08T10:00:00.000Z'),
      endsAt: new Date('2026-03-08T11:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'draft',
      effectiveFolderCount: 1,
    });

    const before = await durableState();
    const postgres = makeLoadRemainingDayForecastPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const raw = await postgres.load({
      locationId,
      serviceDay,
      asOf,
      rowLimit: 500,
    });
    expect(raw).not.toBeNull();
    expect(raw).not.toBe('invalid_service_day');
    expect(raw).not.toBe('scope_too_large');
    if (
      raw === null ||
      raw === 'invalid_service_day' ||
      raw === 'scope_too_large'
    )
      return;
    expect(raw.shifts.map((shift) => shift.productionShiftId)).toEqual([
      uuid(450),
      ids.shift,
    ]);
    expect(raw.activeRuns.map((active) => active.run.id)).toEqual([ids.run]);
    expect(raw.activeRuns[0]?.batches.map((batch) => batch.id)).toEqual([
      ids.batch0,
      ids.batch1,
    ]);
    expect(raw.activeRuns[0]?.batches[0]?.orderIds).toEqual([
      ids.activeA,
      ids.activeB,
    ]);
    expect(
      raw.activeRuns[0]?.batches[0]?.stages.map((stage) => stage.stage),
    ).toEqual(['sorting', 'washing', 'drying', 'folding_packaging']);
    expect(
      raw.activeRuns[0]?.batches[0]?.stages.find(
        (stage) => stage.stage === 'washing',
      )?.machineIds,
    ).toEqual([ids.washerA, ids.washerB]);
    expect(raw.demandRows.map((row) => row.displayReference)).toEqual([
      'READY-OVERDUE',
      'REJECTED-READY',
      'EXPECTED-MISSING',
      'EXPECTED-INBOUND',
      'AWAITING-INTAKE',
      'AWAITING-RELEASE',
      'FINISHED',
      'ACTIVE-A-OUTSIDE',
      'ACTIVE-B-OUTSIDE',
    ]);

    const trace: string[] = [];
    const load = vi.fn(async (request) => {
      trace.push('read');
      const loaded = await postgres.load(request);
      trace.push('read-complete');
      return loaded;
    });
    const clock = vi.fn(() => {
      trace.push('clock');
      return asOf;
    });
    const execute = makeExecuteLoadRemainingDayForecast({
      repo: { load },
      clock: { now: clock },
      policy: productionRules,
      scheduler: scheduler(),
    });
    const outcome = await execute({ locationId, serviceDay });
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.value).toMatchObject({
      window: {
        startsAt: '2026-03-08T05:00:00.000Z',
        endsAt: '2026-03-09T04:00:00.000Z',
      },
      asOf: asOf.toISOString(),
      assumptions: {
        overdueUnfinishedIncluded: true,
        placementRevalidatedOnCommit: true,
      },
      groups: {
        inProduction: [
          { externalOrderId: 'ACTIVE-A-OUTSIDE' },
          { externalOrderId: 'ACTIVE-B-OUTSIDE' },
        ],
        readyToPlace: [{ externalOrderId: 'READY-OVERDUE' }],
        expectedLater: [
          { externalOrderId: 'EXPECTED-MISSING' },
          { externalOrderId: 'EXPECTED-INBOUND' },
          { externalOrderId: 'AWAITING-INTAKE' },
          { externalOrderId: 'AWAITING-RELEASE' },
        ],
        needsShift: [
          {
            externalOrderId: 'REJECTED-READY',
            reason: 'placement_rejected',
          },
        ],
      },
    });
    expect(trace).toEqual(['clock', 'read', 'read-complete']);
    expect(clock).toHaveBeenCalledOnce();
    expect(await durableState()).toEqual(before);
  });

  it('orders multiple active runs by id independently of insertion order', async () => {
    await seedRoots();
    await seedRun({
      ordinal: 2,
      shiftId: uuid(502),
      configId: uuid(503),
      scheduleId: uuid(504),
      runId: uuid(505),
      startsAt: new Date('2026-03-08T14:00:00.000Z'),
      endsAt: new Date('2026-03-08T23:00:00.000Z'),
    });
    await seedRun({
      ordinal: 1,
      shiftId: uuid(492),
      configId: uuid(493),
      scheduleId: uuid(494),
      runId: uuid(495),
      startsAt: new Date('2026-03-08T13:00:00.000Z'),
      endsAt: new Date('2026-03-08T22:00:00.000Z'),
    });
    const loaded = await makeLoadRemainingDayForecastPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    ).load({ locationId, serviceDay, asOf, rowLimit: 500 });
    expect(loaded).not.toBeNull();
    expect(loaded).not.toBe('scope_too_large');
    expect(loaded).not.toBe('invalid_service_day');
    if (
      loaded === null ||
      loaded === 'scope_too_large' ||
      loaded === 'invalid_service_day'
    )
      return;
    expect(loaded.activeRuns.map((active) => active.run.id)).toEqual([
      uuid(495),
      uuid(505),
    ]);
  });

  it('enforces the actual 500-row demand bound', async () => {
    await seedRoots();
    const count = 501;
    await database.db.insert(productionTestSchema.orderDemands).values(
      Array.from({ length: count }, (_, index) => ({
        id: uuid(index + 1, 77300000),
        fulfillmentId: uuid(index + 1, 77200000),
        fulfillmentVersion: 1,
        projectionHash: 'a'.repeat(64),
        admissionState: 'unreleased',
        commercialState: 'open',
        displayReference: `OVERFLOW-${index}`,
        locationId,
        revisionAt: new Date('2026-03-08T18:00:00.000Z'),
        phase: 'expected',
        estimatedWeightLbs: 10,
        estimatedWeightSource: 'test',
        dueAt: new Date('2026-03-08T18:00:00.000Z'),
      })),
    );
    await expect(
      makeLoadRemainingDayForecastPostgresRepository(
        database.db,
        productionTestSchema,
        productionScopeReconciliationTestCapability(database.db),
      ).load({
        locationId,
        serviceDay,
        asOf,
        rowLimit: 500,
      }),
    ).resolves.toBe('scope_too_large');
  });

  it('permits the relational maximum of four ordered stages per bounded batch', async () => {
    await seedRoots();
    await seedRun({});
    await database.db.insert(productionTestSchema.productionBatches).values({
      id: ids.batch0,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 10,
      pulseMinutes: 30,
      plannedDoneAt: new Date('2026-03-08T16:00:00.000Z'),
    });
    const stageKinds = [
      ['sorting', ids.sortingStation],
      ['washing', ids.washingStation],
      ['drying', ids.dryingStation],
      ['folding_packaging', ids.foldingStation],
    ] as const;
    await database.db.insert(productionTestSchema.stations).values(
      stageKinds.map(([kind, stationId], index) => ({
        id: stationId,
        locationId,
        kind,
        label: `Stage ${index}`,
        sortOrder: index,
      })),
    );
    await database.db.insert(productionTestSchema.stageRuns).values(
      stageKinds.map(([stageKind, stationId], index) => ({
        id: uuid(index + 800),
        locationId,
        productionBatchId: ids.batch0,
        stationId,
        stageKind,
        status: 'planned',
        plannedStartAt: new Date(
          Date.parse('2026-03-08T12:00:00.000Z') + index * 30 * 60_000,
        ),
        plannedEndAt: new Date(
          Date.parse('2026-03-08T12:30:00.000Z') + index * 30 * 60_000,
        ),
      })),
    );

    const loaded = await makeLoadRemainingDayForecastPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    ).load({ locationId, serviceDay, asOf, rowLimit: 1 });
    expect(loaded).not.toBeNull();
    expect(loaded).not.toBe('scope_too_large');
    expect(loaded).not.toBe('invalid_service_day');
    if (
      loaded === null ||
      loaded === 'scope_too_large' ||
      loaded === 'invalid_service_day'
    )
      return;
    expect(loaded.activeRuns[0]?.batches[0]?.stages).toHaveLength(4);
    expect(
      loaded.activeRuns[0]?.batches[0]?.stages.map((stage) => stage.stage),
    ).toEqual(['sorting', 'washing', 'drying', 'folding_packaging']);
  });

  it('enforces the final merged-demand bound after each source stays within its limit', async () => {
    await seedRoots();
    await seedRun({});
    await database.db.insert(productionTestSchema.productionBatches).values({
      id: ids.batch0,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 10,
      pulseMinutes: 30,
      plannedDoneAt: new Date('2026-03-08T16:00:00.000Z'),
    });
    await seedDemand({
      ordinal: 820,
      display: 'IN-WINDOW-DEMAND',
      dueAt: new Date('2026-03-08T17:00:00.000Z'),
    });
    const placedOutsideWindow = await seedDemand({
      ordinal: 821,
      display: 'PLACED-OUTSIDE-WINDOW',
      dueAt: new Date('2026-03-10T17:00:00.000Z'),
      phase: 'post_production',
      admission: 'released',
      productionOrderId: uuid(821),
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      bagCount: 1,
    });
    await database.db
      .insert(productionTestSchema.productionBatchOrders)
      .values({
        id: uuid(822),
        locationId,
        productionBatchId: ids.batch0,
        productionOrderId: requireProductionOrderId(placedOutsideWindow),
        active: true,
        placementProvenance: 'initial_schedule',
      });

    await expect(
      makeLoadRemainingDayForecastPostgresRepository(
        database.db,
        productionTestSchema,
        productionScopeReconciliationTestCapability(database.db),
      ).load({
        locationId,
        serviceDay,
        asOf,
        rowLimit: 1,
      }),
    ).resolves.toBe('scope_too_large');
  });

  it.each(['shift', 'batch', 'membership', 'assignment'] as const)(
    'returns the same typed overflow carrier for %s rows',
    async (kind) => {
      await seedRoots();
      const repo = makeLoadRemainingDayForecastPostgresRepository(
        database.db,
        productionTestSchema,
        productionScopeReconciliationTestCapability(database.db),
      );
      if (kind === 'shift') {
        await database.db.insert(productionTestSchema.productionShifts).values([
          {
            id: uuid(601),
            locationId,
            startsAt: new Date('2026-03-08T10:00:00.000Z'),
            endsAt: new Date('2026-03-08T11:00:00.000Z'),
            timezone: 'America/New_York',
            effectiveFolderCount: 1,
          },
          {
            id: uuid(602),
            locationId,
            startsAt: new Date('2026-03-08T12:00:00.000Z'),
            endsAt: new Date('2026-03-08T13:00:00.000Z'),
            timezone: 'America/New_York',
            effectiveFolderCount: 1,
          },
        ]);
      } else {
        await seedRun({});
        const batches: Array<
          typeof productionTestSchema.productionBatches.$inferInsert
        > = [
          {
            id: ids.batch0,
            locationId,
            productionRunId: ids.run,
            sequenceIndex: 0,
            status: 'queued',
            pulseCapacityLbs: 100,
            derivedWeightLbs: 10,
            pulseMinutes: 30,
            plannedDoneAt: new Date('2026-03-08T16:00:00.000Z'),
          },
          {
            id: ids.batch1,
            locationId,
            productionRunId: ids.run,
            sequenceIndex: 1,
            status: 'queued',
            pulseCapacityLbs: 100,
            derivedWeightLbs: 10,
            pulseMinutes: 30,
            plannedDoneAt: new Date('2026-03-08T16:30:00.000Z'),
          },
        ];
        const firstBatch = batches[0];
        if (firstBatch === undefined) {
          throw invariantViolationError({
            code: 'remaining_day_forecast_test_fixture_invalid',
            message: 'The overflow fixture must contain a first batch.',
          });
        }
        await database.db
          .insert(productionTestSchema.productionBatches)
          .values(kind === 'batch' ? batches : [firstBatch]);
        if (kind === 'membership') {
          const first = await seedDemand({
            ordinal: 701,
            display: 'MEMBERSHIP-1',
            dueAt: new Date('2026-03-10T12:00:00.000Z'),
            productionOrderId: uuid(701),
            operationalStatus: 'scheduled',
            executionStatus: 'scheduled',
            bagCount: 1,
          });
          const second = await seedDemand({
            ordinal: 702,
            display: 'MEMBERSHIP-2',
            dueAt: new Date('2026-03-10T12:00:00.000Z'),
            productionOrderId: uuid(702),
            operationalStatus: 'scheduled',
            executionStatus: 'scheduled',
            bagCount: 1,
          });
          await database.db
            .insert(productionTestSchema.productionBatchOrders)
            .values([
              {
                id: uuid(703),
                locationId,
                productionBatchId: ids.batch0,
                productionOrderId: requireProductionOrderId(first),
                active: true,
                placementProvenance: 'initial_schedule',
              },
              {
                id: uuid(704),
                locationId,
                productionBatchId: ids.batch0,
                productionOrderId: requireProductionOrderId(second),
                active: true,
                placementProvenance: 'initial_schedule',
              },
            ]);
        }
        if (kind === 'assignment') {
          await database.db.insert(productionTestSchema.stations).values({
            id: ids.washingStation,
            locationId,
            kind: 'washing',
            label: 'Washing',
            sortOrder: 1,
          });
          const stageId = uuid(710);
          await database.db.insert(productionTestSchema.stageRuns).values({
            id: stageId,
            locationId,
            productionBatchId: ids.batch0,
            stationId: ids.washingStation,
            stageKind: 'washing',
            status: 'planned',
            plannedStartAt: new Date('2026-03-08T12:00:00.000Z'),
            plannedEndAt: new Date('2026-03-08T12:30:00.000Z'),
          });
          const machines = Array.from({ length: 17 }, (_, index) => ({
            id: uuid(index + 720),
            locationId,
            stationId: ids.washingStation,
            label: `Overflow washer ${index}`,
            effectiveCapacityLbs: 10,
          }));
          await database.db
            .insert(productionTestSchema.machines)
            .values(machines);
          await database.db
            .insert(productionTestSchema.stageMachineAssignments)
            .values(
              machines.map((machine, index) => ({
                id: uuid(index + 750),
                locationId,
                stageRunId: stageId,
                machineId: machine.id,
                plannedStartAt: new Date('2026-03-08T12:00:00.000Z'),
                plannedEndAt: new Date('2026-03-08T12:30:00.000Z'),
                status: 'planned',
              })),
            );
        }
      }
      await expect(
        repo.load({ locationId, serviceDay, asOf, rowLimit: 1 }),
      ).resolves.toBe('scope_too_large');
    },
  );
});
