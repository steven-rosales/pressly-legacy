import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { advanceStageCellDeclaration } from './cell.ts';
import {
  productionActorReadTestCapability,
  productionScopeReconciliationTestCapability,
} from '../../../testing/production-capabilities.spec-support.ts';
import { asc, eq } from '@pressly/postgres/query';
import { isAppError } from '@pressly/errors/app-error';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeAdvanceStageCompletionConfirmationRequired,
  makeAdvanceStageStartConfirmationRequired,
  matchesAdvanceStageCompletionConfirmation,
  matchesAdvanceStageStartConfirmation,
  type AdvanceStageLifecyclePolicy,
} from './confirmation.ts';
import {
  makeExecuteAdvanceStage,
  type AdvanceStageRepository,
} from './execute.ts';
import {
  advanceStageIdempotency,
  type StoredAdvanceStageWorkEvent,
} from './idempotency.ts';
import { makeAdvanceStagePostgresRepository } from './postgres.ts';
import type {
  AdvanceStageBatchState,
  AdvanceStageCommand,
  AdvanceStagePolicy,
} from './types.ts';
import { makeProductionSystem } from '../../../system.ts';

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
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_links',
  'order_items',
  'webhook_events',
  'source_location_bindings',
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
beforeEach(database.reset);
afterAll(database.close);

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  sortingStation: '10000000-0000-4000-8000-000000000003',
  washingStation: '10000000-0000-4000-8000-000000000004',
  dryingStation: '10000000-0000-4000-8000-000000000005',
  foldingStation: '10000000-0000-4000-8000-000000000006',
  config: '10000000-0000-4000-8000-000000000007',
  schedule: '10000000-0000-4000-8000-000000000008',
  run: '10000000-0000-4000-8000-000000000009',
  batch: '10000000-0000-4000-8000-000000000010',
  sortingStage: '10000000-0000-4000-8000-000000000011',
  washingStage: '10000000-0000-4000-8000-000000000012',
  dryingStage: '10000000-0000-4000-8000-000000000013',
  foldingStage: '10000000-0000-4000-8000-000000000014',
  washer: '10000000-0000-4000-8000-000000000015',
  assignment: '10000000-0000-4000-8000-000000000016',
  sourceOrder: '10000000-0000-4000-8000-000000000017',
  fulfillment: '10000000-0000-4000-8000-000000000018',
  demand: '10000000-0000-4000-8000-000000000019',
  productionOrder: '10000000-0000-4000-8000-000000000020',
  membership: '10000000-0000-4000-8000-000000000021',
  attempt: '10000000-0000-4000-8000-000000000022',
  bag: '10000000-0000-4000-8000-000000000023',
} as const;

const locationId = 'location-1';
const businessId = '00000000-0000-4000-8000-000000000100';
const plannedStartAt = new Date('2026-08-21T14:00:00.000Z');
const plannedEndAt = new Date('2026-08-21T14:56:00.000Z');
const commandTime = new Date('2026-08-21T15:00:00.000Z');

const makeIds = (): IdSource => {
  let next = 1;
  return {
    next: () => `20000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  };
};

const batchTransition = (
  event: Parameters<
    AdvanceStageLifecyclePolicy['evaluateProductionBatchTransition']
  >[0]['event'],
) => {
  const decisions: Record<
    typeof event,
    Readonly<{ from: AdvanceStageBatchState; state: AdvanceStageBatchState }>
  > = {
    start_sorting: { from: 'queued', state: 'sorting' },
    start_washing: { from: 'sorting', state: 'washing' },
    start_drying: { from: 'washing', state: 'drying' },
    start_folding_packaging: {
      from: 'drying',
      state: 'folding_packaging',
    },
    finish: { from: 'folding_packaging', state: 'finished' },
  };
  return decisions[event];
};

const lifecyclePolicy: AdvanceStageLifecyclePolicy = {
  evaluateProductionOrderOperationalAccess: () => ({ tag: 'ok', value: {} }),
  evaluateStageTransition: (_entity, event) => ({
    tag: 'ok',
    value:
      event.type === 'start'
        ? { status: 'allowed', from: 'planned', state: 'started' }
        : { status: 'allowed', from: 'started', state: 'completed' },
  }),
  evaluateMachineAssignment: () => ({ tag: 'ok', value: {} }),
  evaluateProductionBatchTransition: ({ event }) => ({
    tag: 'ok',
    value: batchTransition(event),
  }),
  evaluateProductionOrderStageAttemptTransition: () => ({
    tag: 'ok',
    value: { from: 'assigned', state: 'completed' },
  }),
  resolveProductionOrderExecutionState: () => ({
    tag: 'ok',
    value: 'scheduled',
  }),
  evaluateProductionOrderExecutionTransition: () => ({
    tag: 'ok',
    value: { from: 'scheduled', state: 'finished' },
  }),
  evaluateProductionRunTransition: () => ({
    tag: 'ok',
    value: { from: 'started', state: 'completed' },
  }),
  evaluateProductionShiftTransition: () => ({
    tag: 'ok',
    value: { from: 'open', state: 'closed' },
  }),
};

const decisionPolicy: AdvanceStagePolicy = {
  ...lifecyclePolicy,
  makeStageStartConfirmationRequired: makeAdvanceStageStartConfirmationRequired,
  matchesStageStartConfirmation: matchesAdvanceStageStartConfirmation,
  makeStageCompletionConfirmationRequired:
    makeAdvanceStageCompletionConfirmationRequired,
  matchesStageCompletionConfirmation: matchesAdvanceStageCompletionConfirmation,
};

type FixtureKind = 'sorting' | 'washing' | 'terminal';

const seedCore = async (kind: FixtureKind): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId,
      name: 'Native Advance Stage Facility',
      timezone: 'America/New_York',
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-21T08:00:00.000Z'),
    endsAt: new Date('2026-08-21T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
    version: 1,
  });
  await database.db.insert(productionTestSchema.stations).values([
    {
      id: ids.sortingStation,
      locationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    },
    {
      id: ids.washingStation,
      locationId,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
    },
    {
      id: ids.dryingStation,
      locationId,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 3,
    },
    {
      id: ids.foldingStation,
      locationId,
      kind: 'folding_packaging',
      label: 'Folding',
      sortOrder: 4,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
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
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
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
    makespanMinutes: 280,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-08-21T08:00:00.000Z'),
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: new Date('2026-08-21T08:00:00.000Z'),
    queueVersion: 1,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
    overtimeProposalHash: 'd'.repeat(64),
    overtimeQueueVersion: 1,
    overtimeAcknowledgedBy: ids.actor,
    overtimeAcknowledgedAt: new Date('2026-08-21T13:00:00.000Z'),
    version: 1,
  });

  const terminal = kind === 'terminal';
  const washing = kind === 'washing';
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 0,
    status: terminal ? 'folding_packaging' : washing ? 'sorting' : 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: terminal ? 25 : 75,
    pulseMinutes: 56,
    plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
    ...(!terminal && !washing
      ? { version: 1 }
      : {
          startedAt: new Date('2026-08-21T10:00:00.000Z'),
          membershipFrozenAt: new Date('2026-08-21T10:00:00.000Z'),
          membershipFrozenBy: ids.actor,
          version: terminal ? 4 : 2,
        }),
  });
};

const completedStage = (input: {
  id: string;
  stationId: string;
  stageKind: 'sorting' | 'washing' | 'drying';
  start: string;
  end: string;
  version: number;
}) => ({
  id: input.id,
  locationId,
  productionBatchId: ids.batch,
  stationId: input.stationId,
  stageKind: input.stageKind,
  status: 'completed',
  plannedStartAt: new Date(input.start),
  plannedEndAt: new Date(input.end),
  actualStartAt: new Date(input.start),
  actualEndAt: new Date(input.end),
  actualStartProvenance: 'live_observed' as const,
  actualEndProvenance: 'live_observed' as const,
  startedBy: ids.actor,
  completedBy: ids.actor,
  version: input.version,
});

const seedTerminalOrder = async (): Promise<void> => {
  const dueAt = new Date('2026-08-21T20:00:00.000Z');
  const createdAt = new Date('2026-08-21T07:00:00.000Z');
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'e'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'ORDER-1',
    locationId,
    revisionAt: createdAt,
    phase: 'production_released',
    estimatedWeightLbs: 25,
    estimatedWeightSource: 'test_estimate',
    dueAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt,
    operationalStatus: 'scheduled',
    executionStatus: 'scheduled',
    resolutionState: 'open',
    derivedWeightLbs: 25,
    derivedWeightSource: 'test_estimate',
    bagCount: 1,
    bagCountSource: 'operator_count',
    intakeRecordedAt: createdAt,
    intakeVersion: 1,
    eligibleAt: createdAt,
    version: 5,
  });
  await database.db.insert(productionTestSchema.bags).values({
    id: ids.bag,
    productionOrderId: ids.productionOrder,
    bagIndex: 0,
    status: 'scheduled',
  });
  await database.db.insert(productionTestSchema.productionBatchOrders).values({
    id: ids.membership,
    locationId,
    productionBatchId: ids.batch,
    productionOrderId: ids.productionOrder,
    active: true,
    placementProvenance: 'initial_schedule',
    placedBy: ids.actor,
  });
  await database.db
    .insert(productionTestSchema.productionOrderStageAttempts)
    .values({
      id: ids.attempt,
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.productionOrder,
      stageRunId: ids.foldingStage,
      stageKind: 'folding_packaging',
      attemptNumber: 1,
      status: 'assigned',
      assignmentReason: 'initial_schedule',
      assignedBy: ids.actor,
    });
};

const seedFixture = async (kind: FixtureKind): Promise<string> => {
  await seedCore(kind);
  if (kind === 'sorting') {
    await database.db.insert(productionTestSchema.stageRuns).values({
      id: ids.sortingStage,
      locationId,
      productionBatchId: ids.batch,
      stationId: ids.sortingStation,
      stageKind: 'sorting',
      status: 'planned',
      plannedStartAt,
      plannedEndAt,
      version: 1,
    });
    return ids.sortingStage;
  }

  if (kind === 'washing') {
    await database.db.insert(productionTestSchema.stageRuns).values([
      completedStage({
        id: ids.sortingStage,
        stationId: ids.sortingStation,
        stageKind: 'sorting',
        start: '2026-08-21T13:04:00.000Z',
        end: plannedStartAt.toISOString(),
        version: 3,
      }),
      {
        id: ids.washingStage,
        locationId,
        productionBatchId: ids.batch,
        stationId: ids.washingStation,
        stageKind: 'washing',
        status: 'planned',
        plannedStartAt,
        plannedEndAt,
        version: 1,
      },
    ]);
    await database.db.insert(productionTestSchema.machines).values({
      id: ids.washer,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
    });
    await database.db
      .insert(productionTestSchema.stageMachineAssignments)
      .values({
        id: ids.assignment,
        locationId,
        stageRunId: ids.washingStage,
        machineId: ids.washer,
        plannedStartAt,
        plannedEndAt,
        status: 'planned',
      });
    return ids.washingStage;
  }

  await database.db.insert(productionTestSchema.stageRuns).values([
    completedStage({
      id: ids.sortingStage,
      stationId: ids.sortingStation,
      stageKind: 'sorting',
      start: '2026-08-21T10:00:00.000Z',
      end: '2026-08-21T10:56:00.000Z',
      version: 3,
    }),
    completedStage({
      id: ids.washingStage,
      stationId: ids.washingStation,
      stageKind: 'washing',
      start: '2026-08-21T11:00:00.000Z',
      end: '2026-08-21T11:56:00.000Z',
      version: 3,
    }),
    completedStage({
      id: ids.dryingStage,
      stationId: ids.dryingStation,
      stageKind: 'drying',
      start: '2026-08-21T12:00:00.000Z',
      end: '2026-08-21T12:56:00.000Z',
      version: 3,
    }),
    {
      id: ids.foldingStage,
      locationId,
      productionBatchId: ids.batch,
      stationId: ids.foldingStation,
      stageKind: 'folding_packaging',
      status: 'started',
      plannedStartAt,
      plannedEndAt,
      actualStartAt: plannedStartAt,
      actualStartProvenance: 'live_observed',
      startedBy: ids.actor,
      version: 1,
    },
  ]);
  await seedTerminalOrder();
  return ids.foldingStage;
};

const startCommand = (
  idempotencyKey: string,
  stageRunId: string = ids.sortingStage,
): Extract<AdvanceStageCommand, { transition: 'start' }> => ({
  locationId,
  stageRunId,
  expectedVersion: 1,
  actorId: ids.actor,
  transition: 'start',
  idempotencyKey,
});

const completeCommand = (
  idempotencyKey: string,
): Extract<AdvanceStageCommand, { transition: 'complete' }> => ({
  locationId,
  stageRunId: ids.foldingStage,
  expectedVersion: 1,
  actorId: ids.actor,
  transition: 'complete',
  idempotencyKey,
});

const makeSystem = (signals?: { batchFrozen: () => void }) =>
  makeProductionSystem({
    db: database.db,
    schema: productionTestSchema,
    productionActorReadV1: productionActorReadTestCapability(),
    productionScopeReconciliationV1:
      productionScopeReconciliationTestCapability(database.db),
    ids: makeIds(),
    clock: { now: () => new Date(commandTime) },
    ...(signals === undefined ? {} : { signals }),
  });

const makeExecutor = (
  repo: AdvanceStageRepository<StoredAdvanceStageWorkEvent>,
) =>
  makeExecuteAdvanceStage({
    repo,
    idempotency: advanceStageIdempotency,
    policy: decisionPolicy,
    clock: { now: () => new Date(commandTime) },
  });

const synchronizedFirstMisses = (
  repository: AdvanceStageRepository<StoredAdvanceStageWorkEvent>,
) => {
  let firstMissCount = 0;
  let releaseBoth = (): void => undefined;
  const bothMissed = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  const synchronized: AdvanceStageRepository<StoredAdvanceStageWorkEvent> = {
    transaction: (work) =>
      repository.transaction((operations) => {
        let firstLookup = true;
        return work({
          ...operations,
          findWorkEvent: async (idempotencyKey) => {
            const stored = await operations.findWorkEvent(idempotencyKey);
            if (!firstLookup || stored !== null) return stored;
            firstLookup = false;
            firstMissCount += 1;
            if (firstMissCount === 2) releaseBoth();
            await bothMissed;
            return null;
          },
        });
      }),
  };
  return { repository: synchronized, firstMissCount: () => firstMissCount };
};

const observe = async (stageRunId: string) => {
  const [
    stages,
    batches,
    runs,
    shifts,
    assignments,
    attempts,
    orders,
    bags,
    memberships,
    events,
    locations,
  ] = await Promise.all([
    database.db
      .select()
      .from(productionTestSchema.stageRuns)
      .where(eq(productionTestSchema.stageRuns.id, stageRunId)),
    database.db
      .select()
      .from(productionTestSchema.productionBatches)
      .where(eq(productionTestSchema.productionBatches.id, ids.batch)),
    database.db
      .select()
      .from(productionTestSchema.productionRuns)
      .where(eq(productionTestSchema.productionRuns.id, ids.run)),
    database.db
      .select()
      .from(productionTestSchema.productionShifts)
      .where(eq(productionTestSchema.productionShifts.id, ids.shift)),
    database.db
      .select()
      .from(productionTestSchema.stageMachineAssignments)
      .where(
        eq(productionTestSchema.stageMachineAssignments.stageRunId, stageRunId),
      ),
    database.db
      .select()
      .from(productionTestSchema.productionOrderStageAttempts)
      .orderBy(asc(productionTestSchema.productionOrderStageAttempts.id)),
    database.db
      .select()
      .from(productionTestSchema.productionOrders)
      .orderBy(asc(productionTestSchema.productionOrders.id)),
    database.db
      .select()
      .from(productionTestSchema.bags)
      .orderBy(asc(productionTestSchema.bags.id)),
    database.db
      .select()
      .from(productionTestSchema.productionBatchOrders)
      .orderBy(asc(productionTestSchema.productionBatchOrders.id)),
    database.db
      .select()
      .from(productionTestSchema.workEvents)
      .orderBy(asc(productionTestSchema.workEvents.id)),
    database.db
      .select()
      .from(productionTestSchema.productionLocations)
      .where(eq(productionTestSchema.productionLocations.id, locationId)),
  ]);
  return {
    stage: stages[0],
    batch: batches[0],
    run: runs[0],
    shift: shifts[0],
    assignment: assignments[0],
    attempt: attempts[0],
    order: orders[0],
    bag: bags[0],
    membership: memberships[0],
    events,
    liveRevision: locations[0]?.liveRevision,
  } as const;
};

describe('native production.advance-stage.v1 PostgreSQL adapter', () => {
  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits stage, batch, queue, receipt, event, revision, and post-commit signal once',
        proves: ['postgres-commit'],
        run: async () => {
          await seedFixture('sorting');
          let signals = 0;
          const system = makeSystem({ batchFrozen: () => (signals += 1) });

          await expect(
            system.cells.advanceStage.execute(
              startCommand('native-advance-stage-success'),
            ),
          ).resolves.toEqual({
            kind: 'success',
            value: { entityId: ids.sortingStage, version: 2, replayed: false },
          });
          const observation = await observe(ids.sortingStage);
          expect(observation).toMatchObject({
            stage: {
              status: 'started',
              version: 2,
              actualStartAt: commandTime,
              actualStartProvenance: 'live_observed',
              startedBy: ids.actor,
            },
            batch: {
              status: 'sorting',
              version: 2,
              membershipFrozenAt: commandTime,
              membershipFrozenBy: ids.actor,
            },
            run: {
              queueVersion: 2,
              overtimeProposalHash: null,
              overtimeQueueVersion: null,
              overtimeAcknowledgedBy: null,
              overtimeAcknowledgedAt: null,
            },
            liveRevision: 1,
          });
          expect(observation.events).toHaveLength(1);
          expect(observation.events[0]).toMatchObject({
            eventType: 'stage_started',
            entityType: 'stage_run',
            entityId: ids.sortingStage,
            actorId: ids.actor,
            expectedVersion: 1,
            idempotencyKey: 'native-advance-stage-success',
            payload: {
              version: 2,
              _idempotency: {
                version: 1,
                command: {
                  operation: 'stage_started',
                  locationId,
                  actorId: ids.actor,
                  target: {
                    entityType: 'stage_run',
                    entityId: ids.sortingStage,
                  },
                  expectedVersion: 1,
                  payload: { transition: 'start' },
                },
                result: {
                  entityId: ids.sortingStage,
                  version: 2,
                  replayed: false,
                },
              },
            },
          });
          expect(signals).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays an identical command without a second write or signal',
        proves: ['same-payload-replay', 'same-key-concurrency'],
        run: async () => {
          await seedFixture('sorting');
          let signals = 0;
          const system = makeSystem({ batchFrozen: () => (signals += 1) });
          const command = startCommand('native-advance-stage-replay');

          const outcomes = await Promise.all([
            system.cells.advanceStage.execute(command),
            system.cells.advanceStage.execute(command),
          ]);

          expect(outcomes).toEqual(
            expect.arrayContaining([
              {
                kind: 'success',
                value: {
                  entityId: ids.sortingStage,
                  version: 2,
                  replayed: false,
                },
              },
              {
                kind: 'success',
                value: {
                  entityId: ids.sortingStage,
                  version: 2,
                  replayed: true,
                },
              },
            ]),
          );
          const observation = await observe(ids.sortingStage);
          expect(observation.events).toHaveLength(1);
          expect(observation.liveRevision).toBe(1);
          expect(signals).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects a different payload under the committed idempotency key',
        proves: [
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedFixture('sorting');
          const system = makeSystem();
          const command = startCommand('native-advance-stage-payload-conflict');
          await system.cells.advanceStage.execute(command);

          await expect(
            system.cells.advanceStage.execute({
              ...command,
              confirmation: {
                observedAt: '2026-08-21T14:30:00.000Z',
                confirmationHash: 'c'.repeat(64),
              },
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });
          const observation = await observe(ids.sortingStage);
          expect(observation.events).toHaveLength(1);
          expect(observation.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'allows one same-version command and rejects its concurrent competitor',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedFixture('sorting');
          const barrier = synchronizedFirstMisses(
            makeAdvanceStagePostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
          );
          const execute = makeExecutor(barrier.repository);

          const outcomes = await Promise.all([
            execute(startCommand('native-stage-version-race-1')),
            execute(startCommand('native-stage-version-race-2')),
          ]);

          expect(barrier.firstMissCount()).toBe(2);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'failure'),
          ).toEqual([
            expect.objectContaining({
              failure: expect.objectContaining({
                code: 'stage_run_version_conflict',
              }),
            }),
          ]);
          const observation = await observe(ids.sortingStage);
          expect(observation.events).toHaveLength(1);
          expect(observation.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back stage and assignment updates for a late typed batch conflict',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedFixture('washing');
          const native = makeAdvanceStagePostgresRepository(
            {
              db: database.db,
              ids: makeIds(),
            },
            productionTestSchema,
          );
          const conflicting: AdvanceStageRepository<StoredAdvanceStageWorkEvent> =
            {
              transaction: (work) =>
                native.transaction((operations) =>
                  work({
                    ...operations,
                    transitionStage: (input) =>
                      operations.transitionStage({
                        ...input,
                        batchExpectedVersion: input.batchExpectedVersion + 1,
                      }),
                  }),
                ),
            };

          await expect(
            makeExecutor(conflicting)(
              startCommand('native-late-typed-rollback', ids.washingStage),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_stage_batch_version_conflict' },
          });
          const observation = await observe(ids.washingStage);
          expect(observation).toMatchObject({
            stage: { status: 'planned', version: 1, actualStartAt: null },
            assignment: { status: 'planned', actualStartAt: null },
            batch: { status: 'sorting', version: 2 },
            run: { queueVersion: 1 },
            events: [],
            liveRevision: 0,
          });
        },
      },
    ],
  });

  it('terminalizes attempt, order, bag, membership, batch, run, and shift atomically', async () => {
    await seedFixture('terminal');
    const system = makeSystem();

    await expect(
      system.cells.advanceStage.execute(
        completeCommand('native-terminal-success'),
      ),
    ).resolves.toEqual({
      kind: 'success',
      value: { entityId: ids.foldingStage, version: 2, replayed: false },
    });
    const observation = await observe(ids.foldingStage);
    expect(observation).toMatchObject({
      stage: { status: 'completed', version: 2, completedBy: ids.actor },
      batch: { status: 'finished', version: 5, finishedAt: commandTime },
      attempt: {
        status: 'completed',
        completedAt: commandTime,
        completedBy: ids.actor,
      },
      order: {
        operationalStatus: 'finished',
        executionStatus: 'finished',
        version: 6,
        finishedAt: commandTime,
      },
      bag: { status: 'finished' },
      membership: { active: false },
      run: { status: 'completed', version: 2, completedAt: commandTime },
      shift: { status: 'closed', version: 2 },
      liveRevision: 1,
    });
    expect(observation.events).toHaveLength(1);
    expect(observation.events[0]?.eventType).toBe('stage_completed');
  });

  it('preserves an owned terminal ConflictError and rolls back every prior write', async () => {
    await seedFixture('terminal');
    const native = makeAdvanceStagePostgresRepository(
      {
        db: database.db,
        ids: makeIds(),
      },
      productionTestSchema,
    );
    const conflicting: AdvanceStageRepository<StoredAdvanceStageWorkEvent> = {
      transaction: (work) =>
        native.transaction((operations) =>
          work({
            ...operations,
            transitionStage: (input) =>
              operations.transitionStage({
                ...input,
                terminalLifecycle:
                  input.terminalLifecycle === null
                    ? null
                    : {
                        ...input.terminalLifecycle,
                        orders: input.terminalLifecycle.orders.map((order) => ({
                          ...order,
                          expectedVersion: order.expectedVersion + 1,
                        })),
                      },
              }),
          }),
        ),
    };

    try {
      await makeExecutor(conflicting)(
        completeCommand('native-terminal-throwable-rollback'),
      );
      expect.unreachable('terminal conflict should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.kind).toBe('ConflictError');
        expect(error.code).toBe(
          'production_batch_completion_order_version_conflict',
        );
        expect(error.status).toBe(409);
      }
    }

    const observation = await observe(ids.foldingStage);
    expect(observation).toMatchObject({
      stage: { status: 'started', version: 1, actualEndAt: null },
      batch: { status: 'folding_packaging', version: 4, finishedAt: null },
      attempt: { status: 'assigned', completedAt: null },
      order: {
        operationalStatus: 'scheduled',
        executionStatus: 'scheduled',
        version: 5,
        finishedAt: null,
      },
      bag: { status: 'scheduled' },
      membership: { active: true },
      run: { status: 'started', version: 1, completedAt: null },
      shift: { status: 'open', version: 1 },
      events: [],
      liveRevision: 0,
    });
  });
});
