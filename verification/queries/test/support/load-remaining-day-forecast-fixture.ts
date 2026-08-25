import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  remainingDayForecastAsOf as asOf,
  remainingDayForecastConformanceIds as ids,
  remainingDayForecastInactiveLocationId as inactiveLocationId,
  remainingDayForecastLocationId as locationId,
  remainingDayForecastSiblingLocationId as siblingLocationId,
  type RemainingDayForecastFixture,
} from '../../src/public.ts';
import { seedProductionLocationConformanceFacts } from './production-location-conformance.postgres.ts';

const tables = [
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_orders',
  'order_demands',
  'production_shifts',
  'production_locations',
  'access_production_locations',
  'business_accounts',
] as const;

export const createRemainingDayForecastConformanceDatabase =
  (): TestDatabaseRuntime =>
    createTestDatabaseRuntime({
      databaseUrl: getTestDatabaseUrl(
        'PRESSLY_TEST_DATABASE_URL',
        'postgres://pressly:pressly@localhost:55434/pressly_remaining_day_forecast_conformance_test',
      ),
      tableNames: tables,
      maxConnections: 2,
      ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
        ? {}
        : {
            resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
          }),
    });

const uuid = (suffix: number, prefix = 77000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const seedRoots = async (database: PostgresDatabase): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: ids.business,
      slug: 'remaining-day-forecast-conformance',
      displayName: 'Remaining-day forecast conformance',
    });
  await database
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values([
      {
        id: locationId,
        businessId: ids.business,
        name: 'Forecast Facility',
        timezone: 'America/New_York',
      },
      {
        id: inactiveLocationId,
        businessId: ids.business,
        name: 'Inactive Forecast Facility',
        timezone: 'America/New_York',
        isActive: false,
      },
      {
        id: siblingLocationId,
        businessId: ids.business,
        name: 'Sibling Forecast Facility',
        timezone: 'America/Chicago',
      },
    ]);
  await seedProductionLocationConformanceFacts(database, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Forecast Facility',
      timezone: 'America/New_York',
    },
    {
      id: inactiveLocationId,
      businessId: ids.business,
      name: 'Inactive Forecast Facility',
      timezone: 'America/New_York',
      isActive: false,
    },
    {
      id: siblingLocationId,
      businessId: ids.business,
      name: 'Sibling Forecast Facility',
      timezone: 'America/Chicago',
    },
  ]);
};

type DemandInput = Readonly<{
  ordinal: number;
  display: string;
  dueAt: Date;
  locationId?: string;
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

const seedDemand = async (
  database: PostgresDatabase,
  input: DemandInput,
): Promise<
  Readonly<{ orderDemandId: string; productionOrderId: string | null }>
> => {
  const scopedLocationId = input.locationId ?? locationId;
  const fulfillmentId = uuid(input.ordinal, 77200000);
  const demandId = uuid(input.ordinal, 77300000);
  const estimate =
    input.estimatedWeightLbs === undefined ? 10 : input.estimatedWeightLbs;
  await database
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: demandId,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: input.admission ?? 'unreleased',
      commercialState: 'open',
      displayReference: input.display,
      locationId: scopedLocationId,
      revisionAt: input.dueAt,
      phase: input.phase ?? 'expected',
      estimatedWeightLbs: estimate,
      estimatedWeightSource: estimate === null ? null : 'test',
      dueAt: input.dueAt,
    });
  if (input.productionOrderId === undefined)
    return { orderDemandId: demandId, productionOrderId: null };

  const resolutionState = input.resolutionState ?? 'open';
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: input.productionOrderId,
      orderDemandId: demandId,
      locationId: scopedLocationId,
      dueAt: input.dueAt,
      operationalStatus: input.operationalStatus ?? 'eligible',
      executionStatus: input.executionStatus ?? 'unassigned',
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
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
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 60,
      active: true,
    },
    {
      id: ids.washerA,
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 60,
      active: true,
    },
    {
      id: ids.dryer,
      stationKind: 'drying' as const,
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
    algorithmVersion: 'fixed-pulse-ffd-v2' as const,
    version: 1,
  },
});

const schedulingOutput = (plannedCompletionAt: Date) => ({
  algorithmVersion: 'fixed-pulse-ffd-v2' as const,
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

const seedRun = async (
  database: PostgresDatabase,
  input: Readonly<{
    ordinal?: number;
    shiftId?: string;
    configId?: string;
    scheduleId?: string;
    runId?: string;
    startsAt?: Date;
    endsAt?: Date;
  }> = {},
): Promise<void> => {
  const ordinal = input.ordinal ?? 1;
  const shiftId = input.shiftId ?? ids.shift;
  const configId = input.configId ?? ids.config;
  const scheduleId = input.scheduleId ?? ids.schedule;
  const runId = input.runId ?? ids.run;
  const startsAt = input.startsAt ?? new Date('2026-03-08T12:00:00.000Z');
  const endsAt = input.endsAt ?? new Date('2026-03-08T14:30:00.000Z');
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: shiftId,
      locationId,
      startsAt,
      endsAt,
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values({
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: runId,
      locationId,
      productionShiftId: shiftId,
      scheduleRunId: scheduleId,
      status: 'started',
      startedAt: startsAt,
      queueVersion: ordinal,
      plannedCompletionAt: endsAt,
    });
};

const seedFloorGraph = async (database: PostgresDatabase): Promise<void> => {
  await seedRun(database);
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.batch1,
        locationId,
        productionRunId: ids.run,
        sequenceIndex: 1,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 100,
        pulseMinutes: 30,
        plannedDoneAt: new Date('2026-03-08T16:00:00.000Z'),
        membershipFrozenAt: asOf,
        membershipFrozenBy: ids.actor,
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values([
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
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
        id: ids.dryer,
        locationId,
        stationId: ids.dryingStation,
        label: 'Dryer',
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(stages);
  const batch0Washing = stages.find(
    (stage) =>
      stage.productionBatchId === ids.batch0 && stage.stageKind === 'washing',
  );
  if (batch0Washing === undefined) return;
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
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

const requireProductionOrderId = (input: {
  productionOrderId: string | null;
}): string => input.productionOrderId ?? '';

const seedComplete = async (database: PostgresDatabase): Promise<void> => {
  await seedFloorGraph(database);
  const activeA = await seedDemand(database, {
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
  const activeB = await seedDemand(database, {
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
  await seedDemand(database, {
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
  await seedDemand(database, {
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
  await seedDemand(database, {
    ordinal: 5,
    display: 'OVERTIME-READY',
    dueAt: new Date('2026-03-08T19:00:00.000Z'),
    phase: 'production_released',
    admission: 'released',
    estimatedWeightLbs: 80,
    productionOrderId: ids.overtime,
    operationalStatus: 'eligible',
    derivedWeightLbs: 80,
    bagCount: 1,
  });
  await seedDemand(database, {
    ordinal: 6,
    display: 'EXPECTED-MISSING',
    dueAt: new Date('2026-03-08T20:00:00.000Z'),
    estimatedWeightLbs: null,
  });
  await seedDemand(database, {
    ordinal: 7,
    display: 'EXPECTED-INBOUND',
    dueAt: new Date('2026-03-08T21:00:00.000Z'),
    phase: 'inbound',
  });
  await seedDemand(database, {
    ordinal: 8,
    display: 'AWAITING-INTAKE',
    dueAt: new Date('2026-03-08T22:00:00.000Z'),
    phase: 'production_released',
    admission: 'released',
    productionOrderId: ids.intake,
    operationalStatus: 'intake_pending',
    derivedWeightLbs: 15,
  });
  await seedDemand(database, {
    ordinal: 9,
    display: 'AWAITING-RELEASE',
    dueAt: new Date('2026-03-08T23:00:00.000Z'),
    productionOrderId: ids.release,
    operationalStatus: 'release_pending',
    derivedWeightLbs: 10,
  });
  await seedDemand(database, {
    ordinal: 10,
    display: 'FINISHED',
    dueAt: new Date('2026-03-09T00:00:00.000Z'),
    phase: 'production_released',
    admission: 'released',
    productionOrderId: ids.finished,
    operationalStatus: 'finished',
    executionStatus: 'finished',
    derivedWeightLbs: 25,
    bagCount: 1,
  });
  await seedDemand(database, {
    ordinal: 11,
    display: 'RESOLVED',
    dueAt: new Date('2026-03-09T01:00:00.000Z'),
    productionOrderId: ids.resolved,
    resolutionState: 'resolved_without_production',
  });
  await seedDemand(database, {
    ordinal: 12,
    display: 'AT-END-EXCLUDED',
    dueAt: new Date('2026-03-09T04:00:00.000Z'),
  });
  await seedDemand(database, {
    ordinal: 13,
    display: 'CROSS-LOCATION',
    dueAt: new Date('2026-03-08T18:00:00.000Z'),
    locationId: siblingLocationId,
  });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: uuid(450),
      locationId,
      startsAt: new Date('2026-03-08T10:00:00.000Z'),
      endsAt: new Date('2026-03-08T11:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'draft',
      effectiveFolderCount: 1,
    });
};

const seedReadyWithoutRun = async (
  database: PostgresDatabase,
): Promise<void> => {
  await seedDemand(database, {
    ordinal: 50,
    display: 'READY-WITHOUT-RUN',
    dueAt: new Date('2026-03-08T18:00:00.000Z'),
    phase: 'production_released',
    admission: 'released',
    productionOrderId: ids.ready,
    operationalStatus: 'eligible',
    derivedWeightLbs: 30,
    bagCount: 1,
  });
};

const seedAmbiguousRuns = async (database: PostgresDatabase): Promise<void> => {
  await seedRun(database, {
    ordinal: 2,
    shiftId: ids.secondShift,
    configId: ids.secondConfig,
    scheduleId: ids.secondSchedule,
    runId: ids.secondRun,
    startsAt: new Date('2026-03-08T13:00:00.000Z'),
    endsAt: new Date('2026-03-08T17:00:00.000Z'),
  });
  await seedRun(database);
  await seedReadyWithoutRun(database);
};

const seedDemandOverflow = async (
  database: PostgresDatabase,
): Promise<void> => {
  const count = 501;
  await database
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values(
      Array.from({ length: count }, (_, index) => ({
        id: uuid(index + 1, 78300000),
        fulfillmentId: uuid(index + 1, 78200000),
        fulfillmentVersion: 1,
        projectionHash: 'a'.repeat(64),
        admissionState: 'unreleased',
        commercialState: 'open',
        displayReference: `OVERFLOW-${String(index)}`,
        locationId,
        revisionAt: new Date('2026-03-08T18:00:00.000Z'),
        phase: 'expected',
        estimatedWeightLbs: 10,
        estimatedWeightSource: 'test',
        dueAt: new Date('2026-03-08T18:00:00.000Z'),
      })),
    );
};

export const seedRemainingDayForecastConformance = async (
  database: PostgresDatabase,
  fixture: RemainingDayForecastFixture,
): Promise<void> => {
  await seedRoots(database);
  switch (fixture) {
    case 'empty':
      return;
    case 'complete':
      return seedComplete(database);
    case 'ready-without-run':
    case 'lifecycle-conflict':
      return seedReadyWithoutRun(database);
    case 'ambiguous-runs':
      return seedAmbiguousRuns(database);
    case 'demand-overflow':
      return seedDemandOverflow(database);
  }
};

export const readRemainingDayForecastState = async (
  database: PostgresDatabase,
) => {
  const [
    businesses,
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
    database
      .select()
      .from(presslyPostgresOwnerSchemas.access.businessAccounts)
      .orderBy(asc(presslyPostgresOwnerSchemas.access.businessAccounts.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.access.accessProductionLocations)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.access.accessProductionLocations.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.orderDemands)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.orderDemands.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShifts)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionShifts.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.schedulerConfigs)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.schedulerConfigs.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.scheduleRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.scheduleRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatches)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.productionBatches.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatchOrders)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.productionBatchOrders.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stations)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.stations.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.machines)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.machines.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.stageRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.stageMachineAssignments.id),
      ),
  ]);
  return {
    businesses,
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

export type RemainingDayForecastReadState = Awaited<
  ReturnType<typeof readRemainingDayForecastState>
>;
