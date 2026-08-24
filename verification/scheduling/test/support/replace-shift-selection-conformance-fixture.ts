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
import {
  replaceShiftSelectionConformanceIds as ids,
  replaceShiftSelectionConformanceLocationId as locationId,
  replaceShiftSelectionConformanceNow as now,
  type ReplaceShiftSelectionScenario,
} from '../../src/replace-shift-selection-conformance.ts';

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
  process.env['PRESSLY_REPLACE_SHIFT_SELECTION_ADMIN_DATABASE_URL'] ??
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

export type ReplaceShiftSelectionConformanceDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

export type ReplaceShiftSelectionConformanceDatabaseRuntime = Readonly<{
  database: ReplaceShiftSelectionConformanceDatabase;
  setup: () => Promise<void>;
  closeForceDropAndVerifyAbsent: () => Promise<boolean>;
}>;

export const replaceShiftSelectionConformanceDatabase =
  (): ReplaceShiftSelectionConformanceDatabaseRuntime => {
    const suffix = `${process.pid}_${Date.now().toString(36)}`;
    const name = `pressly_replace_shift_selection_test_${suffix}_conformance`;
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
  for (const statement of [
    sql`drop trigger if exists replace_selection_reject_insert on production_shift_selections`,
    sql`drop trigger if exists replace_selection_reject_update on production_shift_selections`,
    sql`drop trigger if exists replace_selection_reject_schedule on schedule_runs`,
    sql`drop trigger if exists replace_selection_slow_event on work_events`,
    sql`drop function if exists replace_selection_return_null()`,
    sql`drop function if exists replace_selection_delay_event()`,
  ])
    await db.execute(statement);
};

export const resetReplaceShiftSelectionConformanceDatabase = async (
  database: ReplaceShiftSelectionConformanceDatabase,
): Promise<void> => {
  await removeFaults(database.db);
  await database.reset();
};

const oldTime = new Date('2026-08-22T12:00:00.000Z');

const orderFixtures = [
  {
    fulfillmentId: ids.fulfillment1,
    demandId: ids.demand1,
    productionOrderId: ids.productionOrder1,
    displayNumber: 'REPLACE-1',
  },
  {
    fulfillmentId: ids.fulfillment2,
    demandId: ids.demand2,
    productionOrderId: ids.productionOrder2,
    displayNumber: 'REPLACE-2',
  },
  {
    fulfillmentId: ids.fulfillment3,
    demandId: ids.demand3,
    productionOrderId: ids.productionOrder3,
    displayNumber: 'REPLACE-3',
  },
] as const;

const seedOrders = async (
  db: PostgresDatabase,
  scenario: ReplaceShiftSelectionScenario,
): Promise<void> => {
  const dueAt = new Date('2026-08-22T20:00:00.000Z');
  await db.insert(productionSchema.orderDemands).values(
    orderFixtures.map((order, index) => ({
      id: order.demandId,
      fulfillmentId: order.fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: String(index + 1).repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: order.displayNumber,
      locationId,
      revisionAt: oldTime,
      phase: 'production_released',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'test_estimate',
      dueAt,
    })),
  );
  await db.insert(productionSchema.productionOrders).values(
    orderFixtures.map((order) => ({
      id: order.productionOrderId,
      orderDemandId: order.demandId,
      locationId,
      dueAt,
      operationalStatus:
        scenario.fixture.readiness === 'not_ready' &&
        order.productionOrderId === ids.productionOrder2
          ? ('intake_pending' as const)
          : ('eligible' as const),
      executionStatus: 'unassigned' as const,
      resolutionState:
        scenario.fixture.readiness === 'resolved' &&
        order.productionOrderId === ids.productionOrder2
          ? ('resolved_without_production' as const)
          : ('open' as const),
      ...(scenario.fixture.readiness === 'resolved' &&
      order.productionOrderId === ids.productionOrder2
        ? {
            resolvedAt: now,
            resolvedBy: ids.actor,
            resolutionReason: 'duplicate_or_test' as const,
          }
        : {}),
      derivedWeightLbs: 20,
      derivedWeightSource: 'test_estimate',
      bagCount:
        scenario.fixture.readiness === 'not_ready' &&
        order.productionOrderId === ids.productionOrder2
          ? null
          : 1,
      bagCountSource:
        scenario.fixture.readiness === 'not_ready' &&
        order.productionOrderId === ids.productionOrder2
          ? null
          : ('operator_intake' as const),
      intakeRecordedAt:
        scenario.fixture.readiness === 'not_ready' &&
        order.productionOrderId === ids.productionOrder2
          ? null
          : oldTime,
      intakeVersion:
        scenario.fixture.readiness === 'not_ready' &&
        order.productionOrderId === ids.productionOrder2
          ? 0
          : 1,
      version: 1,
      eligibleAt: oldTime,
    })),
  );
};

const seedSelection = async (
  db: PostgresDatabase,
  selection: NonNullable<ReplaceShiftSelectionScenario['fixture']['selection']>,
): Promise<void> => {
  await db.insert(productionSchema.productionShiftSelections).values({
    productionShiftId: ids.shift,
    locationId,
    version: 1,
    selectedBy: ids.actor,
    selectedAt: oldTime,
    updatedAt: oldTime,
  });
  const selectedOrderIds =
    selection === 'first_v1' ? [ids.productionOrder1] : [];
  if (selectedOrderIds.length > 0)
    await db.insert(productionSchema.productionShiftSelectedOrders).values(
      selectedOrderIds.map((productionOrderId) => ({
        productionShiftId: ids.shift,
        locationId,
        productionOrderId,
        selectedBy: ids.actor,
        selectedAt: oldTime,
      })),
    );
};

const seedSchedule = async (
  db: PostgresDatabase,
  status: 'accepted' | 'draft' | 'rejected',
): Promise<void> => {
  await db.insert(productionSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
      assertedBy: ids.actor,
      assertedAt: oldTime.toISOString(),
    },
    assertedBy: ids.actor,
    publishedAt: oldTime,
  });
  await db.insert(productionSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status,
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 280,
    plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    createdAt: oldTime,
    acceptedAt: status === 'accepted' ? oldTime : null,
    acceptedBy: status === 'accepted' ? ids.actor : null,
  });
};

const workEventCommand = (
  command: ReplaceShiftSelectionScenario['commands'][number],
) => ({
  operation: 'production_shift_selection_replaced',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_shift',
    entityId: command.productionShiftId,
  },
  expectedVersion: command.expectedVersion,
  payload: { selectedOrderIds: [...command.selectedOrderIds].sort() },
});

const seedStoredReceipt = async (
  db: PostgresDatabase,
  scenario: ReplaceShiftSelectionScenario,
): Promise<void> => {
  const stored = scenario.fixture.storedReceipt;
  const command = scenario.commands[0];
  if (stored === undefined || command === undefined) return;
  const expected = workEventCommand(command);
  const result = {
    selection: {
      productionShiftId: command.productionShiftId,
      version: 1,
      selectedOrderIds: [...command.selectedOrderIds].sort(),
    },
    supersededScheduleRunId: null,
    replayed: false,
  };
  const envelope =
    stored === 'malformed'
      ? { version: 2, command: expected, result }
      : {
          version: 1,
          command:
            stored === 'divergent'
              ? {
                  ...expected,
                  payload: { selectedOrderIds: [ids.productionOrder3] },
                }
              : expected,
          result,
        };
  await db.insert(productionSchema.workEvents).values({
    id: ids.fixtureEvent,
    locationId,
    eventType: 'production_shift_selection_replaced',
    entityType: 'production_shift',
    entityId: ids.shift,
    actorId: ids.actor,
    expectedVersion: command.expectedVersion,
    idempotencyKey: command.idempotencyKey,
    payload: { _idempotency: envelope },
  });
};

const installFault = async (
  db: PostgresDatabase,
  scenario: ReplaceShiftSelectionScenario,
): Promise<void> => {
  const fault = scenario.fixture.fault;
  if (fault === 'selection_insert_cas') {
    await db.execute(
      sql`create function replace_selection_return_null() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await db.execute(
      sql`create trigger replace_selection_reject_insert before insert on production_shift_selections for each row execute function replace_selection_return_null()`,
    );
  }
  if (fault === 'selection_update_cas') {
    await db.execute(
      sql`create function replace_selection_return_null() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await db.execute(
      sql`create trigger replace_selection_reject_update before update on production_shift_selections for each row execute function replace_selection_return_null()`,
    );
  }
  if (fault === 'schedule_cas') {
    await db.execute(
      sql`create function replace_selection_return_null() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await db.execute(
      sql`create trigger replace_selection_reject_schedule before update on schedule_runs for each row execute function replace_selection_return_null()`,
    );
  }
  if (fault === 'slow_event_append') {
    await db.execute(
      sql`create function replace_selection_delay_event() returns trigger language plpgsql as $$ begin perform pg_sleep(0.2); return new; end; $$`,
    );
    await db.execute(
      sql`create trigger replace_selection_slow_event before insert on work_events for each row execute function replace_selection_delay_event()`,
    );
  }
};

export const seedReplaceShiftSelectionConformance = async (
  db: PostgresDatabase,
  scenario: ReplaceShiftSelectionScenario,
): Promise<void> => {
  await db.insert(productionSchema.productionLocations).values({
    id: locationId,
    businessId: ids.business,
    name: 'Replace Shift Selection Conformance Facility',
    timezone: 'America/New_York',
    isActive: true,
    liveRevision: 0,
    createdAt: now,
    updatedAt: now,
  });
  if (scenario.fixture.shift !== 'missing') {
    await db.insert(productionSchema.productionShifts).values({
      id: ids.shift,
      locationId,
      startsAt: new Date('2026-08-22T13:00:00.000Z'),
      endsAt: new Date('2026-08-22T21:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 4,
      version: 1,
    });
    await seedOrders(db, scenario);
    if (
      scenario.fixture.selection !== undefined &&
      scenario.fixture.selection !== null
    )
      await seedSelection(db, scenario.fixture.selection);
    const scheduleStatus = scenario.fixture.currentSchedule;
    if (scheduleStatus !== undefined && scheduleStatus !== null)
      await seedSchedule(db, scheduleStatus);
    if (scenario.fixture.shift === 'started') {
      if (scheduleStatus === undefined || scheduleStatus === null)
        await seedSchedule(db, 'accepted');
      await db.insert(productionSchema.productionRuns).values({
        id: ids.run,
        locationId,
        productionShiftId: ids.shift,
        scheduleRunId: ids.schedule,
        status: 'started',
        startedAt: now,
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-22T21:00:00.000Z'),
        version: 1,
      });
    }
  }
  if (scenario.fixture.fault === 'event_id_collision')
    await db.insert(productionSchema.workEvents).values({
      id: ids.eventA,
      locationId,
      eventType: 'fixture_event',
      entityType: 'fixture',
      entityId: ids.fixtureEvent,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'replace-selection-event-collision-fixture',
      payload: {},
    });
  await seedStoredReceipt(db, scenario);
  await installFault(db, scenario);
};

export const readReplaceShiftSelectionConformanceState = async (
  db: PostgresDatabase,
) => {
  const selections = await db
    .select()
    .from(productionSchema.productionShiftSelections)
    .orderBy(asc(productionSchema.productionShiftSelections.productionShiftId));
  const selectedOrders = await db
    .select()
    .from(productionSchema.productionShiftSelectedOrders)
    .orderBy(
      asc(productionSchema.productionShiftSelectedOrders.productionShiftId),
      asc(productionSchema.productionShiftSelectedOrders.productionOrderId),
    );
  const schedules = await db
    .select({
      id: productionSchema.scheduleRuns.id,
      status: productionSchema.scheduleRuns.status,
      supersededAt: productionSchema.scheduleRuns.supersededAt,
    })
    .from(productionSchema.scheduleRuns)
    .orderBy(asc(productionSchema.scheduleRuns.id));
  const workEvents = await db
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
    .orderBy(asc(productionSchema.workEvents.id));
  const locations = await db
    .select({
      id: productionSchema.productionLocations.id,
      liveRevision: productionSchema.productionLocations.liveRevision,
    })
    .from(productionSchema.productionLocations)
    .orderBy(asc(productionSchema.productionLocations.id));
  return Object.freeze({
    selections,
    selectedOrders,
    schedules,
    workEvents,
    locations,
  });
};
