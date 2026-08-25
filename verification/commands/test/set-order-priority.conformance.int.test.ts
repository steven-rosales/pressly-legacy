import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  runSetOrderPriorityScenario,
  setOrderPriorityFixtureIds,
  setOrderPriorityLocationId,
  setOrderPriorityNow,
  setOrderPriorityScenarios,
  type SetOrderPriorityAuditEvent,
  type SetOrderPriorityFixture,
  type SetOrderPriorityObservation,
  type SetOrderPriorityScenario,
  type SetOrderPriorityState,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

const productionTables = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'production_shifts',
  'order_demands',
  'production_locations',
] as const;

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: productionTables,
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
afterAll(database.close);

const businessId = '00000000-0000-4000-8000-000000000100';
const initialTime = new Date('2026-08-21T07:00:00.000Z');

const makeIds = (): IdSource => {
  let next = 0;
  return {
    next: () =>
      next++ === 0
        ? setOrderPriorityFixtureIds.workEvent
        : `20000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
  };
};

const seedOrder = async (fixture: SetOrderPriorityFixture): Promise<void> => {
  const dueAt = new Date('2026-08-21T20:00:00.000Z');
  const resolved = fixture.resolutionState === 'resolved_without_production';
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: setOrderPriorityLocationId,
      businessId,
      name: 'Priority Conformance Facility',
      timezone: 'America/New_York',
      createdAt: initialTime,
      updatedAt: initialTime,
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: setOrderPriorityFixtureIds.demand,
      fulfillmentId: setOrderPriorityFixtureIds.fulfillment,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: 'ORDER-PRIORITY-CONFORMANCE',
      locationId: setOrderPriorityLocationId,
      revisionAt: initialTime,
      phase: 'production_released',
      estimatedWeightLbs: 25,
      estimatedWeightSource: 'test_estimate',
      dueAt,
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: setOrderPriorityFixtureIds.productionOrder,
      orderDemandId: setOrderPriorityFixtureIds.demand,
      locationId: setOrderPriorityLocationId,
      dueAt,
      priority: false,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      resolutionState: fixture.resolutionState ?? 'open',
      ...(resolved
        ? {
            resolvedAt: setOrderPriorityNow,
            resolvedBy: setOrderPriorityFixtureIds.actor,
            resolutionReason: 'order_will_not_be_produced',
          }
        : {}),
      derivedWeightLbs: 25,
      derivedWeightSource: 'test_estimate',
      version: 2,
      createdAt: initialTime,
      updatedAt: initialTime,
    });
};

const seedAppendFailure = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: setOrderPriorityFixtureIds.workEvent,
      locationId: setOrderPriorityLocationId,
      eventType: 'fixture',
      entityType: 'production_order',
      entityId: setOrderPriorityFixtureIds.productionOrder,
      actorId: setOrderPriorityFixtureIds.actor,
      expectedVersion: 1,
      idempotencyKey: 'priority-conformance-existing-event',
      payload: {},
      createdAt: initialTime,
    });
};

const readState = async (
  db: PostgresDatabase,
): Promise<SetOrderPriorityState> => {
  const [order] = await db
    .select({
      priority:
        presslyPostgresOwnerSchemas.production.productionOrders.priority,
      version: presslyPostgresOwnerSchemas.production.productionOrders.version,
      updatedAt:
        presslyPostgresOwnerSchemas.production.productionOrders.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.production.productionOrders)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionOrders.id,
        setOrderPriorityFixtureIds.productionOrder,
      ),
    );
  if (order === undefined)
    throw new Error('Set-order-priority fixture order is missing.');
  return {
    priority: order.priority,
    version: order.version,
    updatedAt: order.updatedAt.toISOString(),
  };
};

const readLiveRevision = async (db: PostgresDatabase): Promise<number> => {
  const [location] = await db
    .select({
      liveRevision:
        presslyPostgresOwnerSchemas.production.productionLocations.liveRevision,
    })
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionLocations.id,
        setOrderPriorityLocationId,
      ),
    );
  if (location === undefined)
    throw new Error('Set-order-priority fixture location is missing.');
  return location.liveRevision;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readObservableEvents = async (
  scenario: SetOrderPriorityScenario,
): Promise<readonly SetOrderPriorityAuditEvent[]> => {
  const commandKeys = new Set(
    scenario.commands.map((command) => command.idempotencyKey),
  );
  const rows = await database.db
    .select()
    .from(presslyPostgresOwnerSchemas.production.workEvents);
  return rows
    .filter((row) => commandKeys.has(row.idempotencyKey))
    .map((row) => ({
      id: row.id,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      expectedVersion: row.expectedVersion,
      idempotencyKey:
        scenario.normalizeWinningIdempotencyKey === true
          ? '<winning-command>'
          : row.idempotencyKey,
      payload: row.payload,
    }));
};

const observe = async (
  scenario: SetOrderPriorityScenario,
): Promise<SetOrderPriorityObservation> => {
  await database.reset();
  await seedOrder(scenario.fixture);
  if (scenario.fixture.forceWorkEventAppendFailure === true)
    await seedAppendFailure();

  const before = await readState(database.db);
  const revisionBefore = await readLiveRevision(database.db);
  const ids = makeIds();
  const clock = { now: () => new Date(setOrderPriorityNow) };
  const execute = makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database.db,
    ids,
    clock,
  }).cells.setOrderPriority.execute;

  const outcome = await runSetOrderPriorityScenario(execute, scenario);
  const workEvents = await readObservableEvents(scenario);
  const envelope = workEvents[0]?.payload;
  const receipt = isRecord(envelope) ? envelope['_idempotency'] : null;

  return {
    outcome,
    stateDelta: {
      before,
      after: await readState(database.db),
    },
    workEvents,
    idempotencyReceipt: receipt ?? null,
    liveRevision: {
      before: revisionBefore,
      after: await readLiveRevision(database.db),
    },
    signals: [],
  };
};

const expectNoMutation = (observation: SetOrderPriorityObservation): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.workEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
  expect(observation.signals).toEqual([]);
};

const expectOneCommit = (observation: SetOrderPriorityObservation): void => {
  expect(observation.stateDelta).toEqual({
    before: {
      priority: false,
      version: 2,
      updatedAt: initialTime.toISOString(),
    },
    after: {
      priority: true,
      version: 3,
      updatedAt: setOrderPriorityNow.toISOString(),
    },
  });
  expect(observation.workEvents).toHaveLength(1);
  expect(observation.workEvents[0]).toMatchObject({
    id: setOrderPriorityFixtureIds.workEvent,
    eventType: 'production_order_priority_changed',
    entityType: 'production_order',
    entityId: setOrderPriorityFixtureIds.productionOrder,
    actorId: setOrderPriorityFixtureIds.actor,
    expectedVersion: 2,
    payload: {
      priority: true,
      version: 3,
      _idempotency: {
        version: 1,
        result: {
          entityId: setOrderPriorityFixtureIds.productionOrder,
          version: 3,
          replayed: false,
        },
      },
    },
  });
  expect(observation.idempotencyReceipt).not.toBeNull();
  expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
  expect(observation.signals).toEqual([]);
};

describe('production.set-order-priority.v1 behavioral conformance', () => {
  it.each(setOrderPriorityScenarios)('$name', async (scenario) => {
    const observation = await observe(scenario);

    if (scenario.name.startsWith('missing order')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'failure',
          failure: {
            kind: 'not_found',
            code: 'production_order_not_found',
            message: 'The production order was not found.',
            safeMessage: 'The production order was not found.',
            status: null,
          },
        },
      ]);
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('late work event')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'unexpected',
          error: {
            kind: 'DatabaseError',
            code: 'production_priority_failed',
            message: 'Order priority could not be updated.',
            safeMessage: 'Order priority could not be updated.',
            status: 503,
          },
        },
      ]);
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('stale expected version')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'production_order_version_conflict',
            message: 'The order changed before priority could be updated.',
            safeMessage: 'The order changed before priority could be updated.',
            status: null,
          },
        },
      ]);
      expectNoMutation(observation);
      return;
    }

    if (scenario.name.startsWith('archived order')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'production_order_resolved',
            message: 'This order is archived from active production work.',
            safeMessage: 'This order is archived from active production work.',
            status: null,
          },
        },
      ]);
      expectNoMutation(observation);
      return;
    }

    expectOneCommit(observation);
    if (scenario.name.startsWith('same version race')) {
      expect(observation.outcome).toHaveLength(2);
      expect(observation.outcome).toContainEqual({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_order_version_conflict',
          message: 'The order changed before priority could be updated.',
          safeMessage: 'The order changed before priority could be updated.',
          status: null,
        },
      });
      return;
    }

    if (scenario.name.startsWith('same key and same payload')) {
      expect(observation.outcome.map((entry) => entry.kind)).toEqual([
        'success',
        'success',
      ]);
      expect(observation.outcome[1]).toMatchObject({
        kind: 'success',
        value: { replayed: true },
      });
      return;
    }

    if (scenario.name.startsWith('same key and different payload'))
      expect(observation.outcome[1]).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_idempotency_conflict' },
      });
  });
});
