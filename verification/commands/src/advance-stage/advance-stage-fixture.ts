import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import type { IdSource } from '@pressly/cells/id-source';
import type { Clock } from '@pressly/time';
import {
  toCanonicalValue,
  type CanonicalValue,
} from './command-observation.ts';
import {
  advanceStageFixtureIds,
  advanceStageLocationId,
  advanceStagePlannedEnd,
  advanceStagePlannedStart,
} from './advance-stage-scenarios.ts';
import type {
  AdvanceStageAuditEvent,
  AdvanceStageScenario,
  AdvanceStageState,
} from './advance-stage-types.ts';
import { seedProductionLocationConformanceFacts } from '../production-location-conformance.postgres.ts';

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

const advanceStageBusinessId = '00000000-0000-4000-8000-000000000100';

export const createAdvanceStageTestDatabase = (): TestDatabaseRuntime =>
  createTestDatabaseRuntime({
    databaseUrl: getTestDatabaseUrl(
      'PRESSLY_TEST_DATABASE_URL',
      'postgres://pressly:pressly@localhost:55434/pressly_test',
    ),
    tableNames: productionTables,
    maxConnections: 2,
    ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
      ? {}
      : {
          resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
        }),
  });

export const makeAdvanceStageIdSource = (): IdSource => {
  let next = 1;
  return {
    next: () =>
      `00000000-0000-4000-8000-${(next++).toString().padStart(12, '0')}`,
  };
};

export const makeFixedClock = (now: Date): Clock =>
  Object.freeze({ now: () => new Date(now) });

export const seedAdvanceStageFixture = async (
  db: PostgresDatabase,
  fixture: AdvanceStageScenario['fixture'],
): Promise<string> => {
  const targetIsWashing = fixture.target === 'washing';
  await seedProductionLocationConformanceFacts(db, [
    {
      id: advanceStageLocationId,
      businessId: advanceStageBusinessId,
      name: 'Advance Stage Conformance Facility',
      timezone: 'America/New_York',
    },
  ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: advanceStageFixtureIds.shift,
      locationId: advanceStageLocationId,
      startsAt: advanceStagePlannedStart,
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
  await db.insert(presslyPostgresOwnerSchemas.production.stations).values([
    {
      id: advanceStageFixtureIds.sortingStation,
      locationId: advanceStageLocationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    },
    {
      id: advanceStageFixtureIds.washingStation,
      locationId: advanceStageLocationId,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
    },
  ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: advanceStageFixtureIds.config,
      locationId: advanceStageLocationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: advanceStageFixtureIds.actor,
    });
  await db.insert(presslyPostgresOwnerSchemas.production.scheduleRuns).values({
    id: advanceStageFixtureIds.schedule,
    locationId: advanceStageLocationId,
    productionShiftId: advanceStageFixtureIds.shift,
    schedulerConfigId: advanceStageFixtureIds.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 56,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: advanceStagePlannedStart,
    acceptedBy: advanceStageFixtureIds.actor,
  });
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: advanceStageFixtureIds.run,
      locationId: advanceStageLocationId,
      productionShiftId: advanceStageFixtureIds.shift,
      scheduleRunId: advanceStageFixtureIds.schedule,
      status: 'started',
      startedAt: advanceStagePlannedStart,
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
      version: 1,
    });
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values({
      id: advanceStageFixtureIds.batch,
      locationId: advanceStageLocationId,
      productionRunId: advanceStageFixtureIds.run,
      sequenceIndex: 0,
      status: targetIsWashing ? 'sorting' : 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 75,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
      ...(targetIsWashing
        ? {
            startedAt: advanceStagePlannedStart,
            membershipFrozenAt: advanceStagePlannedStart,
            membershipFrozenBy: advanceStageFixtureIds.actor,
            version: 2,
          }
        : { version: 1 }),
    });

  if (!targetIsWashing) {
    await db.insert(presslyPostgresOwnerSchemas.production.stageRuns).values({
      id: advanceStageFixtureIds.sortingStage,
      locationId: advanceStageLocationId,
      productionBatchId: advanceStageFixtureIds.batch,
      stationId: advanceStageFixtureIds.sortingStation,
      stageKind: 'sorting',
      status: 'planned',
      plannedStartAt: advanceStagePlannedStart,
      plannedEndAt: advanceStagePlannedEnd,
      version: 1,
    });
    return advanceStageFixtureIds.sortingStage;
  }

  await db.insert(presslyPostgresOwnerSchemas.production.machines).values({
    id: advanceStageFixtureIds.washer,
    locationId: advanceStageLocationId,
    stationId: advanceStageFixtureIds.washingStation,
    label: 'Washer 1',
    effectiveCapacityLbs: 100,
  });
  await db.insert(presslyPostgresOwnerSchemas.production.stageRuns).values([
    {
      id: advanceStageFixtureIds.sortingStage,
      locationId: advanceStageLocationId,
      productionBatchId: advanceStageFixtureIds.batch,
      stationId: advanceStageFixtureIds.sortingStation,
      stageKind: 'sorting',
      status: 'completed',
      plannedStartAt: new Date('2026-08-21T13:04:00.000Z'),
      plannedEndAt: advanceStagePlannedStart,
      actualStartAt: new Date('2026-08-21T13:04:00.000Z'),
      actualEndAt: advanceStagePlannedStart,
      actualStartProvenance: 'live_observed',
      actualEndProvenance: 'live_observed',
      version: 3,
    },
    {
      id: advanceStageFixtureIds.washingStage,
      locationId: advanceStageLocationId,
      productionBatchId: advanceStageFixtureIds.batch,
      stationId: advanceStageFixtureIds.washingStation,
      stageKind: 'washing',
      status: 'planned',
      plannedStartAt: advanceStagePlannedStart,
      plannedEndAt: advanceStagePlannedEnd,
      version: 1,
    },
  ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values({
      id: advanceStageFixtureIds.assignment,
      locationId: advanceStageLocationId,
      stageRunId: advanceStageFixtureIds.washingStage,
      machineId: advanceStageFixtureIds.washer,
      plannedStartAt: advanceStagePlannedStart,
      plannedEndAt: advanceStagePlannedEnd,
      status: fixture.washingAssignmentStatus ?? 'planned',
      ...(fixture.washingAssignmentStatus === 'active'
        ? { actualStartAt: advanceStagePlannedStart }
        : {}),
    });
  return advanceStageFixtureIds.washingStage;
};

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export const readAdvanceStageState = async (
  db: PostgresDatabase,
  stageRunId: string,
): Promise<AdvanceStageState> => {
  const [stages, batches, runs, assignments] = await Promise.all([
    db
      .select({
        id: presslyPostgresOwnerSchemas.production.stageRuns.id,
        status: presslyPostgresOwnerSchemas.production.stageRuns.status,
        version: presslyPostgresOwnerSchemas.production.stageRuns.version,
        actualStartAt:
          presslyPostgresOwnerSchemas.production.stageRuns.actualStartAt,
        actualEndAt:
          presslyPostgresOwnerSchemas.production.stageRuns.actualEndAt,
        actualStartProvenance:
          presslyPostgresOwnerSchemas.production.stageRuns
            .actualStartProvenance,
        actualEndProvenance:
          presslyPostgresOwnerSchemas.production.stageRuns.actualEndProvenance,
        startedBy: presslyPostgresOwnerSchemas.production.stageRuns.startedBy,
        completedBy:
          presslyPostgresOwnerSchemas.production.stageRuns.completedBy,
      })
      .from(presslyPostgresOwnerSchemas.production.stageRuns)
      .where(
        eq(presslyPostgresOwnerSchemas.production.stageRuns.id, stageRunId),
      ),
    db
      .select({
        id: presslyPostgresOwnerSchemas.production.productionBatches.id,
        status: presslyPostgresOwnerSchemas.production.productionBatches.status,
        version:
          presslyPostgresOwnerSchemas.production.productionBatches.version,
        startedAt:
          presslyPostgresOwnerSchemas.production.productionBatches.startedAt,
        finishedAt:
          presslyPostgresOwnerSchemas.production.productionBatches.finishedAt,
        membershipFrozenAt:
          presslyPostgresOwnerSchemas.production.productionBatches
            .membershipFrozenAt,
        membershipFrozenBy:
          presslyPostgresOwnerSchemas.production.productionBatches
            .membershipFrozenBy,
      })
      .from(presslyPostgresOwnerSchemas.production.productionBatches)
      .where(
        eq(
          presslyPostgresOwnerSchemas.production.productionBatches.id,
          advanceStageFixtureIds.batch,
        ),
      ),
    db
      .select({
        id: presslyPostgresOwnerSchemas.production.productionRuns.id,
        status: presslyPostgresOwnerSchemas.production.productionRuns.status,
        queueVersion:
          presslyPostgresOwnerSchemas.production.productionRuns.queueVersion,
        version: presslyPostgresOwnerSchemas.production.productionRuns.version,
      })
      .from(presslyPostgresOwnerSchemas.production.productionRuns)
      .where(
        eq(
          presslyPostgresOwnerSchemas.production.productionRuns.id,
          advanceStageFixtureIds.run,
        ),
      ),
    db
      .select({
        id: presslyPostgresOwnerSchemas.production.stageMachineAssignments.id,
        status:
          presslyPostgresOwnerSchemas.production.stageMachineAssignments.status,
        actualStartAt:
          presslyPostgresOwnerSchemas.production.stageMachineAssignments
            .actualStartAt,
        actualEndAt:
          presslyPostgresOwnerSchemas.production.stageMachineAssignments
            .actualEndAt,
      })
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
      .where(
        eq(
          presslyPostgresOwnerSchemas.production.stageMachineAssignments
            .stageRunId,
          stageRunId,
        ),
      )
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.stageMachineAssignments.id),
      ),
  ]);
  const stage = stages[0];
  const batch = batches[0];
  const run = runs[0];

  return Object.freeze({
    stage:
      stage === undefined
        ? null
        : Object.freeze({
            ...stage,
            actualStartAt: iso(stage.actualStartAt),
            actualEndAt: iso(stage.actualEndAt),
          }),
    batch:
      batch === undefined
        ? null
        : Object.freeze({
            ...batch,
            startedAt: iso(batch.startedAt),
            finishedAt: iso(batch.finishedAt),
            membershipFrozenAt: iso(batch.membershipFrozenAt),
          }),
    run: run === undefined ? null : Object.freeze({ ...run }),
    assignments: Object.freeze(
      assignments.map((assignment) =>
        Object.freeze({
          ...assignment,
          actualStartAt: iso(assignment.actualStartAt),
          actualEndAt: iso(assignment.actualEndAt),
        }),
      ),
    ),
  });
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const payloadWithoutReceipt = (payload: unknown): CanonicalValue => {
  const fields = record(payload);
  if (fields === null) return toCanonicalValue(payload) ?? null;
  return (
    toCanonicalValue(
      Object.fromEntries(
        Object.entries(fields).filter(([key]) => key !== '_idempotency'),
      ),
    ) ?? null
  );
};

export type AdvanceStageReadback = Readonly<{
  state: AdvanceStageState;
  auditEvents: readonly AdvanceStageAuditEvent[];
  idempotencyReceipt: CanonicalValue | null;
  liveRevision: number;
}>;

export const readAdvanceStageReadback = async (
  db: PostgresDatabase,
  input: Readonly<{ stageRunId: string; idempotencyKey: string }>,
): Promise<AdvanceStageReadback> => {
  const [state, events, locations] = await Promise.all([
    readAdvanceStageState(db, input.stageRunId),
    db
      .select({
        id: presslyPostgresOwnerSchemas.production.workEvents.id,
        eventType: presslyPostgresOwnerSchemas.production.workEvents.eventType,
        entityType:
          presslyPostgresOwnerSchemas.production.workEvents.entityType,
        entityId: presslyPostgresOwnerSchemas.production.workEvents.entityId,
        actorId: presslyPostgresOwnerSchemas.production.workEvents.actorId,
        expectedVersion:
          presslyPostgresOwnerSchemas.production.workEvents.expectedVersion,
        idempotencyKey:
          presslyPostgresOwnerSchemas.production.workEvents.idempotencyKey,
        payload: presslyPostgresOwnerSchemas.production.workEvents.payload,
      })
      .from(presslyPostgresOwnerSchemas.production.workEvents)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id)),
    db
      .select({
        liveRevision:
          presslyPostgresOwnerSchemas.production.productionLocations
            .liveRevision,
      })
      .from(presslyPostgresOwnerSchemas.production.productionLocations)
      .where(
        eq(
          presslyPostgresOwnerSchemas.production.productionLocations.id,
          advanceStageLocationId,
        ),
      ),
  ]);
  const receiptEvent = events.find(
    (event) => event.idempotencyKey === input.idempotencyKey,
  );
  const receipt = record(receiptEvent?.payload)?.['_idempotency'];

  return Object.freeze({
    state,
    auditEvents: Object.freeze(
      events.map((event) =>
        Object.freeze({
          ...event,
          payload: payloadWithoutReceipt(event.payload),
        }),
      ),
    ),
    idempotencyReceipt:
      receipt === undefined ? null : (toCanonicalValue(receipt) ?? null),
    liveRevision: locations[0]?.liveRevision ?? 0,
  });
};
