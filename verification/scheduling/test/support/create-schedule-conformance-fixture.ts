import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  createScheduleConformanceIds as ids,
  createScheduleConformanceLocationId as locationId,
  createScheduleConformanceNow as now,
  createScheduleConformanceSecondLocationId as secondLocationId,
  type CreateScheduleScenario,
} from '../../src/create-schedule-conformance.ts';

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
  'production_machines',
  'production_stations',
  'scheduler_configs',
  'production_orders',
  'order_demands',
  'production_shifts',
  'production_locations',
] as const;

const adminDatabaseUrl =
  process.env['PRESSLY_CREATE_SCHEDULE_ADMIN_DATABASE_URL'] ??
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

export type CreateScheduleConformanceDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

export type CreateScheduleConformanceDatabaseRuntime = Readonly<{
  database: CreateScheduleConformanceDatabase;
  setup: () => Promise<void>;
  closeForceDropAndVerifyAbsent: () => Promise<boolean>;
}>;

export const createScheduleConformanceDatabase =
  (): CreateScheduleConformanceDatabaseRuntime => {
    const suffix = `${process.pid}_${Date.now().toString(36)}`;
    const name = `pressly_create_schedule_test_${suffix}_conformance`;
    const url = databaseUrl(name);
    const database = Object.freeze({
      name,
      url,
      ...createTestDatabaseRuntime({
        databaseUrl: url,
        tableNames,
        maxConnections: 10,
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

const removeFaults = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(
    sql`drop trigger if exists create_schedule_conformance_cas on schedule_runs`,
  );
  await db.execute(
    sql`drop trigger if exists create_schedule_conformance_corrupt_output on schedule_runs`,
  );
  await db.execute(
    sql`drop trigger if exists create_schedule_conformance_slow_event on work_events`,
  );
  await db.execute(
    sql`drop function if exists create_schedule_conformance_reject_update()`,
  );
  await db.execute(
    sql`drop function if exists create_schedule_conformance_corrupt_output()`,
  );
  await db.execute(
    sql`drop function if exists create_schedule_conformance_delay_event()`,
  );
};

export const resetCreateScheduleConformanceDatabase = async (
  database: CreateScheduleConformanceDatabase,
): Promise<void> => {
  await removeFaults(database.db);
  await database.reset();
};

const seedLocation = async (
  db: PostgresDatabase,
  input: Readonly<{
    id: string;
    name: string;
    shiftId: string;
    configId: string;
    fulfillmentId: string;
    demandId: string;
    productionOrderId: string;
    washingStationId: string;
    dryingStationId: string;
    washerId: string;
    dryerId: string;
    displayNumber: string;
  }>,
): Promise<void> => {
  await db.insert(productionSchema.productionLocations).values({
    id: input.id,
    businessId: ids.business,
    name: input.name,
    timezone: 'America/New_York',
    isActive: true,
    liveRevision: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(productionSchema.productionShifts).values({
    id: input.shiftId,
    locationId: input.id,
    startsAt: new Date('2026-08-22T13:00:00.000Z'),
    endsAt: new Date('2026-08-22T21:00:00.000Z'),
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    status: 'open',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(productionSchema.schedulerConfigs).values({
    id: input.configId,
    locationId: input.id,
    pulseMinutes: 30,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: ids.actor,
    publishedAt: now,
  });
  await db.insert(productionSchema.stations).values([
    {
      id: input.washingStationId,
      locationId: input.id,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 1,
    },
    {
      id: input.dryingStationId,
      locationId: input.id,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 2,
    },
  ]);
  await db.insert(productionSchema.machines).values([
    {
      id: input.washerId,
      locationId: input.id,
      stationId: input.washingStationId,
      label: 'Washer',
      effectiveCapacityLbs: 100,
      isActive: true,
    },
    {
      id: input.dryerId,
      locationId: input.id,
      stationId: input.dryingStationId,
      label: 'Dryer',
      effectiveCapacityLbs: 100,
      isActive: true,
    },
  ]);
  await db.insert(productionSchema.orderDemands).values({
    id: input.demandId,
    fulfillmentId: input.fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: input.displayNumber,
    locationId: input.id,
    revisionAt: now,
    phase: 'production_released',
    estimatedWeightLbs: 70,
    estimatedWeightSource: 'test',
    dueAt: new Date('2026-08-22T20:00:00.000Z'),
  });
  await db.insert(productionSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: input.demandId,
    locationId: input.id,
    dueAt: new Date('2026-08-22T20:00:00.000Z'),
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: 70,
    bagCount: 2,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: now,
    intakeVersion: 1,
    eligibleAt: now,
    version: 1,
  });
  await db.insert(productionSchema.productionShiftSelections).values({
    productionShiftId: input.shiftId,
    locationId: input.id,
    version: 1,
    selectedBy: ids.actor,
  });
  await db.insert(productionSchema.productionShiftSelectedOrders).values({
    productionShiftId: input.shiftId,
    locationId: input.id,
    productionOrderId: input.productionOrderId,
    selectedBy: ids.actor,
  });
};

const seedSecondReadyOrder = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(productionSchema.orderDemands).values({
    id: ids.secondDemand,
    fulfillmentId: ids.secondFulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'CREATE-SCHEDULE-2',
    locationId,
    revisionAt: now,
    phase: 'production_released',
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'test',
    dueAt: new Date('2026-08-22T19:00:00.000Z'),
  });
  await db.insert(productionSchema.productionOrders).values({
    id: ids.secondProductionOrder,
    orderDemandId: ids.secondDemand,
    locationId,
    dueAt: new Date('2026-08-22T19:00:00.000Z'),
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: 20,
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: now,
    intakeVersion: 1,
    eligibleAt: now,
    version: 1,
  });
};

const seedCurrentSchedule = async (
  db: PostgresDatabase,
  status: 'accepted' | 'draft',
): Promise<void> => {
  await db.insert(productionSchema.scheduleRuns).values({
    id: ids.currentSchedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status,
    inputSnapshot: {},
    inputSnapshotHash: 'e'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'f'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: new Date('2026-08-22T13:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: status === 'accepted' ? now : null,
    acceptedBy: status === 'accepted' ? ids.actor : null,
    createdAt: now,
  });
};

const historicalProposal = () => ({
  scheduleRunId: ids.currentSchedule,
  productionShiftId: ids.shift,
  schedulerConfigId: ids.config,
  status: 'draft',
  inputSnapshotHash: '1'.repeat(64),
  outputPlanHash: '2'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v1',
  pulseMinutes: 30,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-22T13:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: now.toISOString(),
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
});

const seedReceipt = async (
  db: PostgresDatabase,
  scenario: CreateScheduleScenario,
): Promise<void> => {
  const storedReceipt = scenario.fixture.storedReceipt;
  const command = scenario.commands[0];
  if (storedReceipt === undefined || command === undefined) return;
  const identity = {
    operation: 'schedule_computed',
    locationId: command.locationId,
    actorId: command.actorId,
    target: { entityType: 'schedule_run', entityId: null },
    expectedVersion: null,
    payload: {
      productionShiftId: command.productionShiftId,
      schedulerConfigId: command.schedulerConfigId,
    },
  };
  await db.insert(productionSchema.workEvents).values({
    id: ids.receiptEvent,
    locationId: command.locationId,
    eventType: 'schedule_computed',
    entityType: 'schedule_run',
    entityId: ids.currentSchedule,
    actorId: command.actorId,
    expectedVersion: null,
    idempotencyKey: command.idempotencyKey,
    payload:
      storedReceipt === 'malformed'
        ? { _idempotency: { version: 2 } }
        : {
            _idempotency: {
              version: 1,
              command:
                storedReceipt === 'divergent'
                  ? { ...identity, actorId: ids.collision }
                  : identity,
              result: historicalProposal(),
            },
          },
  });
};

const installFault = async (
  db: PostgresDatabase,
  scenario: CreateScheduleScenario,
): Promise<void> => {
  switch (scenario.fixture.fault) {
    case 'schedule_cas':
      await db.execute(
        sql`create function create_schedule_conformance_reject_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
      );
      await db.execute(
        sql`create trigger create_schedule_conformance_cas before update on schedule_runs for each row execute function create_schedule_conformance_reject_update()`,
      );
      return;
    case 'corrupt_persisted_output':
      await db.execute(
        sql`create function create_schedule_conformance_corrupt_output() returns trigger language plpgsql as $$ begin new.output_plan = '{}'::jsonb; return new; end; $$`,
      );
      await db.execute(
        sql`create trigger create_schedule_conformance_corrupt_output before insert on schedule_runs for each row execute function create_schedule_conformance_corrupt_output()`,
      );
      return;
    case 'slow_event_append':
      await db.execute(
        sql`create function create_schedule_conformance_delay_event() returns trigger language plpgsql as $$ begin perform pg_sleep(0.15); return new; end; $$`,
      );
      await db.execute(
        sql`create trigger create_schedule_conformance_slow_event before insert on work_events for each row execute function create_schedule_conformance_delay_event()`,
      );
      return;
    case 'event_id_collision':
      await db.insert(productionSchema.workEvents).values({
        id: ids.eventA,
        locationId,
        eventType: 'fixture',
        entityType: 'fixture',
        entityId: ids.eventA,
        actorId: ids.actor,
        expectedVersion: null,
        idempotencyKey: 'create-schedule-event-id-fixture',
        payload: {},
      });
      return;
    case 'schedule_id_collision':
    case undefined:
      return;
  }
};

export const seedCreateScheduleConformance = async (
  db: PostgresDatabase,
  scenario: CreateScheduleScenario,
): Promise<void> => {
  if (scenario.fixture.shift !== 'missing') {
    await seedLocation(db, {
      id: locationId,
      name: 'Create Schedule Conformance Facility',
      shiftId: ids.shift,
      configId: ids.config,
      fulfillmentId: ids.fulfillment,
      demandId: ids.demand,
      productionOrderId: ids.productionOrder,
      washingStationId: ids.washingStation,
      dryingStationId: ids.dryingStation,
      washerId: ids.washer,
      dryerId: ids.dryer,
      displayNumber: 'CREATE-SCHEDULE-1',
    });
    await seedSecondReadyOrder(db);
  } else {
    await db.insert(productionSchema.productionLocations).values({
      id: locationId,
      businessId: ids.business,
      name: 'Create Schedule Missing Shift Facility',
      timezone: 'America/New_York',
      isActive: true,
      liveRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (scenario.fixture.secondLocation === true)
    await seedLocation(db, {
      id: secondLocationId,
      name: 'Create Schedule Conformance Second Facility',
      shiftId: ids.secondShift,
      configId: ids.secondConfig,
      fulfillmentId: ids.otherFulfillment,
      demandId: ids.otherDemand,
      productionOrderId: ids.otherProductionOrder,
      washingStationId: ids.secondWashingStation,
      dryingStationId: ids.secondDryingStation,
      washerId: ids.secondWasher,
      dryerId: ids.secondDryer,
      displayNumber: 'CREATE-SCHEDULE-OTHER',
    });
  if (scenario.fixture.shift === 'expired')
    await db
      .update(productionSchema.productionShifts)
      .set({
        startsAt: new Date('2026-08-22T08:00:00.000Z'),
        endsAt: new Date('2026-08-22T11:00:00.000Z'),
      })
      .where(eq(productionSchema.productionShifts.id, ids.shift));
  if (scenario.fixture.config === 'missing')
    await db
      .delete(productionSchema.schedulerConfigs)
      .where(eq(productionSchema.schedulerConfigs.id, ids.config));
  if (scenario.fixture.selection === 'empty')
    await db
      .delete(productionSchema.productionShiftSelectedOrders)
      .where(
        eq(
          productionSchema.productionShiftSelectedOrders.productionShiftId,
          ids.shift,
        ),
      );
  if (scenario.fixture.selection === 'invalid')
    await db
      .update(productionSchema.productionOrders)
      .set({ operationalStatus: 'ineligible' })
      .where(eq(productionSchema.productionOrders.id, ids.productionOrder));
  if (
    scenario.fixture.current !== undefined &&
    scenario.fixture.current !== null
  )
    await seedCurrentSchedule(db, scenario.fixture.current);
  if (scenario.fixture.shift === 'started') {
    await seedCurrentSchedule(db, 'accepted');
    await db.insert(productionSchema.productionRuns).values({
      id: ids.collision,
      locationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.currentSchedule,
      status: 'started',
      startedAt: now,
      plannedCompletionAt: new Date('2026-08-22T21:00:00.000Z'),
      queueVersion: 1,
      version: 1,
    });
  }
  await seedReceipt(db, scenario);
  await installFault(db, scenario);
};

export const replaceCreateScheduleSelection = async (
  db: PostgresDatabase,
): Promise<void> => {
  await db
    .delete(productionSchema.productionShiftSelectedOrders)
    .where(
      eq(
        productionSchema.productionShiftSelectedOrders.productionShiftId,
        ids.shift,
      ),
    );
  await db.insert(productionSchema.productionShiftSelectedOrders).values({
    productionShiftId: ids.shift,
    locationId,
    productionOrderId: ids.secondProductionOrder,
    selectedBy: ids.actor,
  });
};

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export const readCreateScheduleConformanceState = async (
  db: PostgresDatabase,
) => {
  const [locations, schedules, selectedOrders, workEvents] = await Promise.all([
    db
      .select({
        id: productionSchema.productionLocations.id,
        liveRevision: productionSchema.productionLocations.liveRevision,
      })
      .from(productionSchema.productionLocations)
      .orderBy(asc(productionSchema.productionLocations.id)),
    db
      .select()
      .from(productionSchema.scheduleRuns)
      .orderBy(asc(productionSchema.scheduleRuns.id)),
    db
      .select()
      .from(productionSchema.productionShiftSelectedOrders)
      .orderBy(
        asc(productionSchema.productionShiftSelectedOrders.locationId),
        asc(productionSchema.productionShiftSelectedOrders.productionOrderId),
      ),
    db
      .select()
      .from(productionSchema.workEvents)
      .orderBy(asc(productionSchema.workEvents.id)),
  ]);

  return Object.freeze({
    locations: locations.map((row) => ({ ...row })),
    schedules: schedules.map((row) => ({
      ...row,
      plannedCompletionAt: row.plannedCompletionAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      acceptedAt: iso(row.acceptedAt),
      supersededAt: iso(row.supersededAt),
    })),
    selectedOrders: selectedOrders.map((row) => ({
      productionShiftId: row.productionShiftId,
      locationId: row.locationId,
      productionOrderId: row.productionOrderId,
      selectedBy: row.selectedBy,
    })),
    workEvents: workEvents.map((row) => ({
      id: row.id,
      locationId: row.locationId,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      expectedVersion: row.expectedVersion,
      idempotencyKey: row.idempotencyKey,
      payload: row.payload,
    })),
  });
};
