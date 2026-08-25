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
  makeUpdateShiftConformanceCommand,
  updateShiftConformanceIds as ids,
  updateShiftConformanceInitialTime as initialTime,
  updateShiftConformanceLocationId as locationId,
  updateShiftConformanceNow as now,
  updateShiftConformanceOriginalEnd as originalEnd,
  updateShiftConformanceOriginalStart as originalStart,
  type UpdateShiftFixture,
  type UpdateShiftState,
} from '../../src/update-shift-conformance.ts';

const productionSchema = presslyPostgresOwnerSchemas.production;

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const tableNames = [
  'work_events',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_shifts',
  'production_locations',
] as const;

const adminDatabaseUrl =
  process.env['PRESSLY_UPDATE_SHIFT_ADMIN_DATABASE_URL'] ??
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

export type UpdateShiftConformanceDatabase = TestDatabaseRuntime &
  Readonly<{
    name: string;
    url: string;
  }>;

export type UpdateShiftConformanceDatabaseRuntime = Readonly<{
  database: UpdateShiftConformanceDatabase;
  setup: () => Promise<void>;
  closeForceDropAndVerifyAbsent: () => Promise<boolean>;
}>;

export const createUpdateShiftConformanceDatabase =
  (): UpdateShiftConformanceDatabaseRuntime => {
    const suffix = `${process.pid}_${Date.now().toString(36)}`;
    const name = `pressly_update_shift_test_${suffix}_conformance`;
    const url = databaseUrl(name);
    const database = Object.freeze({
      name,
      url,
      ...createTestDatabaseRuntime({
        databaseUrl: url,
        tableNames,
        maxConnections: 8,
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
    sql`drop trigger if exists update_shift_conformance_shift_cas on production_shifts`,
  );
  await db.execute(
    sql`drop trigger if exists update_shift_conformance_schedule_cas on schedule_runs`,
  );
  await db.execute(
    sql`drop trigger if exists update_shift_conformance_slow_event on work_events`,
  );
  await db.execute(
    sql`drop function if exists update_shift_conformance_reject_shift_update()`,
  );
  await db.execute(
    sql`drop function if exists update_shift_conformance_reject_schedule_update()`,
  );
  await db.execute(
    sql`drop function if exists update_shift_conformance_delay_event_append()`,
  );
};

export const resetUpdateShiftConformanceDatabase = async (
  database: UpdateShiftConformanceDatabase,
): Promise<void> => {
  await removeFaults(database.db);
  await database.reset();
};

const seedLocations = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(productionSchema.productionLocations).values({
    id: locationId,
    businessId: ids.business,
    name: 'Update Shift Conformance Facility',
    timezone: 'America/New_York',
    isActive: true,
    liveRevision: 0,
    createdAt: initialTime,
    updatedAt: initialTime,
  });
};

const seedShift = async (
  db: PostgresDatabase,
  fixture: UpdateShiftFixture,
): Promise<void> => {
  if (fixture.shift === 'absent') return;
  const replayed = fixture.shift === 'replayed_result';
  await db.insert(productionSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: replayed ? new Date('2026-08-22T12:30:00.000Z') : originalStart,
    endsAt: replayed ? new Date('2026-08-22T22:00:00.000Z') : originalEnd,
    timezone: 'America/New_York',
    effectiveFolderCount: replayed ? 4 : 2,
    status: fixture.shift === 'closed' ? 'closed' : 'open',
    version: fixture.shift === 'open_version_2' || replayed ? 2 : 1,
    createdAt: initialTime,
    updatedAt: replayed ? now : initialTime,
  });
};

const seedSchedule = async (
  db: PostgresDatabase,
  fixture: UpdateShiftFixture,
): Promise<void> => {
  if (fixture.scheduleStatus == null && fixture.runExists !== true) return;
  const status = fixture.scheduleStatus ?? 'accepted';
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
    },
    assertedBy: ids.actor,
    publishedAt: initialTime,
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
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: originalStart,
    warnings: [],
    acknowledgedWarningCodes: [],
    createdAt: initialTime,
    ...(status === 'accepted'
      ? { acceptedAt: initialTime, acceptedBy: ids.actor }
      : {}),
  });
  if (fixture.runExists !== true) return;
  await db.insert(productionSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: initialTime,
    plannedCompletionAt: originalEnd,
    version: 1,
    queueVersion: 1,
    createdAt: initialTime,
    updatedAt: initialTime,
  });
};

const resultForStoredReplay = () => ({
  productionShift: {
    id: ids.shift,
    locationId,
    startsAt: '2026-08-22T12:30:00.000Z',
    endsAt: '2026-08-22T22:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 4,
    status: 'open',
    version: 2,
  },
  supersededScheduleRunId: null,
  replayed: false,
});

const commandEnvelope = (input: { divergent: boolean }) => {
  const command = makeUpdateShiftConformanceCommand({
    idempotencyKey: input.divergent
      ? 'update-shift-divergent'
      : 'update-shift-stored-replay',
  });
  return {
    operation: 'production_shift_updated',
    locationId,
    actorId: ids.actor,
    target: { entityType: 'production_shift', entityId: ids.shift },
    expectedVersion: 1,
    payload: {
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      effectiveFolderCount: input.divergent ? 99 : command.effectiveFolderCount,
    },
  };
};

const seedStoredReceipt = async (
  db: PostgresDatabase,
  fixture: UpdateShiftFixture,
): Promise<void> => {
  const stored = fixture.storedReceipt;
  if (stored === undefined) return;
  const idempotencyKey =
    stored === 'matching'
      ? 'update-shift-stored-replay'
      : stored === 'divergent'
        ? 'update-shift-divergent'
        : 'update-shift-malformed';
  const envelope =
    stored === 'malformed'
      ? { version: 2, command: {}, result: {} }
      : {
          version: 1,
          command: commandEnvelope({ divergent: stored === 'divergent' }),
          result: resultForStoredReplay(),
        };
  await db.insert(productionSchema.workEvents).values({
    id: ids.evidence,
    locationId,
    eventType: 'production_shift_updated',
    entityType: 'production_shift',
    entityId: ids.shift,
    actorId: ids.actor,
    expectedVersion: 1,
    idempotencyKey,
    payload: { _idempotency: envelope },
    createdAt: initialTime,
  });
};

const seedEventCollision = async (
  db: PostgresDatabase,
  fixture: UpdateShiftFixture,
): Promise<void> => {
  if (fixture.fault !== 'event_append') return;
  await db.insert(productionSchema.workEvents).values({
    id: ids.collision,
    locationId,
    eventType: 'fixture_collision',
    entityType: 'production_shift',
    entityId: ids.shift,
    actorId: ids.actor,
    expectedVersion: null,
    idempotencyKey: 'update-shift-collision-evidence',
    payload: {},
    createdAt: initialTime,
  });
};

const installFault = async (
  db: PostgresDatabase,
  fixture: UpdateShiftFixture,
): Promise<void> => {
  if (fixture.fault === 'shift_cas') {
    await db.execute(
      sql`create function update_shift_conformance_reject_shift_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await db.execute(
      sql`create trigger update_shift_conformance_shift_cas before update on production_shifts for each row execute function update_shift_conformance_reject_shift_update()`,
    );
  }
  if (fixture.fault === 'schedule_cas') {
    await db.execute(
      sql`create function update_shift_conformance_reject_schedule_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await db.execute(
      sql`create trigger update_shift_conformance_schedule_cas before update on schedule_runs for each row execute function update_shift_conformance_reject_schedule_update()`,
    );
  }
  if (fixture.fault === 'slow_event_append') {
    await db.execute(
      sql`create function update_shift_conformance_delay_event_append() returns trigger language plpgsql as $$ begin perform pg_sleep(0.2); return new; end; $$`,
    );
    await db.execute(
      sql`create trigger update_shift_conformance_slow_event before insert on work_events for each row execute function update_shift_conformance_delay_event_append()`,
    );
  }
};

export const seedUpdateShiftConformance = async (
  db: PostgresDatabase,
  fixture: UpdateShiftFixture,
): Promise<void> => {
  await seedLocations(db);
  await seedShift(db, fixture);
  await seedSchedule(db, fixture);
  await seedStoredReceipt(db, fixture);
  await seedEventCollision(db, fixture);
  await installFault(db, fixture);
};

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export const readUpdateShiftConformanceState = async (
  db: PostgresDatabase,
): Promise<UpdateShiftState> => {
  const shifts = await db
    .select()
    .from(productionSchema.productionShifts)
    .orderBy(asc(productionSchema.productionShifts.id));
  const schedules = await db
    .select()
    .from(productionSchema.scheduleRuns)
    .orderBy(asc(productionSchema.scheduleRuns.id));
  const runs = await db
    .select()
    .from(productionSchema.productionRuns)
    .orderBy(asc(productionSchema.productionRuns.id));
  const workEvents = await db
    .select()
    .from(productionSchema.workEvents)
    .orderBy(asc(productionSchema.workEvents.id));
  const [location] = await db
    .select({
      liveRevision: productionSchema.productionLocations.liveRevision,
    })
    .from(productionSchema.productionLocations)
    .where(eq(productionSchema.productionLocations.id, locationId));

  return Object.freeze({
    shifts: Object.freeze(
      shifts.map((shift) => ({
        id: shift.id,
        locationId: shift.locationId,
        startsAt: shift.startsAt.toISOString(),
        endsAt: shift.endsAt.toISOString(),
        timezone: shift.timezone,
        effectiveFolderCount: shift.effectiveFolderCount,
        status: shift.status,
        version: shift.version,
        createdAt: shift.createdAt.toISOString(),
        updatedAt: shift.updatedAt.toISOString(),
      })),
    ),
    schedules: Object.freeze(
      schedules.map((schedule) => ({
        id: schedule.id,
        locationId: schedule.locationId,
        productionShiftId: schedule.productionShiftId,
        status: schedule.status,
        acceptedAt: iso(schedule.acceptedAt),
        acceptedBy: schedule.acceptedBy,
        supersededAt: iso(schedule.supersededAt),
      })),
    ),
    runs: Object.freeze(
      runs.map((runRow) => ({
        id: runRow.id,
        locationId: runRow.locationId,
        productionShiftId: runRow.productionShiftId,
        scheduleRunId: runRow.scheduleRunId,
        status: runRow.status,
        version: runRow.version,
      })),
    ),
    workEvents: Object.freeze(
      workEvents.map((event) => ({
        id: event.id,
        locationId: event.locationId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId: event.actorId,
        expectedVersion: event.expectedVersion,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
      })),
    ),
    liveRevision: location?.liveRevision ?? 0,
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readUpdateShiftIdempotencyReceipts = (
  state: UpdateShiftState,
  keys: readonly string[],
): readonly unknown[] => {
  const selected = new Set(keys);
  return Object.freeze(
    state.workEvents
      .filter((event) => selected.has(event.idempotencyKey))
      .map((event) =>
        isRecord(event.payload)
          ? (event.payload['_idempotency'] ?? null)
          : null,
      ),
  );
};
