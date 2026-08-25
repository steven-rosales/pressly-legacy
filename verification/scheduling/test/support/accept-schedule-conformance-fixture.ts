import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';

const productionSchema = presslyPostgresOwnerSchemas.production;

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const tableNames = [
  'work_events',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_orders',
  'order_demands',
  'production_shifts',
  'production_locations',
] as const;

const adminDatabaseUrl =
  process.env['PRESSLY_ACCEPT_SCHEDULE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';

const databaseUrl = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const dropDatabase = (name: string): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    name,
  ]);
};

const createDatabase = (name: string): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    name,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: 'test',
  });
};

const databaseExists = (name: string): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${name}'`,
  ]).trim() === name;

export type AcceptScheduleConformanceDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

export type AcceptScheduleConformanceDatabaseRuntime = Readonly<{
  database: AcceptScheduleConformanceDatabase;
  setup: () => Promise<void>;
  closeForceDropAndVerifyAbsent: () => Promise<boolean>;
}>;

export const createAcceptScheduleConformanceDatabase =
  (): AcceptScheduleConformanceDatabaseRuntime => {
    const suffix = `${process.pid}_${Date.now().toString(36)}`;
    const name = `pressly_accept_schedule_test_${suffix}_conformance`;
    const url = databaseUrl(name);
    const database = Object.freeze({
      name,
      url,
      ...createTestDatabaseRuntime({
        databaseUrl: url,
        tableNames,
        maxConnections: 12,
      }),
    });

    return Object.freeze({
      database,
      setup: async () => {
        dropDatabase(name);
        createDatabase(name);
        await database.check();
      },
      closeForceDropAndVerifyAbsent: async () => {
        await database.close();
        dropDatabase(name);
        return databaseExists(name);
      },
    });
  };

export const acceptScheduleConformanceIds = Object.freeze({
  actor: '35000000-0000-4000-8000-000000000001',
  business: '35000000-0000-4000-8000-000000000002',
  shift: '35000000-0000-4000-8000-000000000003',
  schedule: '35000000-0000-4000-8000-000000000004',
  config: '35000000-0000-4000-8000-000000000005',
  run: '35000000-0000-4000-8000-000000000006',
  fulfillmentLow: '35000000-0000-4000-8000-000000000020',
  fulfillmentHigh: '35000000-0000-4000-8000-000000000021',
  demandLow: '35000000-0000-4000-8000-000000000030',
  demandHigh: '35000000-0000-4000-8000-000000000031',
  orderLow: '35000000-0000-4000-8000-000000000040',
  orderHigh: '35000000-0000-4000-8000-000000000041',
  event: '35000000-0000-4000-8000-000000000050',
  collision: '35000000-0000-4000-8000-000000000051',
} as const);

export const acceptScheduleConformanceLocationId =
  'location-accept-schedule-conformance';
export const acceptScheduleConformanceOtherLocationId =
  'location-accept-schedule-other';
export const acceptScheduleConformanceNow = new Date(
  '2026-08-22T14:00:00.000Z',
);
export const acceptScheduleConformanceInitialTime = new Date(
  '2026-08-22T12:00:00.000Z',
);
export const acceptScheduleConformanceOutputHash = 'a'.repeat(64);
export const acceptScheduleConformanceInputHash = 'b'.repeat(64);

export type AcceptScheduleFixture = Readonly<{
  scheduleStatus?: 'accepted' | 'draft' | 'superseded';
  runExists?: boolean;
  snapshotStale?: boolean;
  noBatches?: boolean;
  receiptCollision?: boolean;
  fault?: 'late_schedule_cas' | 'slow_receipt';
}>;

const removeFaults = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(
    sql`drop trigger if exists accept_schedule_conformance_cas on schedule_runs`,
  );
  await db.execute(
    sql`drop trigger if exists accept_schedule_conformance_slow_receipt on work_events`,
  );
  await db.execute(
    sql`drop function if exists accept_schedule_conformance_reject_update()`,
  );
  await db.execute(
    sql`drop function if exists accept_schedule_conformance_delay_receipt()`,
  );
};

export const resetAcceptScheduleConformanceDatabase = async (
  database: AcceptScheduleConformanceDatabase,
): Promise<void> => {
  await removeFaults(database.db);
  await database.reset();
};

const schedulingInput = {
  orders: [
    {
      id: acceptScheduleConformanceIds.orderHigh,
      externalOrderId: 'ACCEPT-HIGH',
      dueAt: '2026-08-22T20:00:00.000Z',
      priority: true,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 1,
    },
    {
      id: acceptScheduleConformanceIds.orderLow,
      externalOrderId: 'ACCEPT-LOW',
      dueAt: '2026-08-22T19:00:00.000Z',
      priority: false,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 1,
    },
  ],
  machines: [],
  shift: {
    id: acceptScheduleConformanceIds.shift,
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: acceptScheduleConformanceIds.config,
    pulseMinutes: 60,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2' as const,
    version: 1,
  },
};

const plannedStages = [
  {
    stage: 'sorting' as const,
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T14:00:00.000Z',
    machineIds: [],
  },
  {
    stage: 'washing' as const,
    startsAt: '2026-08-22T14:00:00.000Z',
    endsAt: '2026-08-22T15:00:00.000Z',
    machineIds: [],
  },
  {
    stage: 'drying' as const,
    startsAt: '2026-08-22T15:00:00.000Z',
    endsAt: '2026-08-22T16:00:00.000Z',
    machineIds: [],
  },
  {
    stage: 'folding_packaging' as const,
    startsAt: '2026-08-22T16:00:00.000Z',
    endsAt: '2026-08-22T17:00:00.000Z',
    machineIds: [],
  },
];

const schedulingOutput = (fixture: AcceptScheduleFixture) => ({
  algorithmVersion: 'fixed-pulse-ffd-v2' as const,
  inputSnapshotHash: acceptScheduleConformanceInputHash,
  outputPlanHash: acceptScheduleConformanceOutputHash,
  canonicalOutput: '{"fixture":"accept-schedule-conformance-v2"}',
  pulseMinutes: 60,
  pulseCapacityLbs: 100,
  batchCount: fixture.noBatches === true ? 0 : 1,
  makespanMinutes: fixture.noBatches === true ? 0 : 300,
  plannedCompletionAt: '2026-08-22T17:00:00.000Z',
  batches:
    fixture.noBatches === true
      ? []
      : [
          {
            sequence: 0,
            orderIds: [
              acceptScheduleConformanceIds.orderHigh,
              acceptScheduleConformanceIds.orderLow,
            ],
            derivedWeightLbs: 40,
            bagCount: 2,
            stages: plannedStages,
          },
        ],
  unplacedOrderIds:
    fixture.noBatches === true
      ? [
          acceptScheduleConformanceIds.orderHigh,
          acceptScheduleConformanceIds.orderLow,
        ]
      : [],
  warnings: [
    {
      code: 'OVERSIZED_ORDER' as const,
      message: 'One selected order is oversized.',
      blocking: true,
      orderIds: [acceptScheduleConformanceIds.orderHigh],
    },
    {
      code: 'SHIFT_OVERFLOW' as const,
      message: 'The plan finishes after the target window.',
      blocking: true,
    },
  ],
});

const seedOrder = async (
  db: PostgresDatabase,
  input: Readonly<{
    fulfillmentId: string;
    demandId: string;
    productionOrderId: string;
    displayReference: string;
    dueAt: Date;
    priority: boolean;
  }>,
): Promise<void> => {
  await db.insert(productionSchema.orderDemands).values({
    id: input.demandId,
    fulfillmentId: input.fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: input.displayReference,
    locationId: acceptScheduleConformanceLocationId,
    revisionAt: acceptScheduleConformanceInitialTime,
    phase: 'production_released',
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'conformance',
    dueAt: input.dueAt,
  });
  await db.insert(productionSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: input.demandId,
    locationId: acceptScheduleConformanceLocationId,
    dueAt: input.dueAt,
    priority: input.priority,
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: 20,
    derivedWeightSource: 'conformance',
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: acceptScheduleConformanceInitialTime,
    intakeVersion: 1,
    eligibleAt: acceptScheduleConformanceInitialTime,
    version: 1,
  });
};

const installFault = async (
  db: PostgresDatabase,
  fixture: AcceptScheduleFixture,
): Promise<void> => {
  if (fixture.fault === 'late_schedule_cas') {
    await db.execute(sql`
      create function accept_schedule_conformance_reject_update()
      returns trigger language plpgsql as $$ begin return null; end; $$
    `);
    await db.execute(sql`
      create trigger accept_schedule_conformance_cas
      before update on schedule_runs
      for each row execute function accept_schedule_conformance_reject_update()
    `);
  }
  if (fixture.fault === 'slow_receipt') {
    await db.execute(sql`
      create function accept_schedule_conformance_delay_receipt()
      returns trigger language plpgsql as $$
      begin perform pg_sleep(0.2); return new; end; $$
    `);
    await db.execute(sql`
      create trigger accept_schedule_conformance_slow_receipt
      before insert on work_events
      for each row execute function accept_schedule_conformance_delay_receipt()
    `);
  }
};

export const seedAcceptScheduleConformance = async (
  db: PostgresDatabase,
  fixture: AcceptScheduleFixture = {},
): Promise<void> => {
  const ids = acceptScheduleConformanceIds;
  const status = fixture.scheduleStatus ?? 'draft';
  await db.insert(productionSchema.productionLocations).values([
    {
      id: acceptScheduleConformanceLocationId,
      businessId: ids.business,
      name: 'Accept Schedule Conformance Facility',
      timezone: 'America/New_York',
      createdAt: acceptScheduleConformanceInitialTime,
      updatedAt: acceptScheduleConformanceInitialTime,
    },
    {
      id: acceptScheduleConformanceOtherLocationId,
      businessId: ids.business,
      name: 'Other Accept Schedule Facility',
      timezone: 'America/New_York',
      createdAt: acceptScheduleConformanceInitialTime,
      updatedAt: acceptScheduleConformanceInitialTime,
    },
  ]);
  await db.insert(productionSchema.productionShifts).values({
    id: ids.shift,
    locationId: acceptScheduleConformanceLocationId,
    startsAt: new Date(schedulingInput.shift.startsAt),
    endsAt: new Date(schedulingInput.shift.endsAt),
    timezone: schedulingInput.shift.timezone,
    status: 'open',
    effectiveFolderCount: schedulingInput.shift.effectiveFolderCount,
    version: 1,
    createdAt: acceptScheduleConformanceInitialTime,
    updatedAt: acceptScheduleConformanceInitialTime,
  });
  await seedOrder(db, {
    fulfillmentId: ids.fulfillmentHigh,
    demandId: ids.demandHigh,
    productionOrderId: ids.orderHigh,
    displayReference: 'ACCEPT-HIGH',
    dueAt: new Date('2026-08-22T20:00:00.000Z'),
    priority: true,
  });
  await seedOrder(db, {
    fulfillmentId: ids.fulfillmentLow,
    demandId: ids.demandLow,
    productionOrderId: ids.orderLow,
    displayReference: 'ACCEPT-LOW',
    dueAt: new Date('2026-08-22T19:00:00.000Z'),
    priority: false,
  });
  if (fixture.snapshotStale === true)
    await db
      .update(productionSchema.productionOrders)
      .set({ version: 2 })
      .where(sql`${productionSchema.productionOrders.id} = ${ids.orderHigh}`);
  await db.insert(productionSchema.productionShiftSelections).values({
    productionShiftId: ids.shift,
    locationId: acceptScheduleConformanceLocationId,
    version: 1,
    selectedBy: ids.actor,
    selectedAt: acceptScheduleConformanceInitialTime,
    updatedAt: acceptScheduleConformanceInitialTime,
  });
  await db.insert(productionSchema.productionShiftSelectedOrders).values([
    {
      productionShiftId: ids.shift,
      locationId: acceptScheduleConformanceLocationId,
      productionOrderId: ids.orderHigh,
      selectedBy: ids.actor,
      selectedAt: acceptScheduleConformanceInitialTime,
    },
    {
      productionShiftId: ids.shift,
      locationId: acceptScheduleConformanceLocationId,
      productionOrderId: ids.orderLow,
      selectedBy: ids.actor,
      selectedAt: acceptScheduleConformanceInitialTime,
    },
  ]);
  await db.insert(productionSchema.schedulerConfigs).values({
    id: ids.config,
    locationId: acceptScheduleConformanceLocationId,
    pulseMinutes: 60,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
      assertedBy: ids.actor,
      assertedAt: acceptScheduleConformanceInitialTime.toISOString(),
    },
    assertedBy: ids.actor,
    publishedAt: acceptScheduleConformanceInitialTime,
  });
  const outputPlan = schedulingOutput(fixture);
  await db.insert(productionSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId: acceptScheduleConformanceLocationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status,
    inputSnapshot: schedulingInput,
    inputSnapshotHash: acceptScheduleConformanceInputHash,
    outputPlan,
    outputPlanHash: acceptScheduleConformanceOutputHash,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: outputPlan.pulseCapacityLbs,
    batchCount: outputPlan.batchCount,
    makespanMinutes: outputPlan.makespanMinutes,
    plannedCompletionAt: new Date(outputPlan.plannedCompletionAt),
    warnings: [],
    acknowledgedWarningCodes:
      status === 'accepted' ? ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'] : [],
    createdAt: acceptScheduleConformanceInitialTime,
    ...(status === 'accepted'
      ? {
          acceptedAt: acceptScheduleConformanceInitialTime,
          acceptedBy: ids.actor,
        }
      : status === 'superseded'
        ? { supersededAt: acceptScheduleConformanceInitialTime }
        : {}),
  });
  if (fixture.runExists === true)
    await db.insert(productionSchema.productionRuns).values({
      id: ids.run,
      locationId: acceptScheduleConformanceLocationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.schedule,
      status: 'started',
      startedAt: acceptScheduleConformanceInitialTime,
      plannedCompletionAt: new Date(outputPlan.plannedCompletionAt),
      version: 1,
      queueVersion: 1,
      createdAt: acceptScheduleConformanceInitialTime,
      updatedAt: acceptScheduleConformanceInitialTime,
    });
  if (fixture.receiptCollision === true)
    await db.insert(productionSchema.workEvents).values({
      id: ids.collision,
      locationId: acceptScheduleConformanceLocationId,
      eventType: 'fixture_collision',
      entityType: 'fixture',
      entityId: ids.collision,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'accept-schedule-collision-evidence',
      payload: {},
      createdAt: acceptScheduleConformanceInitialTime,
    });
  await installFault(db, fixture);
};

export const readAcceptScheduleConformanceState = async (
  db: PostgresDatabase,
) => {
  const [schedules, workEvents, locations, runs, productionOrders] =
    await Promise.all([
      db
        .select({
          id: productionSchema.scheduleRuns.id,
          locationId: productionSchema.scheduleRuns.locationId,
          status: productionSchema.scheduleRuns.status,
          acceptedAt: productionSchema.scheduleRuns.acceptedAt,
          acceptedBy: productionSchema.scheduleRuns.acceptedBy,
          acknowledgedWarningCodes:
            productionSchema.scheduleRuns.acknowledgedWarningCodes,
          supersededAt: productionSchema.scheduleRuns.supersededAt,
        })
        .from(productionSchema.scheduleRuns)
        .orderBy(asc(productionSchema.scheduleRuns.id)),
      db
        .select({
          id: productionSchema.workEvents.id,
          locationId: productionSchema.workEvents.locationId,
          eventType: productionSchema.workEvents.eventType,
          entityType: productionSchema.workEvents.entityType,
          entityId: productionSchema.workEvents.entityId,
          actorId: productionSchema.workEvents.actorId,
          expectedVersion: productionSchema.workEvents.expectedVersion,
          idempotencyKey: productionSchema.workEvents.idempotencyKey,
          payload: productionSchema.workEvents.payload,
        })
        .from(productionSchema.workEvents)
        .orderBy(asc(productionSchema.workEvents.id)),
      db
        .select({
          id: productionSchema.productionLocations.id,
          liveRevision: productionSchema.productionLocations.liveRevision,
        })
        .from(productionSchema.productionLocations)
        .orderBy(asc(productionSchema.productionLocations.id)),
      db
        .select({
          id: productionSchema.productionRuns.id,
          status: productionSchema.productionRuns.status,
        })
        .from(productionSchema.productionRuns)
        .orderBy(asc(productionSchema.productionRuns.id)),
      db
        .select({
          id: productionSchema.productionOrders.id,
          version: productionSchema.productionOrders.version,
          operationalStatus:
            productionSchema.productionOrders.operationalStatus,
        })
        .from(productionSchema.productionOrders)
        .orderBy(asc(productionSchema.productionOrders.id)),
    ]);
  return Object.freeze({
    schedules,
    workEvents,
    locations,
    runs,
    productionOrders,
  });
};
