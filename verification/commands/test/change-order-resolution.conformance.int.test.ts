import {
  createPostgresRuntime,
  type PostgresDatabase,
} from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { ChangeOrderResolutionCommand } from '@pressly/production-system/operations/demand/change-order-resolution/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureChangeOrderResolutionOutcome,
  changeOrderResolutionDueAt as dueAt,
  changeOrderResolutionFixtureIds as ids,
  changeOrderResolutionInitialTime as initialTime,
  changeOrderResolutionLocationId as locationId,
  changeOrderResolutionNow,
  changeOrderResolutionRestoredDueAt,
  changeOrderResolutionScenarios,
  runChangeOrderResolutionScenario,
  type CanonicalChangeOrderResolutionOutcome,
  type ChangeOrderResolutionAuditEvent,
  type ChangeOrderResolutionFixture,
  type ChangeOrderResolutionObservation,
  type ChangeOrderResolutionScenario,
  type ChangeOrderResolutionState,
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
  maxConnections: 8,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: presslyPostgresOwnerSchemas.production,
  maxConnections: 1,
});

const removeLateCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists change_order_resolution_conformance_late_cas on production_orders`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists change_order_resolution_conformance_reject_update()`,
  );
};

const installLateCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`create function change_order_resolution_conformance_reject_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  await faultDatabase.db.execute(
    sql`create trigger change_order_resolution_conformance_late_cas before update on production_orders for each row execute function change_order_resolution_conformance_reject_update()`,
  );
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
  await faultDatabase.db.execute(
    sql`alter table production_orders drop constraint if exists production_orders_execution_status_valid`,
  );
  await faultDatabase.db.execute(
    sql`alter table production_orders drop constraint if exists production_orders_resolution_state_valid`,
  );
  await faultDatabase.db.execute(
    sql`alter table production_orders drop constraint if exists production_orders_resolution_metadata_consistent`,
  );
});

afterAll(async () => {
  await removeLateCasFault();
  await faultDatabase.close();
  await database.close();
});

const makeIds = (): IdSource => {
  let next = 0;
  return {
    next: () =>
      next++ === 0
        ? ids.workEvent
        : `75000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
  };
};

const seedShift = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: ids.shift,
      locationId,
      startsAt: initialTime,
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
      createdAt: initialTime,
      updatedAt: initialTime,
    });
};

const seedSchedule = async (inputSnapshot: unknown): Promise<void> => {
  await seedShift();
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: ids.schedulerConfig,
      locationId,
      pulseMinutes: 30,
      foldLbsPerFolderMinute: 1,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: ids.actor,
      publishedAt: initialTime,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values({
      id: ids.schedule,
      locationId,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.schedulerConfig,
      status: 'rejected',
      inputSnapshot,
      inputSnapshotHash: 'c'.repeat(64),
      outputPlan: {},
      outputPlanHash: 'd'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v1',
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 60,
      plannedCompletionAt: new Date('2026-08-21T21:00:00.000Z'),
      createdAt: initialTime,
    });
};

const seedProductionHistory = async (
  kind: 'batch_membership' | 'stage_attempt',
): Promise<void> => {
  await seedSchedule({ orders: [] });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: ids.run,
      locationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.schedule,
      status: 'started',
      startedAt: initialTime,
      plannedCompletionAt: new Date('2026-08-21T21:00:00.000Z'),
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values({
      id: ids.batch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 24,
      pulseMinutes: 30,
      plannedDoneAt: new Date('2026-08-21T20:00:00.000Z'),
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  if (kind === 'batch_membership') {
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
      .values({
        id: ids.membership,
        locationId,
        productionBatchId: ids.batch,
        productionOrderId: ids.productionOrder,
        active: false,
        placementProvenance: 'initial_schedule',
        placedAt: initialTime,
        placedBy: ids.actor,
        releasedAt: changeOrderResolutionNow,
        releasedBy: ids.actor,
        releaseReason: 'fixture_history',
      });
    return;
  }
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values({
      id: ids.station,
      locationId,
      kind: 'sorting',
      label: 'Conformance Station',
      sortOrder: 1,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values({
      id: ids.stage,
      locationId,
      productionBatchId: ids.batch,
      stationId: ids.station,
      stageKind: 'sorting',
      status: 'planned',
      plannedStartAt: initialTime,
      plannedEndAt: new Date('2026-08-21T13:00:00.000Z'),
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .values({
      id: ids.attempt,
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.productionOrder,
      stageRunId: ids.stage,
      stageKind: 'sorting',
      attemptNumber: 1,
      status: 'released',
      assignmentReason: 'initial_schedule',
      assignedAt: initialTime,
      assignedBy: ids.actor,
      releasedAt: changeOrderResolutionNow,
      releasedBy: ids.actor,
      releaseReason: 'fixture_history',
      createdAt: initialTime,
      updatedAt: initialTime,
    });
};

const seedParticipation = async (
  fixture: ChangeOrderResolutionFixture,
): Promise<void> => {
  switch (fixture.participation) {
    case undefined:
      return;
    case 'current_selection':
      await seedShift();
      await database.db
        .insert(
          presslyPostgresOwnerSchemas.production.productionShiftSelections,
        )
        .values({
          productionShiftId: ids.shift,
          locationId,
          version: 1,
          selectedBy: ids.actor,
          selectedAt: initialTime,
          updatedAt: initialTime,
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
          selectedAt: initialTime,
        });
      return;
    case 'schedule_snapshot':
      await seedSchedule({ orders: [{ id: ids.productionOrder }] });
      return;
    case 'selection_event':
      await database.db
        .insert(presslyPostgresOwnerSchemas.production.workEvents)
        .values({
          id: ids.evidenceEvent,
          locationId,
          eventType: 'production_shift_selection_replaced',
          entityType: 'production_shift',
          entityId: ids.shift,
          actorId: ids.actor,
          idempotencyKey: 'resolution-selection-evidence',
          payload: { selectedOrderIds: [ids.productionOrder] },
          createdAt: initialTime,
        });
      return;
    case 'batch_membership':
    case 'stage_attempt':
      await seedProductionHistory(fixture.participation);
      return;
    case 'route_event':
      await database.db
        .insert(presslyPostgresOwnerSchemas.production.workEvents)
        .values({
          id: ids.evidenceEvent,
          locationId,
          eventType: 'production_order_route_exception_recorded',
          entityType: 'production_order',
          entityId: ids.productionOrder,
          actorId: ids.actor,
          idempotencyKey: 'resolution-route-evidence',
          payload: {},
          createdAt: initialTime,
        });
  }
};

const seedMalformedReceipt = async (
  scenario: ChangeOrderResolutionScenario,
): Promise<void> => {
  if (scenario.fixture.malformedReceipt !== true) return;
  const command = scenario.commands[0]!;
  if (command.action !== 'resolve_without_production') return;
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.evidenceEvent,
      locationId,
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: ids.productionOrder,
      actorId: ids.actor,
      expectedVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      payload: {
        fixture: true,
        _idempotency: {
          version: 1,
          command: {
            operation: 'production_order_resolved_without_production',
            locationId,
            actorId: ids.actor,
            target: {
              entityType: 'production_order',
              entityId: ids.productionOrder,
            },
            expectedVersion: command.expectedVersion,
            payload: {
              action: 'resolve_without_production',
              reason: command.reason,
              note: command.note,
              confirmReviewedFacts: command.confirmReviewedFacts,
            },
          },
          result: {
            locationId,
            orderId: ids.productionOrder,
            action: 'resolve_without_production',
            resolutionState: 'resolved_without_production',
            transitionedAt: changeOrderResolutionNow.toISOString(),
            version: command.expectedVersion + 1,
          },
        },
      },
      createdAt: initialTime,
    });
};

const seed = async (scenario: ChangeOrderResolutionScenario): Promise<void> => {
  const fixture = scenario.fixture;
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Change Order Resolution Conformance Facility',
      timezone: 'America/New_York',
      createdAt: initialTime,
      updatedAt: initialTime,
    },
  ]);
  if (fixture.includeOrder === false) return;

  const sourceAdmissionState = fixture.sourceAdmissionState ?? 'unreleased';
  const sourceWeight =
    fixture.sourceEstimatedWeightLbs === undefined
      ? 24
      : fixture.sourceEstimatedWeightLbs;
  const sourceWeightSource =
    fixture.sourceEstimatedWeightSource === undefined
      ? sourceWeight === null
        ? null
        : 'external_estimate'
      : fixture.sourceEstimatedWeightSource;
  const sourceDueAt = fixture.sourceDueAt ?? dueAt;
  const resolutionState = fixture.resolutionState ?? 'open';
  const admissionOverride = fixture.admissionOverride ?? null;
  const bagCount = fixture.bagCount === undefined ? null : fixture.bagCount;
  const hasIntake = fixture.hasIntake ?? bagCount !== null;

  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: ids.demand,
      fulfillmentId: ids.fulfillment,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: sourceAdmissionState,
      commercialState: fixture.sourceCommercialState ?? 'open',
      displayReference: 'RESOLUTION-CONFORMANCE-1',
      locationId,
      revisionAt: initialTime,
      phase: fixture.demandPhase ?? 'expected',
      estimatedWeightLbs: sourceWeight,
      estimatedWeightSource: sourceWeightSource,
      dueAt: sourceDueAt,
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
      priority: fixture.priority ?? false,
      operationalStatus: fixture.operationalStatus ?? 'release_pending',
      executionStatus: fixture.executionStatus ?? 'unassigned',
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
        ? {
            resolvedAt: initialTime,
            resolvedBy: ids.actor,
            resolutionReason: 'processor_not_in_use',
            resolutionNote: null,
          }
        : {}),
      derivedWeightLbs: 24,
      derivedWeightSource: 'archived_estimate',
      bagCount,
      bagCountSource: hasIntake ? 'operator_intake' : null,
      intakeRecordedAt: hasIntake ? initialTime : null,
      intakeVersion: hasIntake ? 1 : 0,
      admissionOverride,
      admissionOverrideAt: admissionOverride === null ? null : initialTime,
      admissionOverrideBy: admissionOverride === null ? null : ids.actor,
      pendingPlacement:
        fixture.pendingPlacement === true
          ? { status: 'awaiting_confirmation' }
          : null,
      eligibleAt:
        (fixture.operationalStatus ?? 'release_pending') === 'eligible'
          ? initialTime
          : null,
      version: fixture.version ?? 4,
      createdAt: initialTime,
      updatedAt: initialTime,
    });
  await seedParticipation(fixture);
  await seedMalformedReceipt(scenario);
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
        idempotencyKey: 'resolution-existing-event',
        payload: {},
        createdAt: initialTime,
      });
};

const readState = async (
  db: PostgresDatabase,
): Promise<ChangeOrderResolutionState> => {
  const [order] = await db
    .select({
      resolutionState:
        presslyPostgresOwnerSchemas.production.productionOrders.resolutionState,
      resolvedAt:
        presslyPostgresOwnerSchemas.production.productionOrders.resolvedAt,
      resolvedBy:
        presslyPostgresOwnerSchemas.production.productionOrders.resolvedBy,
      resolutionReason:
        presslyPostgresOwnerSchemas.production.productionOrders
          .resolutionReason,
      resolutionNote:
        presslyPostgresOwnerSchemas.production.productionOrders.resolutionNote,
      dueAt: presslyPostgresOwnerSchemas.production.productionOrders.dueAt,
      derivedWeightLbs:
        presslyPostgresOwnerSchemas.production.productionOrders
          .derivedWeightLbs,
      derivedWeightSource:
        presslyPostgresOwnerSchemas.production.productionOrders
          .derivedWeightSource,
      operationalStatus:
        presslyPostgresOwnerSchemas.production.productionOrders
          .operationalStatus,
      eligibleAt:
        presslyPostgresOwnerSchemas.production.productionOrders.eligibleAt,
      admissionOverride:
        presslyPostgresOwnerSchemas.production.productionOrders
          .admissionOverride,
      admissionOverrideAt:
        presslyPostgresOwnerSchemas.production.productionOrders
          .admissionOverrideAt,
      admissionOverrideBy:
        presslyPostgresOwnerSchemas.production.productionOrders
          .admissionOverrideBy,
      pendingPlacement:
        presslyPostgresOwnerSchemas.production.productionOrders
          .pendingPlacement,
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
        ...order,
        resolvedAt: order.resolvedAt?.toISOString() ?? null,
        dueAt: order.dueAt.toISOString(),
        eligibleAt: order.eligibleAt?.toISOString() ?? null,
        admissionOverrideAt: order.admissionOverrideAt?.toISOString() ?? null,
        updatedAt: order.updatedAt.toISOString(),
      };
};

const readLiveRevision = async (): Promise<number> => {
  const [location] = await database.db
    .select({
      liveRevision:
        presslyPostgresOwnerSchemas.production.productionLocations.liveRevision,
    })
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionLocations.id,
        locationId,
      ),
    );
  if (location === undefined)
    throw new Error('Resolution fixture location is missing.');
  return location.liveRevision;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readEvents = async (
  scenario: ChangeOrderResolutionScenario,
): Promise<readonly ChangeOrderResolutionAuditEvent[]> => {
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

const waitForBlockedCommands = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
};

const observe = async (
  scenario: ChangeOrderResolutionScenario,
): Promise<ChangeOrderResolutionObservation> => {
  await removeLateCasFault();
  await database.reset();
  await seed(scenario);
  if (scenario.fixture.forceLateCas === true) await installLateCasFault();

  const before = await readState(database.db);
  const revisionBefore = await readLiveRevision();
  const idSource = makeIds();
  const clock = { now: () => new Date(changeOrderResolutionNow) };
  const execute = makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database.db,
    ids: idSource,
    clock,
  }).cells.changeOrderResolution.execute;

  const executeAfterLock = async (
    commands: readonly ChangeOrderResolutionCommand[],
  ): Promise<readonly CanonicalChangeOrderResolutionOutcome[]> => {
    let running:
      | Promise<readonly CanonicalChangeOrderResolutionOutcome[]>
      | undefined;
    await database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
      );
      running = Promise.all(
        commands.map((command) =>
          captureChangeOrderResolutionOutcome(execute, command),
        ),
      );
      await waitForBlockedCommands();
    });
    return running ?? [];
  };

  try {
    const outcome = await runChangeOrderResolutionScenario({
      execute,
      executeAfterLock,
      scenario,
    });
    const workEvents = await readEvents(scenario);
    const firstPayload = workEvents[0]?.payload;
    const receipt = isRecord(firstPayload)
      ? (firstPayload['_idempotency'] ?? null)
      : null;
    return {
      outcome,
      stateDelta: { before, after: await readState(database.db) },
      workEvents,
      idempotencyReceipt: receipt,
      liveRevision: {
        before: revisionBefore,
        after: await readLiveRevision(),
      },
      signals: [],
    };
  } finally {
    await removeLateCasFault();
  }
};

const expectNoMutation = (
  observation: ChangeOrderResolutionObservation,
): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.workEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
};

const failureCode = (
  outcome: CanonicalChangeOrderResolutionOutcome | undefined,
): string | null =>
  outcome?.kind === 'failure'
    ? outcome.failure.code
    : outcome?.kind === 'unexpected'
      ? outcome.error.code
      : null;

describe('production.change-order-resolution.v1 behavioral conformance', () => {
  it.each(changeOrderResolutionScenarios)('$name', async (scenario) => {
    const observation = await observe(scenario);
    expect(observation.signals).toEqual([]);

    if (scenario.name.startsWith('resolve success')) {
      expect(observation.stateDelta).toEqual({
        before: {
          resolutionState: 'open',
          resolvedAt: null,
          resolvedBy: null,
          resolutionReason: null,
          resolutionNote: null,
          dueAt: dueAt.toISOString(),
          derivedWeightLbs: 24,
          derivedWeightSource: 'archived_estimate',
          operationalStatus: 'release_pending',
          eligibleAt: null,
          admissionOverride: null,
          admissionOverrideAt: null,
          admissionOverrideBy: null,
          pendingPlacement: null,
          version: 4,
          updatedAt: initialTime.toISOString(),
        },
        after: expect.objectContaining({
          resolutionState: 'resolved_without_production',
          resolvedAt: changeOrderResolutionNow.toISOString(),
          resolvedBy: ids.actor,
          resolutionReason: 'processor_not_in_use',
          resolutionNote: null,
          version: 5,
          updatedAt: changeOrderResolutionNow.toISOString(),
        }),
      });
      expect(observation.workEvents).toEqual([
        {
          id: ids.workEvent,
          eventType: 'production_order_resolved_without_production',
          entityType: 'production_order',
          entityId: ids.productionOrder,
          actorId: ids.actor,
          expectedVersion: 4,
          idempotencyKey: 'resolution-conformance-resolve',
          payload: {
            action: 'resolve_without_production',
            from: 'open',
            resolutionState: 'resolved_without_production',
            reason: 'processor_not_in_use',
            note: null,
            reviewReasons: [],
            clearedPendingPlacement: false,
            version: 5,
            _idempotency: {
              version: 1,
              command: {
                operation: 'production_order_resolved_without_production',
                locationId,
                actorId: ids.actor,
                target: {
                  entityType: 'production_order',
                  entityId: ids.productionOrder,
                },
                expectedVersion: 4,
                payload: {
                  action: 'resolve_without_production',
                  reason: 'processor_not_in_use',
                  note: null,
                  confirmReviewedFacts: false,
                },
              },
              result: {
                locationId,
                orderId: ids.productionOrder,
                action: 'resolve_without_production',
                resolutionState: 'resolved_without_production',
                transitionedAt: changeOrderResolutionNow.toISOString(),
                version: 5,
                replayed: false,
              },
            },
          },
        },
      ]);
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      expect(observation.idempotencyReceipt).toEqual(
        (observation.workEvents[0]?.payload as Record<string, unknown>)[
          '_idempotency'
        ],
      );
      return;
    }

    if (scenario.name.startsWith('restore success')) {
      expect(observation.outcome).toEqual([
        {
          kind: 'success',
          value: {
            locationId,
            orderId: ids.productionOrder,
            action: 'restore',
            resolutionState: 'open',
            transitionedAt: changeOrderResolutionNow.toISOString(),
            version: 5,
            replayed: false,
          },
        },
      ]);
      expect(observation.stateDelta.after).toMatchObject({
        resolutionState: 'open',
        resolvedAt: null,
        resolvedBy: null,
        resolutionReason: null,
        resolutionNote: null,
        dueAt: changeOrderResolutionRestoredDueAt.toISOString(),
        derivedWeightLbs: 48,
        derivedWeightSource: 'current_source',
        operationalStatus: 'eligible',
        eligibleAt: changeOrderResolutionNow.toISOString(),
        admissionOverride: null,
        admissionOverrideAt: null,
        admissionOverrideBy: null,
        version: 5,
      });
      expect(observation.workEvents[0]).toMatchObject({
        eventType: 'production_order_restored',
        payload: {
          action: 'restore',
          from: 'resolved_without_production',
          resolutionState: 'open',
          restoredSourceProjection: {
            dueAt: changeOrderResolutionRestoredDueAt.toISOString(),
            derivedWeightLbs: 48,
            operationalStatus: 'eligible',
          },
          version: 5,
        },
      });
      expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
      return;
    }

    if (scenario.name.startsWith('confirmed review')) {
      expect(observation.stateDelta.after).toMatchObject({
        pendingPlacement: null,
        resolutionState: 'resolved_without_production',
        version: 5,
      });
      expect(observation.workEvents[0]).toMatchObject({
        payload: {
          reviewReasons: [
            'intake_recorded',
            'manual_admission',
            'priority',
            'pending_placement',
          ],
          clearedPendingPlacement: true,
        },
      });
      return;
    }

    if (scenario.name.startsWith('exact replay')) {
      expect(observation.outcome.map((outcome) => outcome.kind)).toEqual([
        'success',
        'success',
        'failure',
      ]);
      expect(
        observation.outcome[1]?.kind === 'success'
          ? observation.outcome[1].value.replayed
          : null,
      ).toBe(true);
      expect(failureCode(observation.outcome[2])).toBe(
        'production_idempotency_conflict',
      );
      expect(observation.workEvents).toHaveLength(1);
      return;
    }

    if (scenario.name.startsWith('same key race')) {
      expect(
        observation.outcome.flatMap((outcome) =>
          outcome.kind === 'success' ? [outcome.value.replayed] : [],
        ),
      ).toEqual([false, true]);
      expect(observation.workEvents).toHaveLength(1);
      return;
    }

    if (scenario.name.startsWith('same production version race')) {
      expect(
        observation.outcome.filter((outcome) => outcome.kind === 'success'),
      ).toHaveLength(1);
      expect(
        observation.outcome.some(
          (outcome) =>
            failureCode(outcome) === 'production_order_version_conflict',
        ),
      ).toBe(true);
      expect(observation.workEvents).toHaveLength(1);
      return;
    }

    if (scenario.name.startsWith('malformed historical receipt')) {
      expect(observation.outcome).toMatchObject([
        {
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'production_idempotency_conflict',
          },
        },
      ]);
      expect(observation.stateDelta.after).toEqual(
        observation.stateDelta.before,
      );
      expect(observation.liveRevision.after).toBe(
        observation.liveRevision.before,
      );
      return;
    }

    const expectedCode = scenario.name.startsWith('missing order')
      ? 'production_order_not_found'
      : scenario.name.startsWith('stale production')
        ? 'production_order_version_conflict'
        : scenario.name.startsWith('source precondition')
          ? 'production_order_source_state_conflict'
          : scenario.name.includes('participation') ||
              scenario.name.startsWith('scheduled execution') ||
              scenario.name.startsWith('finished operational')
            ? 'production_order_resolution_blocked'
            : scenario.name.includes('requires explicit review')
              ? 'production_order_resolution_review_required'
              : scenario.name.startsWith('invalid persisted execution')
                ? 'production_order_execution_state_invalid'
                : scenario.name.startsWith('invalid persisted resolution')
                  ? 'production_order_resolution_state_invalid'
                  : scenario.name.startsWith('restore with missing')
                    ? 'production_order_restore_demand_invalid'
                    : scenario.name.startsWith('restore with committed')
                      ? 'production_order_restore_blocked'
                      : scenario.name.startsWith('restore from open')
                        ? 'production_order_resolution_event_not_allowed'
                        : scenario.name.startsWith('real late CAS')
                          ? 'production_order_version_conflict'
                          : 'production_order_resolution_change_failed';
    expect(failureCode(observation.outcome[0])).toBe(expectedCode);
    expectNoMutation(observation);
  });
});
