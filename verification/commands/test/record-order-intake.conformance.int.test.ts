import {
  createPostgresRuntime,
  type PostgresDatabase,
} from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { RecordOrderIntakeCommand } from '@pressly/production-system/operations/demand/record-order-intake/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  recordOrderIntakeAlternateLocationId as alternateLocationId,
  recordOrderIntakeFixtureIds as ids,
  recordOrderIntakeLocationId as locationId,
  recordOrderIntakeNow,
  recordOrderIntakeScenarios,
  runRecordOrderIntakeScenario,
  type RecordOrderIntakeAuditEvent,
  type RecordOrderIntakeBag,
  type RecordOrderIntakeFixture,
  type RecordOrderIntakeObservation,
  type RecordOrderIntakeScenario,
  type RecordOrderIntakeState,
  type RecordOrderIntakeTransactionObservation,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);

const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
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
  ],
  maxConnections: 4,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: presslyPostgresOwnerSchemas.production,
  maxConnections: 1,
});

const removeLateCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists record_order_intake_conformance_late_cas on production_orders`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists record_order_intake_conformance_reject_update()`,
  );
};

const installLateCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`create function record_order_intake_conformance_reject_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  await faultDatabase.db.execute(
    sql`create trigger record_order_intake_conformance_late_cas before update on production_orders for each row execute function record_order_intake_conformance_reject_update()`,
  );
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
afterAll(async () => {
  await removeLateCasFault();
  await faultDatabase.close();
  await database.close();
});

const initialTime = new Date('2026-08-21T12:00:00.000Z');

const makeIds = (): IdSource => {
  let next = 0;
  return {
    next: () =>
      ids.generated[next++] ??
      `64000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
  };
};

const seed = async (fixture: RecordOrderIntakeFixture): Promise<void> => {
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Record Order Intake Conformance Facility',
      timezone: 'America/New_York',
      createdAt: initialTime,
      updatedAt: initialTime,
    },
    {
      id: alternateLocationId,
      businessId: ids.business,
      name: 'Other Record Order Intake Facility',
      timezone: 'America/New_York',
      createdAt: initialTime,
      updatedAt: initialTime,
    },
  ]);
  if (fixture.includeOrder === false) return;

  const dueAt = new Date('2026-08-22T20:00:00.000Z');
  const phase = fixture.phase ?? 'production_released';
  const admissionState =
    phase === 'production_released'
      ? 'released'
      : phase === 'withdrawn'
        ? 'withdrawn'
        : 'unreleased';
  const bagCount = fixture.bagCount === undefined ? null : fixture.bagCount;
  const intakeVersion = fixture.intakeVersion ?? (bagCount === null ? 0 : 1);
  const resolutionState = fixture.resolutionState ?? 'open';
  const admissionOverride = fixture.admissionOverride ?? null;
  const operationalStatus =
    fixture.operationalStatus ??
    (bagCount === null ? 'intake_pending' : 'eligible');

  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: ids.demand,
      fulfillmentId: ids.fulfillment,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState,
      commercialState: 'open',
      displayReference: 'RECORD-INTAKE-1',
      locationId,
      revisionAt: initialTime,
      phase,
      estimatedWeightLbs: 25,
      estimatedWeightSource: 'test_estimate',
      dueAt,
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: ids.productionOrder,
      orderDemandId: ids.demand,
      locationId,
      dueAt,
      priority: false,
      operationalStatus,
      executionStatus: fixture.executionStatus ?? 'unassigned',
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
        ? {
            resolvedAt: initialTime,
            resolvedBy: ids.actor,
            resolutionReason: 'other',
            resolutionNote: 'Archived conformance fixture',
          }
        : {}),
      derivedWeightLbs: 25,
      derivedWeightSource: 'test_estimate',
      bagCount,
      bagCountSource: bagCount === null ? null : 'operator_intake',
      intakeRecordedAt: bagCount === null ? null : initialTime,
      intakeVersion,
      admissionOverride,
      admissionOverrideAt: admissionOverride === null ? null : initialTime,
      admissionOverrideBy: admissionOverride === null ? null : ids.actor,
      eligibleAt: operationalStatus === 'eligible' ? initialTime : null,
      version: fixture.version ?? 1,
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  if (bagCount !== null && bagCount > 0)
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.bags)
      .values(
        Array.from({ length: bagCount }, (_, bagIndex) => ({
          id:
            ids.existingBags[bagIndex] ??
            `65000000-0000-4000-8000-${String(bagIndex).padStart(12, '0')}`,
          productionOrderId: ids.productionOrder,
          bagIndex,
          status: 'eligible',
        })),
      );

  if (fixture.forceWorkEventAppendFailure === true)
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.workEvents)
      .values({
        id: ids.generated[3],
        locationId,
        eventType: 'fixture',
        entityType: 'production_order',
        entityId: ids.productionOrder,
        actorId: ids.actor,
        expectedVersion: 1,
        idempotencyKey: 'record-order-intake-conformance-existing-event',
        payload: {},
        createdAt: initialTime,
      });
};

const readState = async (
  db: PostgresDatabase,
): Promise<RecordOrderIntakeState> => {
  const [order] = await db
    .select({
      bagCount:
        presslyPostgresOwnerSchemas.production.productionOrders.bagCount,
      bagCountSource:
        presslyPostgresOwnerSchemas.production.productionOrders.bagCountSource,
      intakeRecordedAt:
        presslyPostgresOwnerSchemas.production.productionOrders
          .intakeRecordedAt,
      intakeVersion:
        presslyPostgresOwnerSchemas.production.productionOrders.intakeVersion,
      status:
        presslyPostgresOwnerSchemas.production.productionOrders
          .operationalStatus,
      eligibleAt:
        presslyPostgresOwnerSchemas.production.productionOrders.eligibleAt,
      version: presslyPostgresOwnerSchemas.production.productionOrders.version,
      updatedAt:
        presslyPostgresOwnerSchemas.production.productionOrders.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.production.productionOrders)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionOrders.id,
        ids.productionOrder,
      ),
    );
  return order === undefined
    ? null
    : {
        bagCount: order.bagCount,
        bagCountSource: order.bagCountSource,
        intakeRecordedAt: order.intakeRecordedAt?.toISOString() ?? null,
        intakeVersion: order.intakeVersion,
        status: order.status,
        eligibleAt: order.eligibleAt?.toISOString() ?? null,
        version: order.version,
        updatedAt: order.updatedAt.toISOString(),
      };
};

const readBags = async (
  db: PostgresDatabase,
): Promise<readonly RecordOrderIntakeBag[]> =>
  db
    .select({
      id: presslyPostgresOwnerSchemas.production.bags.id,
      bagIndex: presslyPostgresOwnerSchemas.production.bags.bagIndex,
      status: presslyPostgresOwnerSchemas.production.bags.status,
    })
    .from(presslyPostgresOwnerSchemas.production.bags)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.bags.productionOrderId,
        ids.productionOrder,
      ),
    )
    .orderBy(asc(presslyPostgresOwnerSchemas.production.bags.bagIndex));

const readLiveRevision = async (db: PostgresDatabase): Promise<number> => {
  const [location] = await db
    .select({
      revision:
        presslyPostgresOwnerSchemas.production.productionLocations.liveRevision,
    })
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionLocations.id,
        locationId,
      ),
    );
  return location?.revision ?? -1;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readEvents = async (
  scenario: RecordOrderIntakeScenario,
): Promise<readonly RecordOrderIntakeAuditEvent[]> => {
  const keys = new Set(
    scenario.commands.map((command) => command.idempotencyKey),
  );
  const rows = await database.db
    .select()
    .from(presslyPostgresOwnerSchemas.production.workEvents)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id));
  return rows
    .filter((row) => keys.has(row.idempotencyKey))
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

const sortedTelemetry = (
  values: readonly RecordOrderIntakeTransactionObservation[],
): readonly RecordOrderIntakeTransactionObservation[] =>
  [...values].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const observe = async (
  scenario: RecordOrderIntakeScenario,
): Promise<RecordOrderIntakeObservation> => {
  await removeLateCasFault();
  await database.reset();
  await seed(scenario.fixture);
  if (scenario.fixture.forceLateCas === true) await installLateCasFault();

  const before = await readState(database.db);
  const bagsBefore = await readBags(database.db);
  const revisionBefore = await readLiveRevision(database.db);
  const telemetry: RecordOrderIntakeTransactionObservation[] = [];
  const generatedIds = makeIds();
  const clock = { now: () => new Date(recordOrderIntakeNow) };

  const execute: (command: RecordOrderIntakeCommand) => Promise<unknown> =
    makeProductionSystem({
      ...productionCommandSystemDependencies(),
      db: database.db,
      ids: generatedIds,
      clock,
      observeCellUnitOfWork: (operation, unitOfWork) => ({
        transaction: async (work) => {
          try {
            const outcome = await unitOfWork.transaction(work);
            telemetry.push({
              operation,
              outcome: outcome.tag === 'ok' ? 'committed' : 'expected_rollback',
            });
            return outcome;
          } catch (error) {
            telemetry.push({ operation, outcome: 'failed' });
            throw error;
          }
        },
      }),
    }).cells.recordOrderIntake.execute;

  const outcome = await runRecordOrderIntakeScenario(execute, scenario);
  const workEvents = await readEvents(scenario);
  const payload = workEvents[0]?.payload;
  const receipt = isRecord(payload) ? payload['_idempotency'] : null;
  return {
    outcome,
    stateDelta: { before, after: await readState(database.db) },
    bags: { before: bagsBefore, after: await readBags(database.db) },
    workEvents,
    idempotencyReceipt: receipt ?? null,
    liveRevision: {
      before: revisionBefore,
      after: await readLiveRevision(database.db),
    },
    signals: [],
    telemetry: sortedTelemetry(telemetry),
  };
};

const expectNoMutation = (observation: RecordOrderIntakeObservation): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.bags.after).toEqual(observation.bags.before);
  expect(observation.workEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
  expect(observation.signals).toEqual([]);
};

const expectedTargetTelemetry = (
  scenario: RecordOrderIntakeScenario,
): readonly RecordOrderIntakeTransactionObservation[] => {
  if (scenario.name.startsWith('success replay'))
    return sortedTelemetry([
      { operation: 'production.record_order_intake', outcome: 'committed' },
      { operation: 'production.record_order_intake', outcome: 'committed' },
      {
        operation: 'production.record_order_intake',
        outcome: 'expected_rollback',
      },
    ]);
  if (scenario.name.startsWith('same production version race'))
    return sortedTelemetry([
      { operation: 'production.record_order_intake', outcome: 'committed' },
      {
        operation: 'production.record_order_intake',
        outcome: 'expected_rollback',
      },
    ]);
  if (scenario.fixture.forceWorkEventAppendFailure === true)
    return [{ operation: 'production.record_order_intake', outcome: 'failed' }];
  if (scenario.name.startsWith('missing and cross-location'))
    return [
      {
        operation: 'production.record_order_intake',
        outcome: 'expected_rollback',
      },
      {
        operation: 'production.record_order_intake',
        outcome: 'expected_rollback',
      },
    ];
  if (
    scenario.name.startsWith('authoritative zero') ||
    scenario.name.startsWith('unreleased demand remains') ||
    scenario.name.startsWith('manager release override')
  )
    return [
      { operation: 'production.record_order_intake', outcome: 'committed' },
    ];
  return [
    {
      operation: 'production.record_order_intake',
      outcome: 'expected_rollback',
    },
  ];
};

describe('production.record-order-intake.v1 target conformance', () => {
  it.each(recordOrderIntakeScenarios)('$name', async (scenario) => {
    const target = await observe(scenario);

    expect(target.telemetry).toEqual(expectedTargetTelemetry(scenario));
    expect(target.signals).toEqual([]);

    if (scenario.name.startsWith('success replay')) {
      expect(target.outcome).toEqual([
        {
          kind: 'success',
          value: {
            locationId,
            orderId: ids.productionOrder,
            bagCount: 3,
            bagCountProvenance: 'operator_intake',
            intakeVersion: 1,
            version: 2,
            replayed: false,
          },
        },
        {
          kind: 'success',
          value: {
            locationId,
            orderId: ids.productionOrder,
            bagCount: 3,
            bagCountProvenance: 'operator_intake',
            intakeVersion: 1,
            version: 2,
            replayed: true,
          },
        },
        {
          kind: 'failure',
          failure: expect.objectContaining({
            code: 'production_idempotency_conflict',
          }),
        },
      ]);
      expect(target.stateDelta.after).toEqual({
        bagCount: 3,
        bagCountSource: 'operator_intake',
        intakeRecordedAt: recordOrderIntakeNow.toISOString(),
        intakeVersion: 1,
        status: 'eligible',
        eligibleAt: recordOrderIntakeNow.toISOString(),
        version: 2,
        updatedAt: recordOrderIntakeNow.toISOString(),
      });
      expect(target.bags.after).toEqual(
        ids.generated.slice(0, 3).map((id, bagIndex) => ({
          id,
          bagIndex,
          status: 'eligible',
        })),
      );
      expect(target.workEvents).toEqual([
        {
          id: ids.generated[3],
          eventType: 'production_order_intake_recorded',
          entityType: 'production_order',
          entityId: ids.productionOrder,
          actorId: ids.actor,
          expectedVersion: 1,
          idempotencyKey: 'record-order-intake-conformance-replay',
          payload: {
            bagCount: 3,
            bagCountProvenance: 'operator_intake',
            intakeVersion: 1,
            version: 2,
            _idempotency: {
              version: 1,
              command: {
                operation: 'production_order_intake_recorded',
                locationId,
                actorId: ids.actor,
                target: {
                  entityType: 'production_order',
                  entityId: ids.productionOrder,
                },
                expectedVersion: 1,
                payload: { bagCount: 3 },
              },
              result: {
                locationId,
                orderId: ids.productionOrder,
                bagCount: 3,
                bagCountProvenance: 'operator_intake',
                intakeVersion: 1,
                version: 2,
                replayed: false,
              },
            },
          },
        },
      ]);
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    if (scenario.name.startsWith('authoritative zero')) {
      expect(target.outcome).toMatchObject([
        {
          kind: 'success',
          value: { bagCount: 0, intakeVersion: 2, version: 5 },
        },
      ]);
      expect(target.stateDelta.after).toMatchObject({
        bagCount: 0,
        bagCountSource: 'operator_intake',
        intakeVersion: 2,
        version: 5,
      });
      expect(target.bags.after).toEqual([]);
      expect(target.workEvents).toHaveLength(1);
      expect(target.idempotencyReceipt).toMatchObject({
        version: 1,
        result: { bagCount: 0, intakeVersion: 2, version: 5 },
      });
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    if (scenario.name.startsWith('unreleased demand remains')) {
      expect(target.outcome).toMatchObject([{ kind: 'success' }]);
      expect(target.stateDelta.after).toMatchObject({
        status: 'release_pending',
        eligibleAt: null,
        intakeVersion: 1,
        version: 2,
      });
      expect(target.workEvents).toHaveLength(1);
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    if (scenario.name.startsWith('manager release override')) {
      expect(target.outcome).toMatchObject([{ kind: 'success' }]);
      expect(target.stateDelta.after).toMatchObject({
        status: 'eligible',
        eligibleAt: recordOrderIntakeNow.toISOString(),
        intakeVersion: 1,
        version: 2,
      });
      expect(target.workEvents).toHaveLength(1);
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    if (scenario.name.startsWith('same production version race')) {
      expect(
        target.outcome.filter((outcome) => outcome.kind === 'success'),
      ).toHaveLength(1);
      expect(target.outcome).toContainEqual(
        expect.objectContaining({
          kind: 'failure',
          failure: expect.objectContaining({
            code: 'production_order_version_conflict',
          }),
        }),
      );
      expect(target.stateDelta.after).toMatchObject({
        bagCount: 3,
        intakeVersion: 1,
        version: 2,
      });
      expect(target.bags.after).toHaveLength(3);
      expect(target.workEvents).toHaveLength(1);
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    const code = scenario.name.startsWith('missing and cross-location')
      ? 'production_order_not_found'
      : scenario.name.startsWith('stale production version') ||
          scenario.name.startsWith('late production-version CAS')
        ? 'production_order_version_conflict'
        : scenario.name.startsWith('archived production order')
          ? 'production_order_resolved'
          : scenario.name.startsWith('scheduled production order')
            ? 'production_order_intake_state_invalid'
            : scenario.name.startsWith('withdrawn demand')
              ? 'order_demand_withdrawn'
              : scenario.name.startsWith('post-production demand')
                ? 'order_source_already_post_production'
                : 'production_intake_failed';
    for (const outcome of target.outcome) {
      const outcomeCode =
        outcome.kind === 'failure'
          ? outcome.failure.code
          : outcome.kind === 'unexpected'
            ? outcome.error.code
            : 'unexpected_success';
      expect(outcomeCode).toBe(code);
    }
    expectNoMutation(target);
  });
});
