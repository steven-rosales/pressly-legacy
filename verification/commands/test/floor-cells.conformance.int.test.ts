import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AssignStageMachinesCommand,
  BatchMembershipCommand,
  FloorRunners,
  FloorSignal,
  ReconcileBatchProgressCommand,
} from '../src/floor/floor-runner.ts';
import { makeFloorSignalRecorder } from '../src/floor/floor-runner.ts';
import { makeFloorRunners } from '../src/floor/floor-runners.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';

const tables = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'production_batch_orders',
  'production_bags',
  'stage_runs',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_orders',
  'production_shifts',
  'order_demands',
  'production_locations',
] as const;

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
  tableNames: tables,
  maxConnections: 4,
});

beforeAll(database.check);
afterAll(database.close);

const ids = Object.freeze({
  actor: '51000000-0000-4000-8000-000000000001',
  business: '51000000-0000-4000-8000-000000000002',
  shift: '51000000-0000-4000-8000-000000000003',
  config: '51000000-0000-4000-8000-000000000004',
  schedule: '51000000-0000-4000-8000-000000000005',
  run: '51000000-0000-4000-8000-000000000006',
  batch: '51000000-0000-4000-8000-000000000007',
  missing: '51000000-0000-4000-8000-000000000008',
  otherBatch: '51000000-0000-4000-8000-000000000009',
  stations: [
    '51000000-0000-4000-8000-000000000011',
    '51000000-0000-4000-8000-000000000012',
    '51000000-0000-4000-8000-000000000013',
    '51000000-0000-4000-8000-000000000014',
  ],
  stages: [
    '51000000-0000-4000-8000-000000000021',
    '51000000-0000-4000-8000-000000000022',
    '51000000-0000-4000-8000-000000000023',
    '51000000-0000-4000-8000-000000000024',
  ],
  otherStage: '51000000-0000-4000-8000-000000000025',
  washer: '51000000-0000-4000-8000-000000000031',
  dryer: '51000000-0000-4000-8000-000000000032',
  plannedAssignments: [
    '51000000-0000-4000-8000-000000000041',
    '51000000-0000-4000-8000-000000000042',
  ],
  otherAssignment: '51000000-0000-4000-8000-000000000043',
  fulfillment: '51000000-0000-4000-8000-000000000052',
  demand: '51000000-0000-4000-8000-000000000053',
  productionOrder: '51000000-0000-4000-8000-000000000054',
  membership: '51000000-0000-4000-8000-000000000055',
  bags: [
    '51000000-0000-4000-8000-000000000056',
    '51000000-0000-4000-8000-000000000057',
  ],
  attempts: [
    '51000000-0000-4000-8000-000000000061',
    '51000000-0000-4000-8000-000000000062',
    '51000000-0000-4000-8000-000000000063',
    '51000000-0000-4000-8000-000000000064',
  ],
  collisionEvent: '71000000-0000-4000-8000-000000000001',
  collisionEventAfterAssignment: '71000000-0000-4000-8000-000000000002',
});

const locationId = 'location-floor-conformance';
const now = new Date('2026-08-21T15:00:00.000Z');
const stageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;
type StageStatus = 'completed' | 'planned' | 'started';

type Fixture = Readonly<{
  runStatus?: 'completed' | 'started';
  queueVersion?: number;
  batchStatus?: 'queued' | 'sorting' | 'washing';
  batchVersion?: number;
  membershipFrozen?: boolean;
  stageStatuses?: readonly StageStatus[];
  stageVersions?: readonly number[];
  machineActive?: boolean;
  machineCapacityLbs?: number;
  includeScheduledOrder?: boolean;
  orderResolutionState?: 'open' | 'resolved_without_production';
  includeAttempts?: boolean;
  includePlannedAssignments?: boolean;
  otherActiveStageKind?: (typeof stageKinds)[number];
  occupyOtherActiveMachine?: boolean;
  appendFailure?: 'after-assignment' | 'direct';
}>;

const generatedIds = (): IdSource => {
  let next = 1;
  return {
    next: () => `71000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  };
};

const stageVersion = (fixture: Fixture, index: number): number =>
  fixture.stageVersions?.[index] ?? 1;

const seedFloor = async (fixture: Fixture): Promise<void> => {
  const runStatus = fixture.runStatus ?? 'started';
  const batchStatus = fixture.batchStatus ?? 'queued';
  const stageStatuses = fixture.stageStatuses ?? [
    'planned',
    'planned',
    'planned',
    'planned',
  ];
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Floor Conformance Facility',
      timezone: 'America/New_York',
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: ids.shift,
      locationId,
      startsAt: new Date('2026-08-21T08:00:00.000Z'),
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values(
      stageKinds.map((kind, index) => ({
        id: ids.stations[index]!,
        locationId,
        kind,
        label: kind,
        sortOrder: index + 1,
      })),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.washer,
        locationId,
        stationId: ids.stations[1]!,
        label: 'Washer 1',
        effectiveCapacityLbs: fixture.machineCapacityLbs ?? 100,
        isActive: fixture.machineActive ?? true,
      },
      {
        id: ids.dryer,
        locationId,
        stationId: ids.stations[2]!,
        label: 'Dryer 1',
        effectiveCapacityLbs: fixture.machineCapacityLbs ?? 100,
        isActive: fixture.machineActive ?? true,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: ids.config,
      locationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {},
      assertedBy: ids.actor,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values({
      id: ids.schedule,
      locationId,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'accepted',
      inputSnapshot: {},
      inputSnapshotHash: 'a'.repeat(64),
      outputPlan: {},
      outputPlanHash: 'b'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 224,
      plannedCompletionAt: new Date('2026-08-21T19:00:00.000Z'),
      warnings: [],
      acknowledgedWarningCodes: [],
      acceptedAt: now,
      acceptedBy: ids.actor,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: ids.run,
      locationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.schedule,
      status: runStatus,
      startedAt: now,
      ...(runStatus === 'completed' ? { completedAt: now } : {}),
      queueVersion: fixture.queueVersion ?? 1,
      plannedCompletionAt: new Date('2026-08-21T19:00:00.000Z'),
      version: 1,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values({
      id: ids.batch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: batchStatus,
      pulseCapacityLbs: 100,
      derivedWeightLbs: 75,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-08-21T19:00:00.000Z'),
      ...(batchStatus === 'queued' ? {} : { startedAt: now }),
      ...(fixture.membershipFrozen === true || batchStatus !== 'queued'
        ? { membershipFrozenAt: now, membershipFrozenBy: ids.actor }
        : {}),
      version: fixture.batchVersion ?? 1,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(
      stageKinds.map((stageKind, index) => {
        const status = stageStatuses[index] ?? 'planned';
        return {
          id: ids.stages[index]!,
          locationId,
          productionBatchId: ids.batch,
          stationId: ids.stations[index]!,
          stageKind,
          status,
          plannedStartAt: new Date(
            Date.parse('2026-08-21T14:00:00.000Z') + index * 56 * 60_000,
          ),
          plannedEndAt: new Date(
            Date.parse('2026-08-21T14:56:00.000Z') + index * 56 * 60_000,
          ),
          ...(status === 'started' || status === 'completed'
            ? {
                actualStartAt: now,
                actualStartProvenance: 'operator_reported' as const,
                startedBy: ids.actor,
              }
            : {}),
          ...(status === 'completed'
            ? {
                actualEndAt: now,
                actualEndProvenance: 'operator_reported' as const,
                completedBy: ids.actor,
              }
            : {}),
          version: stageVersion(fixture, index),
        };
      }),
    );

  if (fixture.otherActiveStageKind !== undefined) {
    const stageIndex = stageKinds.indexOf(fixture.otherActiveStageKind);
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.productionBatches)
      .values({
        id: ids.otherBatch,
        locationId,
        productionRunId: ids.run,
        sequenceIndex: 1,
        status: fixture.otherActiveStageKind,
        pulseCapacityLbs: 100,
        derivedWeightLbs: 25,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-21T20:00:00.000Z'),
        startedAt: now,
        membershipFrozenAt: now,
        membershipFrozenBy: ids.actor,
        version: 1,
      });
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.stageRuns)
      .values({
        id: ids.otherStage,
        locationId,
        productionBatchId: ids.otherBatch,
        stationId: ids.stations[stageIndex]!,
        stageKind: fixture.otherActiveStageKind,
        status: 'started',
        plannedStartAt: new Date('2026-08-21T13:00:00.000Z'),
        plannedEndAt: new Date('2026-08-21T13:56:00.000Z'),
        actualStartAt: now,
        actualStartProvenance: 'operator_reported',
        startedBy: ids.actor,
        version: 1,
      });
    if (fixture.occupyOtherActiveMachine === true)
      await database.db
        .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
        .values({
          id: ids.otherAssignment,
          locationId,
          stageRunId: ids.otherStage,
          machineId:
            fixture.otherActiveStageKind === 'drying' ? ids.dryer : ids.washer,
          plannedStartAt: new Date('2026-08-21T13:00:00.000Z'),
          plannedEndAt: new Date('2026-08-21T13:56:00.000Z'),
          status: 'active',
        });
  }

  if (fixture.includePlannedAssignments === true)
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
      .values([
        {
          id: ids.plannedAssignments[0]!,
          locationId,
          stageRunId: ids.stages[1]!,
          machineId: ids.washer,
          plannedStartAt: new Date('2026-08-21T14:56:00.000Z'),
          plannedEndAt: new Date('2026-08-21T15:52:00.000Z'),
          status: 'planned',
        },
        {
          id: ids.plannedAssignments[1]!,
          locationId,
          stageRunId: ids.stages[2]!,
          machineId: ids.dryer,
          plannedStartAt: new Date('2026-08-21T15:52:00.000Z'),
          plannedEndAt: new Date('2026-08-21T16:48:00.000Z'),
          status: 'planned',
        },
      ]);

  if (fixture.includeScheduledOrder === true)
    await seedScheduledOrder(
      fixture.includeAttempts !== false,
      fixture.orderResolutionState ?? 'open',
    );

  if (fixture.appendFailure !== undefined)
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.workEvents)
      .values({
        id:
          fixture.appendFailure === 'after-assignment'
            ? ids.collisionEventAfterAssignment
            : ids.collisionEvent,
        locationId,
        eventType: 'fixture',
        entityType: 'production_batch',
        entityId: ids.batch,
        actorId: ids.actor,
        idempotencyKey: 'floor-existing-event',
        payload: {},
      });
};

const seedScheduledOrder = async (
  includeAttempts: boolean,
  resolutionState: 'open' | 'resolved_without_production',
): Promise<void> => {
  const dueAt = new Date('2026-08-21T20:00:00.000Z');
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: ids.demand,
      fulfillmentId: ids.fulfillment,
      fulfillmentVersion: 1,
      projectionHash: 'c'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: 'FLOOR-CONFORMANCE-1',
      locationId,
      revisionAt: now,
      phase: 'production_released',
      estimatedWeightLbs: 75,
      estimatedWeightSource: 'test_estimate',
      dueAt,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: ids.productionOrder,
      orderDemandId: ids.demand,
      locationId,
      dueAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
        ? {
            resolvedAt: now,
            resolvedBy: ids.actor,
            resolutionReason: 'processor_not_in_use' as const,
          }
        : {}),
      derivedWeightLbs: 75,
      derivedWeightSource: 'test_estimate',
      bagCount: 2,
      eligibleAt: now,
      version: 1,
    });
  await database.db.insert(presslyPostgresOwnerSchemas.production.bags).values(
    ids.bags.map((id, bagIndex) => ({
      id,
      productionOrderId: ids.productionOrder,
      bagIndex,
      status: 'eligible',
    })),
  );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values({
      id: ids.membership,
      locationId,
      productionBatchId: ids.batch,
      productionOrderId: ids.productionOrder,
      active: true,
      placementProvenance: 'initial_schedule',
    });
  if (includeAttempts)
    await database.db
      .insert(
        presslyPostgresOwnerSchemas.production.productionOrderStageAttempts,
      )
      .values(
        ids.stages.map((stageRunId, index) => ({
          id: ids.attempts[index]!,
          locationId,
          productionRunId: ids.run,
          productionOrderId: ids.productionOrder,
          stageRunId,
          stageKind: stageKinds[index]!,
          attemptNumber: 1,
          status: 'assigned',
          assignmentReason: 'initial_schedule',
          assignedAt: now,
          assignedBy: ids.actor,
        })),
      );
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

type CanonicalOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: unknown }>
  | Readonly<{ kind: 'unexpected'; error: unknown }>;

const failure = (value: unknown): unknown => {
  const fields = record(value);
  return {
    kind: fields?.['kind'] ?? 'unknown',
    code: fields?.['code'] ?? 'unknown_error',
    message:
      value instanceof Error ? value.message : (fields?.['message'] ?? null),
    safeMessage: fields?.['safeMessage'] ?? null,
    status: fields?.['status'] ?? null,
  };
};

const canonicalOutcome = (raw: unknown): CanonicalOutcome => {
  const result = record(raw);
  if (result?.['tag'] === 'err')
    return { kind: 'failure', failure: failure(result['error']) };
  if (result?.['kind'] === 'failure')
    return { kind: 'failure', failure: failure(result['failure']) };
  const value =
    result?.['tag'] === 'ok' || result?.['kind'] === 'success'
      ? result['value']
      : raw;
  return { kind: 'success', value: canonicalize(value) };
};

const capture = async (
  work: () => Promise<unknown>,
): Promise<CanonicalOutcome> => {
  try {
    return canonicalOutcome(await work());
  } catch (error) {
    return { kind: 'unexpected', error: failure(error) };
  }
};

const sortOutcomes = (
  outcomes: readonly CanonicalOutcome[],
): readonly CanonicalOutcome[] =>
  [...outcomes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const resultValue = (
  raw: unknown,
): Readonly<Record<string, unknown>> | null => {
  const outcome = record(raw);
  return outcome?.['tag'] === 'ok' || outcome?.['kind'] === 'success'
    ? record(outcome['value'])
    : null;
};

type FloorState = Readonly<{
  run: unknown;
  shift: unknown;
  batch: unknown;
  stages: readonly unknown[];
  assignments: readonly unknown[];
  attempts: readonly unknown[];
  orders: readonly unknown[];
  bags: readonly unknown[];
}>;

const readState = async (db: PostgresDatabase): Promise<FloorState> => {
  const [run, shift, batch, stages, assignments, attempts, storedOrders, bags] =
    await Promise.all([
      db
        .select({
          status: presslyPostgresOwnerSchemas.production.productionRuns.status,
          queueVersion:
            presslyPostgresOwnerSchemas.production.productionRuns.queueVersion,
          version:
            presslyPostgresOwnerSchemas.production.productionRuns.version,
          completedAt:
            presslyPostgresOwnerSchemas.production.productionRuns.completedAt,
        })
        .from(presslyPostgresOwnerSchemas.production.productionRuns)
        .where(
          eq(presslyPostgresOwnerSchemas.production.productionRuns.id, ids.run),
        ),
      db
        .select({
          status:
            presslyPostgresOwnerSchemas.production.productionShifts.status,
          version:
            presslyPostgresOwnerSchemas.production.productionShifts.version,
        })
        .from(presslyPostgresOwnerSchemas.production.productionShifts)
        .where(
          eq(
            presslyPostgresOwnerSchemas.production.productionShifts.id,
            ids.shift,
          ),
        ),
      db
        .select({
          status:
            presslyPostgresOwnerSchemas.production.productionBatches.status,
          version:
            presslyPostgresOwnerSchemas.production.productionBatches.version,
          membershipFrozenAt:
            presslyPostgresOwnerSchemas.production.productionBatches
              .membershipFrozenAt,
          membershipFrozenBy:
            presslyPostgresOwnerSchemas.production.productionBatches
              .membershipFrozenBy,
          startedAt:
            presslyPostgresOwnerSchemas.production.productionBatches.startedAt,
          finishedAt:
            presslyPostgresOwnerSchemas.production.productionBatches.finishedAt,
        })
        .from(presslyPostgresOwnerSchemas.production.productionBatches)
        .where(
          eq(
            presslyPostgresOwnerSchemas.production.productionBatches.id,
            ids.batch,
          ),
        ),
      db
        .select({
          id: presslyPostgresOwnerSchemas.production.stageRuns.id,
          stage: presslyPostgresOwnerSchemas.production.stageRuns.stageKind,
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
            presslyPostgresOwnerSchemas.production.stageRuns
              .actualEndProvenance,
          startedBy: presslyPostgresOwnerSchemas.production.stageRuns.startedBy,
          completedBy:
            presslyPostgresOwnerSchemas.production.stageRuns.completedBy,
        })
        .from(presslyPostgresOwnerSchemas.production.stageRuns)
        .orderBy(
          asc(presslyPostgresOwnerSchemas.production.stageRuns.plannedStartAt),
        ),
      db
        .select({
          id: presslyPostgresOwnerSchemas.production.stageMachineAssignments.id,
          stageRunId:
            presslyPostgresOwnerSchemas.production.stageMachineAssignments
              .stageRunId,
          machineId:
            presslyPostgresOwnerSchemas.production.stageMachineAssignments
              .machineId,
          status:
            presslyPostgresOwnerSchemas.production.stageMachineAssignments
              .status,
          actualStartAt:
            presslyPostgresOwnerSchemas.production.stageMachineAssignments
              .actualStartAt,
          actualEndAt:
            presslyPostgresOwnerSchemas.production.stageMachineAssignments
              .actualEndAt,
        })
        .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
        .orderBy(
          asc(
            presslyPostgresOwnerSchemas.production.stageMachineAssignments.id,
          ),
        ),
      db
        .select({
          id: presslyPostgresOwnerSchemas.production
            .productionOrderStageAttempts.id,
          stageRunId:
            presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
              .stageRunId,
          status:
            presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
              .status,
          completedAt:
            presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
              .completedAt,
          completedBy:
            presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
              .completedBy,
        })
        .from(
          presslyPostgresOwnerSchemas.production.productionOrderStageAttempts,
        )
        .orderBy(
          asc(
            presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
              .id,
          ),
        ),
      db
        .select({
          id: presslyPostgresOwnerSchemas.production.productionOrders.id,
          operationalStatus:
            presslyPostgresOwnerSchemas.production.productionOrders
              .operationalStatus,
          executionStatus:
            presslyPostgresOwnerSchemas.production.productionOrders
              .executionStatus,
          version:
            presslyPostgresOwnerSchemas.production.productionOrders.version,
          finishedAt:
            presslyPostgresOwnerSchemas.production.productionOrders.finishedAt,
        })
        .from(presslyPostgresOwnerSchemas.production.productionOrders)
        .orderBy(
          asc(presslyPostgresOwnerSchemas.production.productionOrders.id),
        ),
      db
        .select({
          id: presslyPostgresOwnerSchemas.production.bags.id,
          status: presslyPostgresOwnerSchemas.production.bags.status,
        })
        .from(presslyPostgresOwnerSchemas.production.bags)
        .orderBy(asc(presslyPostgresOwnerSchemas.production.bags.id)),
    ]);
  return canonicalize({
    run: run[0] ?? null,
    shift: shift[0] ?? null,
    batch: batch[0] ?? null,
    stages,
    assignments,
    attempts,
    orders: storedOrders,
    bags,
  }) as FloorState;
};

const readRevision = async (): Promise<number> => {
  const [location] = await database.db
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

type Observation = Readonly<{
  outcomes: readonly CanonicalOutcome[];
  stateDelta: Readonly<{ before: FloorState; after: FloorState }>;
  workEvents: readonly unknown[];
  idempotencyReceipt: unknown | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly FloorSignal[];
}>;

type ScenarioRun = (
  runners: FloorRunners,
) => Promise<readonly CanonicalOutcome[]>;

const observeConformance = async (input: {
  fixture: Fixture;
  idempotencyKeys: readonly string[];
  normalizeWinningKey?: boolean;
  run: ScenarioRun;
}): Promise<Observation> => {
  await database.reset();
  await seedFloor(input.fixture);
  const before = await readState(database.db);
  const revisionBefore = await readRevision();
  const signalRecorder = makeFloorSignalRecorder();
  const runners = makeFloorRunners({
    db: database.db,
    ids: generatedIds(),
    clock: { now: () => new Date(now) },
    signalRecorder,
  });
  const outcomes = await input.run(runners);
  const keys = new Set(input.idempotencyKeys);
  const events = (
    await database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.workEvents)
  )
    .filter((event) => keys.has(event.idempotencyKey))
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorId: event.actorId,
      expectedVersion: event.expectedVersion,
      idempotencyKey:
        input.normalizeWinningKey === true
          ? '<winning-command>'
          : event.idempotencyKey,
      payload: canonicalize(event.payload),
    }));
  const firstPayload = record(events[0]?.payload);
  return {
    outcomes,
    stateDelta: { before, after: await readState(database.db) },
    workEvents: events,
    idempotencyReceipt: firstPayload?.['_idempotency'] ?? null,
    liveRevision: { before: revisionBefore, after: await readRevision() },
    signals: signalRecorder.read(),
  };
};

const expectNoMutation = (
  observation: Observation,
  signals: readonly FloorSignal[] = [],
): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.workEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
  expect(observation.signals).toEqual(signals);
};

const expectOneCommit = (observation: Observation): void => {
  expect(observation.workEvents).toHaveLength(1);
  expect(observation.idempotencyReceipt).not.toBeNull();
  expect(observation.liveRevision.after).toBe(
    observation.liveRevision.before + 1,
  );
};

const expectFailure = (observation: Observation, code: string): void => {
  expect(observation.outcomes).toHaveLength(1);
  expect(observation.outcomes[0]).toMatchObject({
    kind: 'failure',
    failure: { code },
  });
};

const assignmentCommand = (
  key: string,
  overrides: Partial<AssignStageMachinesCommand> = {},
): AssignStageMachinesCommand => ({
  locationId,
  stageRunId: ids.stages[1]!,
  actorId: ids.actor,
  expectedVersion: 1,
  idempotencyKey: key,
  machineIds: [ids.washer],
  ...overrides,
});

const membershipCommand = (
  key: string,
  overrides: Partial<BatchMembershipCommand> = {},
): BatchMembershipCommand => ({
  locationId,
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  idempotencyKey: key,
  actorId: ids.actor,
  ...overrides,
});

const reconcileCommand = (
  key: string,
  overrides: Partial<ReconcileBatchProgressCommand> = {},
): ReconcileBatchProgressCommand => ({
  locationId,
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  expectedStageVersions: ids.stages.map((stageRunId) => ({
    stageRunId,
    version: 1,
  })),
  target: 'sorting_started',
  reason: 'updates_missed',
  note: null,
  machineIds: [],
  confirmation: null,
  idempotencyKey: key,
  actorId: ids.actor,
  ...overrides,
});

const previewAndConfirm = async (
  runners: FloorRunners,
  command: ReconcileBatchProgressCommand,
  options: Readonly<{ replay?: boolean }> = {},
): Promise<readonly CanonicalOutcome[]> => {
  const previewRaw = await runners.reconcileBatchProgress(command);
  const preview = canonicalOutcome(previewRaw);
  const confirmation = record(resultValue(previewRaw)?.['confirmation']);
  const proposalHash = confirmation?.['proposalHash'];
  if (typeof proposalHash !== 'string') return [preview];
  const confirmed = { ...command, confirmation: { proposalHash } };
  const committed = await capture(() =>
    runners.reconcileBatchProgress(confirmed),
  );
  return options.replay === true
    ? [
        preview,
        committed,
        await capture(() => runners.reconcileBatchProgress(confirmed)),
      ]
    : [preview, committed];
};

describe('production.assign-stage-machines.v1 permanent conformance', () => {
  const base: Fixture = {
    batchStatus: 'sorting',
    membershipFrozen: true,
    stageStatuses: ['completed', 'planned', 'planned', 'planned'],
  };

  it('commits, stores the receipt, and replays exactly', async () => {
    const key = 'assign-conformance-replay';
    const command = assignmentCommand(key);
    const observation = await observeConformance({
      fixture: base,
      idempotencyKeys: [key],
      run: async (runners) => [
        await capture(() => runners.assignStageMachines(command)),
        await capture(() => runners.assignStageMachines(command)),
      ],
    });
    expectOneCommit(observation);
    expect(observation.outcomes).toMatchObject([
      { kind: 'success', value: { version: 2, replayed: false } },
      { kind: 'success', value: { version: 2, replayed: true } },
    ]);
    expect(observation.signals).toEqual([]);
  });

  it.each([
    {
      name: 'missing stage',
      fixture: base,
      command: assignmentCommand('assign-missing', {
        stageRunId: ids.missing,
      }),
      code: 'stage_run_not_found',
    },
    {
      name: 'stale stage version',
      fixture: base,
      command: assignmentCommand('assign-stale', { expectedVersion: 2 }),
      code: 'stage_run_version_conflict',
    },
    {
      name: 'missing machine',
      fixture: base,
      command: assignmentCommand('assign-machine-missing', {
        machineIds: [ids.missing],
      }),
      code: 'machine_not_found',
    },
    {
      name: 'inactive machine',
      fixture: { ...base, machineActive: false },
      command: assignmentCommand('assign-machine-inactive'),
      code: 'machine_unavailable',
    },
    {
      name: 'insufficient capacity',
      fixture: { ...base, machineCapacityLbs: 20 },
      command: assignmentCommand('assign-machine-capacity'),
      code: 'machine_capacity_insufficient',
    },
    {
      name: 'machine assignment on a non-machine stage',
      fixture: {},
      command: assignmentCommand('assign-machine-stage-kind', {
        stageRunId: ids.stages[0]!,
      }),
      code: 'machine_not_allowed_for_stage',
    },
  ])('$name', async ({ fixture, command, code }) => {
    const observation = await observeConformance({
      fixture,
      idempotencyKeys: [command.idempotencyKey],
      run: async (runners) => [
        await capture(() => runners.assignStageMachines(command)),
      ],
    });
    expectFailure(observation, code);
    expectNoMutation(observation);
  });

  it('rejects divergent reuse without a second mutation', async () => {
    const key = 'assign-conformance-divergent';
    const observation = await observeConformance({
      fixture: base,
      idempotencyKeys: [key],
      run: async (runners) => [
        await capture(() =>
          runners.assignStageMachines(assignmentCommand(key)),
        ),
        await capture(() =>
          runners.assignStageMachines(
            assignmentCommand(key, { machineIds: [ids.dryer] }),
          ),
        ),
      ],
    });
    expectOneCommit(observation);
    expect(observation.outcomes[1]).toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
  });

  it('serializes same-version commands to one assignment and event', async () => {
    const commands = [
      assignmentCommand('assign-conformance-race-a'),
      assignmentCommand('assign-conformance-race-b'),
    ];
    const observation = await observeConformance({
      fixture: base,
      idempotencyKeys: commands.map((command) => command.idempotencyKey),
      normalizeWinningKey: true,
      run: async (runners) =>
        sortOutcomes(
          await Promise.all(
            commands.map((command) =>
              capture(() => runners.assignStageMachines(command)),
            ),
          ),
        ),
    });
    expectOneCommit(observation);
    expect(observation.outcomes).toHaveLength(2);
    expect(observation.outcomes).toContainEqual(
      expect.objectContaining({ kind: 'success' }),
    );
    expect(observation.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'failure',
        failure: expect.objectContaining({
          code: 'stage_run_version_conflict',
        }),
      }),
    );
  });

  it('rolls assignment and stage version back when the event append fails', async () => {
    const key = 'assign-conformance-rollback';
    const observation = await observeConformance({
      fixture: { ...base, appendFailure: 'after-assignment' },
      idempotencyKeys: [key],
      run: async (runners) => [
        await capture(() =>
          runners.assignStageMachines(assignmentCommand(key)),
        ),
      ],
    });
    expect(observation.outcomes[0]).toMatchObject({
      kind: 'unexpected',
      error: { code: 'machine_assignment_failed' },
    });
    expectNoMutation(observation);
  });
});

const membershipCases = [
  {
    operation: 'freeze' as const,
    successFixture: {} satisfies Fixture,
    invalidMembershipFixture: { membershipFrozen: true } satisfies Fixture,
    invalidMembershipCode: 'batch_already_frozen',
    successSignal: { signal: 'batchFrozen', source: 'explicit' } as FloorSignal,
  },
  {
    operation: 'unfreeze' as const,
    successFixture: { membershipFrozen: true } satisfies Fixture,
    invalidMembershipFixture: {} satisfies Fixture,
    invalidMembershipCode: 'batch_already_mutable',
    successSignal: null,
  },
] as const;

describe.each(membershipCases)(
  'production.$operation-batch-membership.v1 permanent conformance',
  ({
    operation,
    successFixture,
    invalidMembershipFixture,
    invalidMembershipCode,
    successSignal,
  }) => {
    const execute = (runners: FloorRunners, command: BatchMembershipCommand) =>
      operation === 'freeze'
        ? runners.freezeBatchMembership(command)
        : runners.unfreezeBatchMembership(command);

    it('commits once and replays without repeating signals', async () => {
      const key = `${operation}-conformance-replay`;
      const command = membershipCommand(key);
      const observation = await observeConformance({
        fixture: successFixture,
        idempotencyKeys: [key],
        run: async (runners) => [
          await capture(() => execute(runners, command)),
          await capture(() => execute(runners, command)),
        ],
      });
      expectOneCommit(observation);
      expect(observation.outcomes).toMatchObject([
        { kind: 'success', value: { replayed: false } },
        { kind: 'success', value: { replayed: true } },
      ]);
      expect(observation.signals).toEqual(
        successSignal === null ? [] : [successSignal],
      );
    });

    it.each([
      {
        name: 'missing batch',
        fixture: successFixture,
        command: membershipCommand(`${operation}-missing`, {
          productionBatchId: ids.missing,
        }),
        code: 'production_batch_not_found',
        signals: [] as FloorSignal[],
      },
      {
        name: 'run not started',
        fixture: { ...successFixture, runStatus: 'completed' as const },
        command: membershipCommand(`${operation}-run-state`),
        code: 'production_run_not_started',
        signals: [] as FloorSignal[],
      },
      {
        name: 'stale queue version',
        fixture: { ...successFixture, queueVersion: 2 },
        command: membershipCommand(`${operation}-queue-stale`),
        code: 'production_queue_version_conflict',
        signals: [
          {
            signal: 'queueConflict' as const,
            operation: `${operation}_membership` as
              | 'freeze_membership'
              | 'unfreeze_membership',
          },
        ],
      },
      {
        name: 'stale batch version',
        fixture: { ...successFixture, batchVersion: 2 },
        command: membershipCommand(`${operation}-batch-stale`),
        code: 'production_batch_version_conflict',
        signals: [] as FloorSignal[],
      },
      {
        name: 'membership policy state',
        fixture: invalidMembershipFixture,
        command: membershipCommand(`${operation}-membership-state`),
        code: invalidMembershipCode,
        signals: [] as FloorSignal[],
      },
      {
        name: 'membership immutable after queue',
        fixture: {
          ...successFixture,
          batchStatus: 'sorting' as const,
          membershipFrozen: true,
        },
        command: membershipCommand(`${operation}-immutable`),
        code: 'batch_membership_immutable',
        signals: [] as FloorSignal[],
      },
    ])('$name', async ({ fixture, command, code, signals }) => {
      const observation = await observeConformance({
        fixture,
        idempotencyKeys: [command.idempotencyKey],
        run: async (runners) => [
          await capture(() => execute(runners, command)),
        ],
      });
      expectFailure(observation, code);
      expectNoMutation(observation, signals);
    });

    it('rejects divergent idempotency reuse', async () => {
      const key = `${operation}-conformance-divergent`;
      const first = membershipCommand(key);
      const observation = await observeConformance({
        fixture: successFixture,
        idempotencyKeys: [key],
        run: async (runners) => [
          await capture(() => execute(runners, first)),
          await capture(() =>
            execute(runners, { ...first, expectedQueueVersion: 2 }),
          ),
        ],
      });
      expectOneCommit(observation);
      expect(observation.outcomes[1]).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_idempotency_conflict' },
      });
    });

    it('serializes the queue race and emits one durable effect', async () => {
      const commands = [
        membershipCommand(`${operation}-conformance-race-a`),
        membershipCommand(`${operation}-conformance-race-b`),
      ];
      const observation = await observeConformance({
        fixture: successFixture,
        idempotencyKeys: commands.map((command) => command.idempotencyKey),
        normalizeWinningKey: true,
        run: async (runners) =>
          sortOutcomes(
            await Promise.all(
              commands.map((command) =>
                capture(() => execute(runners, command)),
              ),
            ),
          ),
      });
      expectOneCommit(observation);
      expect(observation.outcomes).toHaveLength(2);
      expect(observation.outcomes).toContainEqual(
        expect.objectContaining({ kind: 'success' }),
      );
      expect(observation.outcomes).toContainEqual(
        expect.objectContaining({ kind: 'failure' }),
      );
    });

    it('rolls batch and queue versions back after a late event failure', async () => {
      const key = `${operation}-conformance-rollback`;
      const observation = await observeConformance({
        fixture: { ...successFixture, appendFailure: 'direct' },
        idempotencyKeys: [key],
        run: async (runners) => [
          await capture(() => execute(runners, membershipCommand(key))),
        ],
      });
      expect(observation.outcomes[0]).toMatchObject({
        kind: 'unexpected',
        error: { code: 'batch_membership_change_failed' },
      });
      expectNoMutation(observation);
    });
  },
);

describe('production.reconcile-batch-progress.v1 permanent conformance', () => {
  it('previews confirmation without mutation or signal', async () => {
    const key = 'reconcile-conformance-preview';
    const observation = await observeConformance({
      fixture: {},
      idempotencyKeys: [key],
      run: async (runners) => [
        await capture(() =>
          runners.reconcileBatchProgress(reconcileCommand(key)),
        ),
      ],
    });
    expect(observation.outcomes[0]).toMatchObject({
      kind: 'success',
      value: {
        status: 'confirmation_required',
        currentMilestone: 'waiting_to_sort',
        targetMilestone: 'sorting_started',
      },
    });
    expectNoMutation(observation);
  });

  it('confirms, records, signals, and replays one forward reconciliation', async () => {
    const key = 'reconcile-conformance-replay';
    const observation = await observeConformance({
      fixture: {},
      idempotencyKeys: [key],
      run: (runners) =>
        previewAndConfirm(runners, reconcileCommand(key), { replay: true }),
    });
    expectOneCommit(observation);
    expect(observation.outcomes).toMatchObject([
      { kind: 'success', value: { status: 'confirmation_required' } },
      {
        kind: 'success',
        value: {
          status: 'reconciled',
          milestone: 'sorting_started',
          replayed: false,
        },
      },
      {
        kind: 'success',
        value: { status: 'reconciled', replayed: true },
      },
    ]);
    expect(observation.signals).toEqual([
      {
        signal: 'progressReconciled',
        target: 'sorting_started',
        runCompleted: false,
      },
    ]);
  });

  it.each([
    {
      name: 'missing batch',
      fixture: {} satisfies Fixture,
      command: reconcileCommand('reconcile-missing', {
        productionBatchId: ids.missing,
      }),
      code: 'production_batch_not_found',
    },
    {
      name: 'stale queue',
      fixture: { queueVersion: 2 } satisfies Fixture,
      command: reconcileCommand('reconcile-queue-stale'),
      code: 'production_queue_version_conflict',
    },
    {
      name: 'stale batch',
      fixture: { batchVersion: 2 } satisfies Fixture,
      command: reconcileCommand('reconcile-batch-stale'),
      code: 'production_batch_version_conflict',
    },
    {
      name: 'stale stage',
      fixture: { stageVersions: [2, 1, 1, 1] } satisfies Fixture,
      command: reconcileCommand('reconcile-stage-stale'),
      code: 'stage_run_version_conflict',
    },
    {
      name: 'empty machine selection',
      fixture: {} satisfies Fixture,
      command: reconcileCommand('reconcile-machine-required', {
        target: 'washing_started',
      }),
      code: 'machine_capacity_insufficient',
    },
    {
      name: 'machine missing',
      fixture: {} satisfies Fixture,
      command: reconcileCommand('reconcile-machine-missing', {
        target: 'washing_started',
        machineIds: [ids.missing],
      }),
      code: 'machine_not_found',
    },
    {
      name: 'run not started',
      fixture: { runStatus: 'completed' } satisfies Fixture,
      command: reconcileCommand('reconcile-run-state'),
      code: 'production_run_not_started',
    },
    {
      name: 'invalid stage sequence',
      fixture: {
        batchStatus: 'sorting',
        stageStatuses: ['started', 'started', 'planned', 'planned'],
      } satisfies Fixture,
      command: reconcileCommand('reconcile-stage-sequence'),
      code: 'batch_stage_sequence_invalid',
    },
    {
      name: 'batch status inconsistent with stages',
      fixture: { batchStatus: 'sorting' } satisfies Fixture,
      command: reconcileCommand('reconcile-batch-status'),
      code: 'batch_status_inconsistent',
    },
    {
      name: 'progress is not forward',
      fixture: {
        batchStatus: 'washing',
        stageStatuses: ['completed', 'started', 'planned', 'planned'],
      } satisfies Fixture,
      command: reconcileCommand('reconcile-not-forward', {
        target: 'sorting_completed',
      }),
      code: 'floor_progress_not_forward',
    },
    {
      name: 'same stage kind already active',
      fixture: { otherActiveStageKind: 'sorting' } satisfies Fixture,
      command: reconcileCommand('reconcile-stage-kind-active'),
      code: 'stage_kind_already_active',
    },
    {
      name: 'inactive machine',
      fixture: { machineActive: false } satisfies Fixture,
      command: reconcileCommand('reconcile-machine-inactive', {
        target: 'washing_started',
        machineIds: [ids.washer],
      }),
      code: 'machine_unavailable',
    },
    {
      name: 'occupied machine',
      fixture: {
        otherActiveStageKind: 'washing',
        occupyOtherActiveMachine: true,
      } satisfies Fixture,
      command: reconcileCommand('reconcile-machine-occupied', {
        target: 'washing_started',
        machineIds: [ids.washer],
      }),
      code: 'machine_unavailable',
    },
    {
      name: 'insufficient machine capacity',
      fixture: { machineCapacityLbs: 20 } satisfies Fixture,
      command: reconcileCommand('reconcile-machine-capacity', {
        target: 'washing_started',
        machineIds: [ids.washer],
      }),
      code: 'machine_capacity_insufficient',
    },
    {
      name: 'archived production order',
      fixture: {
        includeScheduledOrder: true,
        orderResolutionState: 'resolved_without_production',
      } satisfies Fixture,
      command: reconcileCommand('reconcile-order-resolved'),
      code: 'production_order_resolved',
    },
  ])('$name', async ({ fixture, command, code }) => {
    const observation = await observeConformance({
      fixture,
      idempotencyKeys: [command.idempotencyKey],
      run: async (runners) => [
        await capture(() => runners.reconcileBatchProgress(command)),
      ],
    });
    expectFailure(observation, code);
    expectNoMutation(observation);
  });

  it('rejects confirmed completion when assigned attempts are missing', async () => {
    const key = 'reconcile-attempts-missing';
    const observation = await observeConformance({
      fixture: {
        includeScheduledOrder: true,
        includeAttempts: false,
      },
      idempotencyKeys: [key],
      run: (runners) =>
        previewAndConfirm(
          runners,
          reconcileCommand(key, { target: 'finished' }),
        ),
    });
    expect(observation.outcomes[0]).toMatchObject({
      kind: 'success',
      value: { status: 'confirmation_required' },
    });
    expect(observation.outcomes[1]).toMatchObject({
      kind: 'failure',
      failure: { code: 'production_stage_attempts_missing' },
    });
    expectNoMutation(observation);
  });

  it('rejects stale confirmation without mutation', async () => {
    const key = 'reconcile-confirmation-stale';
    const command = reconcileCommand(key, {
      confirmation: { proposalHash: 'a'.repeat(64) },
    });
    const observation = await observeConformance({
      fixture: {},
      idempotencyKeys: [key],
      run: async (runners) => [
        await capture(() => runners.reconcileBatchProgress(command)),
      ],
    });
    expectFailure(observation, 'progress_reconciliation_confirmation_stale');
    expectNoMutation(observation);
  });

  it('rejects divergent key reuse after one confirmed commit', async () => {
    const key = 'reconcile-conformance-divergent';
    const observation = await observeConformance({
      fixture: {},
      idempotencyKeys: [key],
      run: async (runners) => {
        const command = reconcileCommand(key);
        const previewRaw = await runners.reconcileBatchProgress(command);
        const confirmation = record(resultValue(previewRaw)?.['confirmation']);
        const proposalHash = confirmation?.['proposalHash'];
        if (typeof proposalHash !== 'string')
          return [canonicalOutcome(previewRaw)];
        const confirmed = {
          ...command,
          confirmation: { proposalHash },
        };
        return [
          canonicalOutcome(previewRaw),
          await capture(() => runners.reconcileBatchProgress(confirmed)),
          await capture(() =>
            runners.reconcileBatchProgress({
              ...confirmed,
              reason: 'other',
            }),
          ),
        ];
      },
    });
    expectOneCommit(observation);
    expect(observation.outcomes[2]).toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
  });

  it('serializes confirmed queue progress to one durable result', async () => {
    const keys = [
      'reconcile-conformance-race-a',
      'reconcile-conformance-race-b',
    ];
    const observation = await observeConformance({
      fixture: {},
      idempotencyKeys: keys,
      normalizeWinningKey: true,
      run: async (runners) => {
        const previewRaw = await runners.reconcileBatchProgress(
          reconcileCommand('reconcile-race-preview'),
        );
        const confirmation = record(resultValue(previewRaw)?.['confirmation']);
        const proposalHash = confirmation?.['proposalHash'];
        if (typeof proposalHash !== 'string')
          return [canonicalOutcome(previewRaw)];
        return sortOutcomes(
          await Promise.all(
            keys.map((key) =>
              capture(() =>
                runners.reconcileBatchProgress(
                  reconcileCommand(key, { confirmation: { proposalHash } }),
                ),
              ),
            ),
          ),
        );
      },
    });
    expectOneCommit(observation);
    expect(observation.outcomes).toHaveLength(2);
    expect(observation.outcomes).toContainEqual(
      expect.objectContaining({ kind: 'success' }),
    );
    expect(observation.outcomes).toContainEqual(
      expect.objectContaining({ kind: 'failure' }),
    );
  });

  it('terminalizes attempts, order, bags, batch, run, and shift', async () => {
    const key = 'reconcile-conformance-terminal';
    const observation = await observeConformance({
      fixture: {
        includeScheduledOrder: true,
        includeAttempts: true,
        includePlannedAssignments: true,
      },
      idempotencyKeys: [key],
      run: (runners) =>
        previewAndConfirm(
          runners,
          reconcileCommand(key, { target: 'finished' }),
        ),
    });
    expectOneCommit(observation);
    expect(observation.outcomes[0]).toMatchObject({
      kind: 'success',
      value: {
        status: 'confirmation_required',
        effects: {
          finishesBatch: true,
          finishesRun: true,
          closesShift: true,
        },
      },
    });
    expect(observation.outcomes[1]).toMatchObject({
      kind: 'success',
      value: {
        status: 'reconciled',
        milestone: 'finished',
        finishedOrderCount: 1,
        finishedBagCount: 2,
        runCompleted: true,
        shiftClosed: true,
      },
    });
    expect(observation.stateDelta.after).toMatchObject({
      run: { status: 'completed' },
      shift: { status: 'closed' },
      batch: { status: 'finished' },
      orders: [{ operationalStatus: 'finished', executionStatus: 'finished' }],
      bags: [{ status: 'finished' }, { status: 'finished' }],
    });
    expect(
      observation.stateDelta.after.attempts.every(
        (attempt) => record(attempt)?.['status'] === 'completed',
      ),
    ).toBe(true);
    expect(observation.signals).toEqual([
      {
        signal: 'progressReconciled',
        target: 'finished',
        runCompleted: true,
      },
    ]);
  });

  it('rolls terminal state back when the audit append fails', async () => {
    const key = 'reconcile-conformance-rollback';
    const observation = await observeConformance({
      fixture: {
        includeScheduledOrder: true,
        includeAttempts: true,
        includePlannedAssignments: true,
        appendFailure: 'direct',
      },
      idempotencyKeys: [key],
      run: (runners) =>
        previewAndConfirm(
          runners,
          reconcileCommand(key, { target: 'finished' }),
        ),
    });
    expect(observation.outcomes[1]).toMatchObject({
      kind: 'unexpected',
      error: { code: 'progress_reconciliation_failed' },
    });
    expectNoMutation(observation);
  });
});
