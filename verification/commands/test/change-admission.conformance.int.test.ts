import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { ChangeAdmissionCommand } from '@pressly/production-system/operations/demand/change-admission/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  changeAdmissionFixtureIds as ids,
  changeAdmissionLocationId as locationId,
  changeAdmissionNow,
  changeAdmissionScenarios,
  runChangeAdmissionScenario,
  type ChangeAdmissionAuditEvent,
  type ChangeAdmissionFixture,
  type ChangeAdmissionObservation,
  type ChangeAdmissionScenario,
  type ChangeAdmissionState,
  type ChangeAdmissionTransactionObservation,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
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
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
afterAll(database.close);

const initialTime = new Date('2026-08-21T12:00:00.000Z');

const makeIds = (): IdSource => {
  let next = 0;
  return {
    next: () =>
      next++ === 0
        ? ids.workEvent
        : `62000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
  };
};

const seed = async (fixture: ChangeAdmissionFixture): Promise<void> => {
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Change Admission Conformance Facility',
      timezone: 'America/New_York',
      createdAt: initialTime,
      updatedAt: initialTime,
    },
  ]);
  if (fixture.includeOrder !== false) {
    const dueAt = new Date('2026-08-22T20:00:00.000Z');
    const sourceAdmissionState = fixture.sourceAdmissionState ?? 'unreleased';
    const admissionOverride = fixture.admissionOverride ?? null;
    const bagCount = fixture.bagCount === undefined ? 2 : fixture.bagCount;
    const resolutionState = fixture.resolutionState ?? 'open';
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.orderDemands)
      .values({
        id: ids.demand,
        fulfillmentId: ids.fulfillment,
        fulfillmentVersion: 1,
        projectionHash: 'a'.repeat(64),
        admissionState: sourceAdmissionState,
        commercialState: 'open',
        displayReference: 'CHANGE-ADMISSION-1',
        locationId,
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
        id: ids.productionOrder,
        orderDemandId: ids.demand,
        locationId,
        dueAt,
        priority: false,
        operationalStatus: fixture.operationalStatus ?? 'release_pending',
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
        intakeVersion: bagCount === null ? 0 : 1,
        admissionOverride,
        admissionOverrideAt: admissionOverride === null ? null : initialTime,
        admissionOverrideBy: admissionOverride === null ? null : ids.actor,
        version: fixture.version ?? 1,
        createdAt: initialTime,
        updatedAt: initialTime,
      });
  }

  if (fixture.selectedForShift === true) {
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.productionShifts)
      .values({
        id: ids.shift,
        locationId,
        startsAt: changeAdmissionNow,
        endsAt: new Date('2026-08-21T22:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 2,
      });
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.productionShiftSelections)
      .values({
        productionShiftId: ids.shift,
        locationId,
        version: 1,
        selectedBy: ids.actor,
        selectedAt: changeAdmissionNow,
        updatedAt: changeAdmissionNow,
      });
    await database.db
      .insert(
        presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
      )
      .values({
        productionShiftId: ids.shift,
        locationId,
        productionOrderId: ids.productionOrder,
        selectedBy: ids.actor,
        selectedAt: changeAdmissionNow,
      });
  }

  if (fixture.forceWorkEventAppendFailure === true)
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.workEvents)
      .values({
        id: ids.workEvent,
        locationId,
        eventType: 'fixture',
        entityType: 'production_order',
        entityId: ids.productionOrder,
        actorId: ids.actor,
        expectedVersion: 1,
        idempotencyKey: 'change-admission-conformance-existing-event',
        payload: {},
        createdAt: initialTime,
      });
};

const readState = async (
  db: PostgresDatabase,
): Promise<ChangeAdmissionState> => {
  const [order] = await db
    .select({
      admissionOverride:
        presslyPostgresOwnerSchemas.production.productionOrders
          .admissionOverride,
      admissionOverrideAt:
        presslyPostgresOwnerSchemas.production.productionOrders
          .admissionOverrideAt,
      admissionOverrideBy:
        presslyPostgresOwnerSchemas.production.productionOrders
          .admissionOverrideBy,
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
        admissionOverride:
          order.admissionOverride === 'released' ? 'released' : null,
        admissionOverrideAt: order.admissionOverrideAt?.toISOString() ?? null,
        admissionOverrideBy: order.admissionOverrideBy,
        status: order.status,
        eligibleAt: order.eligibleAt?.toISOString() ?? null,
        version: order.version,
        updatedAt: order.updatedAt.toISOString(),
      };
};

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
  scenario: ChangeAdmissionScenario,
): Promise<readonly ChangeAdmissionAuditEvent[]> => {
  const keys = new Set(
    scenario.commands.map((command) => command.idempotencyKey),
  );
  const rows = await database.db
    .select()
    .from(presslyPostgresOwnerSchemas.production.workEvents);
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
  values: readonly ChangeAdmissionTransactionObservation[],
): readonly ChangeAdmissionTransactionObservation[] =>
  [...values].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const observe = async (
  scenario: ChangeAdmissionScenario,
): Promise<ChangeAdmissionObservation> => {
  await database.reset();
  await seed(scenario.fixture);
  const before = await readState(database.db);
  const revisionBefore = await readLiveRevision(database.db);
  const telemetry: ChangeAdmissionTransactionObservation[] = [];
  const generatedIds = makeIds();
  const clock = { now: () => new Date(changeAdmissionNow) };

  const execute: (command: ChangeAdmissionCommand) => Promise<unknown> =
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
    }).cells.changeAdmission.execute;

  const outcome = await runChangeAdmissionScenario(execute, scenario);
  const workEvents = await readEvents(scenario);
  const payload = workEvents[0]?.payload;
  const receipt = isRecord(payload) ? payload['_idempotency'] : null;
  return {
    outcome,
    stateDelta: { before, after: await readState(database.db) },
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

const expectNoMutation = (observation: ChangeAdmissionObservation): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.workEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
  expect(observation.signals).toEqual([]);
};

const expectedTargetTelemetry = (
  scenario: ChangeAdmissionScenario,
): readonly ChangeAdmissionTransactionObservation[] => {
  if (scenario.name.startsWith('success replay'))
    return sortedTelemetry([
      { operation: 'production.change_admission', outcome: 'committed' },
      { operation: 'production.change_admission', outcome: 'committed' },
      {
        operation: 'production.change_admission',
        outcome: 'expected_rollback',
      },
    ]);
  if (scenario.name.startsWith('same version race'))
    return sortedTelemetry([
      { operation: 'production.change_admission', outcome: 'committed' },
      {
        operation: 'production.change_admission',
        outcome: 'expected_rollback',
      },
    ]);
  if (scenario.fixture.forceWorkEventAppendFailure === true)
    return [{ operation: 'production.change_admission', outcome: 'failed' }];
  if (scenario.name.startsWith('manual release returns'))
    return [{ operation: 'production.change_admission', outcome: 'committed' }];
  return [
    {
      operation: 'production.change_admission',
      outcome: 'expected_rollback',
    },
  ];
};

describe('production.change-admission.v1 target conformance', () => {
  it.each(changeAdmissionScenarios)('$name', async (scenario) => {
    const target = await observe(scenario);

    expect(target.telemetry).toEqual(expectedTargetTelemetry(scenario));

    if (scenario.name.startsWith('success replay')) {
      expect(target.outcome).toMatchObject([
        { kind: 'success', value: { version: 2, replayed: false } },
        { kind: 'success', value: { version: 2, replayed: true } },
        {
          kind: 'failure',
          failure: { code: 'production_idempotency_conflict' },
        },
      ]);
      expect(target.stateDelta.after).toEqual({
        admissionOverride: 'released',
        admissionOverrideAt: changeAdmissionNow.toISOString(),
        admissionOverrideBy: ids.actor,
        status: 'eligible',
        eligibleAt: changeAdmissionNow.toISOString(),
        version: 2,
        updatedAt: changeAdmissionNow.toISOString(),
      });
      expect(target.workEvents).toHaveLength(1);
      expect(target.workEvents[0]).toMatchObject({
        id: ids.workEvent,
        eventType: 'production_admission_changed',
        entityType: 'production_order',
        entityId: ids.productionOrder,
        actorId: ids.actor,
        expectedVersion: 1,
        payload: {
          target: 'released',
          sourceAdmissionState: 'unreleased',
          admissionOverride: 'released',
          status: 'eligible',
          version: 2,
          _idempotency: {
            version: 1,
            result: {
              locationId,
              orderId: ids.productionOrder,
              admissionOverride: 'released',
              status: 'eligible',
              version: 2,
              replayed: false,
            },
          },
        },
      });
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      expect(target.signals).toEqual([]);
      return;
    }

    if (scenario.name.startsWith('same version race')) {
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
      expect(target.workEvents).toHaveLength(1);
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    if (scenario.name.startsWith('manual release returns')) {
      expect(target.outcome).toMatchObject([
        {
          kind: 'success',
          value: {
            admissionOverride: null,
            status: 'release_pending',
            version: 2,
          },
        },
      ]);
      expect(target.workEvents).toHaveLength(1);
      expect(target.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    expectNoMutation(target);
  });
});
