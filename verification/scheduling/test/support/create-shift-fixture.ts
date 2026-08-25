import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { PostgresDatabase } from '@pressly/postgres/client';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  createShiftConformanceIds as ids,
  createShiftConformanceLocationId as locationId,
  type CreateShiftConformanceFixture,
  type CreateShiftConformanceState,
} from '../../src/public.ts';

const productionSchema = presslyPostgresOwnerSchemas.production;

export const createCreateShiftConformanceDatabase = () =>
  createTestDatabaseRuntime({
    databaseUrl: getTestDatabaseUrl(
      'PRESSLY_TEST_DATABASE_URL',
      'postgres://pressly:pressly@localhost:55434/pressly_test',
    ),
    tableNames: ['work_events', 'production_shifts', 'production_locations'],
    maxConnections: 1,
    ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
      ? {}
      : {
          resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
        }),
  });

export const seedCreateShiftConformance = async (
  database: PostgresDatabase,
  fixture: CreateShiftConformanceFixture,
): Promise<void> => {
  await database.insert(productionSchema.productionLocations).values({
    id: locationId,
    businessId: ids.business,
    name: 'Create Shift Conformance Facility',
    timezone: 'America/New_York',
  });

  if (fixture === 'shift-id-conflict')
    await database.insert(productionSchema.productionShifts).values({
      id: ids.shift,
      locationId,
      startsAt: new Date('2026-08-21T13:00:00.000Z'),
      endsAt: new Date('2026-08-21T21:00:00.000Z'),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      status: 'closed',
      version: 7,
    });

  if (fixture === 'event-id-conflict')
    await database.insert(productionSchema.workEvents).values({
      id: ids.event,
      locationId,
      eventType: 'fixture_event',
      entityType: 'fixture',
      entityId: ids.shift,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'create-shift-existing-event-1',
      payload: { fixture: true },
    });
};

export const readCreateShiftConformanceState = async (
  database: PostgresDatabase,
): Promise<CreateShiftConformanceState> => {
  const shifts = (
    await database.select().from(productionSchema.productionShifts)
  )
    .map((shift) => ({
      id: shift.id,
      locationId: shift.locationId,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      timezone: shift.timezone,
      effectiveFolderCount: shift.effectiveFolderCount,
      status: shift.status,
      version: shift.version,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const workEvents = (await database.select().from(productionSchema.workEvents))
    .map((event) => ({
      id: event.id,
      locationId: event.locationId,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorId: event.actorId,
      expectedVersion: event.expectedVersion,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const [location] = await database
    .select({
      liveRevision: productionSchema.productionLocations.liveRevision,
    })
    .from(productionSchema.productionLocations);
  return Object.freeze({
    shifts: Object.freeze(shifts),
    workEvents: Object.freeze(workEvents),
    liveRevision: location?.liveRevision ?? -1,
  });
};
