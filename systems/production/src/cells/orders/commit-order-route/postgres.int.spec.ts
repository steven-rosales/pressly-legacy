import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderRouteCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import type { JsonObject } from '@pressly/codec';
import { asc, eq, inArray } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import type { IdSource } from '@pressly/cells/id-source';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { evaluateOrderRouteProposal } from '../../../model/order-route-proposal/evaluate.ts';
import type { OrderRouteProposalCommand } from '../../../model/order-route-proposal/model.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { loadOrderRouteProposalContextForUpdate } from './context.postgres.ts';
import {
  makeExecuteCommitOrderRoute,
  type CommitOrderRouteRepository,
  type CommitOrderRouteSignals,
  type ExecuteCommitOrderRoute,
} from './execute.ts';
import {
  commitOrderRouteIdempotency,
  type StoredCommitOrderRouteWorkEvent,
} from './idempotency.ts';
import { makeCommitOrderRoutePostgresRepository } from './postgres.ts';
import type {
  CommitOrderRouteCommand,
  CommitOrderRouteMutationInput,
} from './types.ts';

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
    'scheduler_configs',
    'production_machines',
    'production_stations',
    'production_orders',
    'production_shifts',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 8,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const locationId = 'commit-route-location';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-21T12:00:00.000Z');
const shiftEndsAt = new Date('2026-08-21T22:00:00.000Z');
const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  config: '10000000-0000-4000-8000-000000000003',
  schedule: '10000000-0000-4000-8000-000000000004',
  run: '10000000-0000-4000-8000-000000000005',
  sourceBatch: '10000000-0000-4000-8000-000000000006',
  targetBatch: '10000000-0000-4000-8000-000000000007',
  sourceOrder: '10000000-0000-4000-8000-000000000008',
  sourceAnchorOrder: '10000000-0000-4000-8000-000000000009',
  targetOrder: '10000000-0000-4000-8000-000000000010',
  sourceDemand: '10000000-0000-4000-8000-000000000011',
  sourceAnchorDemand: '10000000-0000-4000-8000-000000000012',
  targetDemand: '10000000-0000-4000-8000-000000000013',
  sourceFulfillment: '10000000-0000-4000-8000-000000000017',
  anchorFulfillment: '10000000-0000-4000-8000-000000000018',
  targetFulfillment: '10000000-0000-4000-8000-000000000019',
  sortingStation: '10000000-0000-4000-8000-000000000020',
  washingStation: '10000000-0000-4000-8000-000000000021',
  dryingStation: '10000000-0000-4000-8000-000000000022',
  foldingStation: '10000000-0000-4000-8000-000000000023',
  washer: '10000000-0000-4000-8000-000000000024',
  dryer: '10000000-0000-4000-8000-000000000025',
} as const;

const sourceStages = {
  sorting: '20000000-0000-4000-8000-000000000001',
  washing: '20000000-0000-4000-8000-000000000002',
  drying: '20000000-0000-4000-8000-000000000003',
  folding_packaging: '20000000-0000-4000-8000-000000000004',
} as const;
const targetStages = {
  sorting: '30000000-0000-4000-8000-000000000001',
  washing: '30000000-0000-4000-8000-000000000002',
  drying: '30000000-0000-4000-8000-000000000003',
  folding_packaging: '30000000-0000-4000-8000-000000000004',
} as const;

const stationFor = (stage: (typeof stages)[number]) =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const windowFor = (base: Date, index: number) => ({
  start: new Date(base.getTime() + index * 60 * 60_000),
  end: new Date(base.getTime() + (index + 1) * 60 * 60_000),
});

const seedOrders = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.orderDemands).values(
    (
      [
        [ids.sourceDemand, ids.sourceFulfillment, 'commit-source', 20],
        [ids.sourceAnchorDemand, ids.anchorFulfillment, 'commit-anchor', 10],
        [ids.targetDemand, ids.targetFulfillment, 'commit-target', 40],
      ] as const
    ).map(([id, fulfillmentId, displayReference, weight]) => ({
      id,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference,
      locationId,
      revisionAt: now,
      phase: 'production_released',
      estimatedWeightLbs: weight,
      estimatedWeightSource: 'test_estimate',
      dueAt: shiftEndsAt,
    })),
  );
  await database.db.insert(productionTestSchema.productionOrders).values(
    (
      [
        [ids.sourceOrder, ids.sourceDemand, 20],
        [ids.sourceAnchorOrder, ids.sourceAnchorDemand, 10],
        [ids.targetOrder, ids.targetDemand, 40],
      ] as const
    ).map(([id, orderDemandId, weight]) => ({
      id,
      orderDemandId,
      locationId,
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: weight,
      derivedWeightSource: 'test_estimate',
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      version: 3,
      eligibleAt: now,
    })),
  );
};

const seed = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Commit Route Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: now,
    endsAt: shiftEndsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.stations).values(
    stages.map((stage, index) => ({
      id: stationFor(stage),
      locationId,
      kind: stage,
      label: stage,
      sortOrder: index + 1,
    })),
  );
  await database.db.insert(productionTestSchema.machines).values([
    {
      id: ids.washer,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
    },
    {
      id: ids.dryer,
      locationId,
      stationId: ids.dryingStation,
      label: 'Dryer 1',
      effectiveCapacityLbs: 100,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 60,
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
    batchCount: 2,
    makespanMinutes: 480,
    plannedCompletionAt: shiftEndsAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: now,
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: now,
    queueVersion: 4,
    plannedCompletionAt: shiftEndsAt,
    version: 1,
  });
  await seedOrders();
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: ids.targetBatch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 40,
      pulseMinutes: 60,
      plannedDoneAt: shiftEndsAt,
      version: 5,
    },
    {
      id: ids.sourceBatch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T16:00:00.000Z'),
      version: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
    {
      locationId,
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.sourceOrder,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.sourceAnchorOrder,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: ids.targetBatch,
      productionOrderId: ids.targetOrder,
      placementProvenance: 'initial_schedule',
    },
  ]);

  const targetBase = new Date('2026-08-21T17:00:00.000Z');
  await database.db.insert(productionTestSchema.stageRuns).values([
    ...stages
      .slice()
      .reverse()
      .map((stage) => {
        const index = stages.indexOf(stage);
        const window = windowFor(now, index);
        return {
          id: sourceStages[stage],
          locationId,
          productionBatchId: ids.sourceBatch,
          stationId: stationFor(stage),
          stageKind: stage,
          status: 'planned',
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          version: 1,
        };
      }),
    ...stages
      .slice()
      .reverse()
      .map((stage) => {
        const index = stages.indexOf(stage);
        const window = windowFor(targetBase, index);
        return {
          id: targetStages[stage],
          locationId,
          productionBatchId: ids.targetBatch,
          stationId: stationFor(stage),
          stageKind: stage,
          status: 'planned',
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          version: 1,
        };
      }),
  ]);
  const attemptRows = [
    [ids.sourceOrder, sourceStages],
    [ids.sourceAnchorOrder, sourceStages],
    [ids.targetOrder, targetStages],
  ].flatMap(([productionOrderId, stageIds]) =>
    stages
      .slice()
      .reverse()
      .map((stage) => ({
        locationId,
        productionRunId: ids.run,
        productionOrderId: productionOrderId as string,
        stageRunId: (stageIds as typeof sourceStages)[stage],
        stageKind: stage,
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: now,
        assignedBy: ids.actor,
      })),
  );
  await database.db
    .insert(productionTestSchema.productionOrderStageAttempts)
    .values(attemptRows);
  await database.db.insert(productionTestSchema.stageMachineAssignments).values(
    [sourceStages, targetStages].flatMap((stageIds, batchIndex) =>
      (['washing', 'drying'] as const).map((stage) => {
        const stageIndex = stages.indexOf(stage);
        const window = windowFor(
          batchIndex === 0 ? now : targetBase,
          stageIndex,
        );
        return {
          locationId,
          stageRunId: stageIds[stage],
          machineId: stage === 'washing' ? ids.washer : ids.dryer,
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          status: 'planned',
        };
      }),
    ),
  );
};

const proposalCommand: OrderRouteProposalCommand = {
  locationId,
  productionRunId: ids.run,
  productionOrderId: ids.sourceOrder,
  actorId: ids.actor,
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: ids.targetBatch,
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
};

const proposalFor = async (command: OrderRouteProposalCommand) =>
  database.db.transaction(async (transaction) => {
    const context = await loadOrderRouteProposalContextForUpdate(
      transaction,
      {
        locationId: command.locationId,
        productionRunId: command.productionRunId,
        productionOrderId: command.productionOrderId,
      },
      productionTestSchema,
    );
    if (context === null)
      throw invariantViolationError({
        code: 'commit_route_fixture_context_missing',
        message: 'Commit route fixture context is missing.',
        safeMessage: 'Commit route fixture context is missing.',
      });
    const decision = evaluateOrderRouteProposal({
      command,
      context,
      policy: productionRules,
      consistency: 'locked',
    });
    if (decision.kind === 'reject')
      throw invariantViolationError({
        code: 'commit_route_fixture_proposal_rejected',
        message: decision.failure.message,
        safeMessage: decision.failure.safeMessage,
      });
    return decision.proposal;
  });

type QueuedCommandOverrides = Partial<
  Pick<
    CommitOrderRouteCommand,
    | 'expectedQueueVersion'
    | 'expectedOrderVersion'
    | 'expectedSourceBatchVersion'
    | 'proposalHash'
    | 'idempotencyKey'
  >
>;

const queuedCommand = async (
  overrides: QueuedCommandOverrides = {},
): Promise<CommitOrderRouteCommand> => {
  const proposal = await proposalFor(proposalCommand);
  return {
    ...proposalCommand,
    proposalHash: proposal.proposalHash,
    idempotencyKey: 'commit-order-route-postgres-1',
    ...overrides,
  };
};

const idSource = (...fixed: string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      fixed[index++] ??
      `60000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`,
  };
};

type RepositoryTransform = (
  repository: CommitOrderRouteRepository<StoredCommitOrderRouteWorkEvent>,
) => CommitOrderRouteRepository<StoredCommitOrderRouteWorkEvent>;

const makeExecute = (input: {
  ids: IdSource;
  transformRepository?: RepositoryTransform;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
  signals?: CommitOrderRouteSignals;
}): ExecuteCommitOrderRoute => {
  const native = makeCommitOrderRoutePostgresRepository(
    {
      db: database.db,
      ids: input.ids,
      ...(input.observeUnitOfWork === undefined
        ? {}
        : { observeUnitOfWork: input.observeUnitOfWork }),
    },
    productionTestSchema,
  );
  return makeExecuteCommitOrderRoute({
    repo: input.transformRepository?.(native) ?? native,
    idempotency: commitOrderRouteIdempotency,
    policy: productionRules,
    clock: { now: () => now },
    ...(input.signals === undefined ? {} : { signals: input.signals }),
  });
};

const state = async () => {
  const [runs, orders, batches, memberships, attempts, events, locations] =
    await Promise.all([
      database.db
        .select({
          id: productionTestSchema.productionRuns.id,
          queueVersion: productionTestSchema.productionRuns.queueVersion,
          overtimeProposalHash:
            productionTestSchema.productionRuns.overtimeProposalHash,
          overtimeQueueVersion:
            productionTestSchema.productionRuns.overtimeQueueVersion,
          overtimeAcknowledgedBy:
            productionTestSchema.productionRuns.overtimeAcknowledgedBy,
          overtimeAcknowledgedAt:
            productionTestSchema.productionRuns.overtimeAcknowledgedAt,
        })
        .from(productionTestSchema.productionRuns)
        .orderBy(asc(productionTestSchema.productionRuns.id)),
      database.db
        .select({
          id: productionTestSchema.productionOrders.id,
          operationalStatus:
            productionTestSchema.productionOrders.operationalStatus,
          executionStatus:
            productionTestSchema.productionOrders.executionStatus,
          resolutionState:
            productionTestSchema.productionOrders.resolutionState,
          version: productionTestSchema.productionOrders.version,
          updatedAt: productionTestSchema.productionOrders.updatedAt,
        })
        .from(productionTestSchema.productionOrders)
        .orderBy(asc(productionTestSchema.productionOrders.id)),
      database.db
        .select({
          id: productionTestSchema.productionBatches.id,
          derivedWeightLbs:
            productionTestSchema.productionBatches.derivedWeightLbs,
          version: productionTestSchema.productionBatches.version,
          updatedAt: productionTestSchema.productionBatches.updatedAt,
        })
        .from(productionTestSchema.productionBatches)
        .orderBy(asc(productionTestSchema.productionBatches.sequenceIndex)),
      database.db
        .select()
        .from(productionTestSchema.productionBatchOrders)
        .where(
          eq(
            productionTestSchema.productionBatchOrders.productionOrderId,
            ids.sourceOrder,
          ),
        )
        .orderBy(
          asc(productionTestSchema.productionBatchOrders.placedAt),
          asc(productionTestSchema.productionBatchOrders.id),
        ),
      database.db
        .select()
        .from(productionTestSchema.productionOrderStageAttempts)
        .where(
          eq(
            productionTestSchema.productionOrderStageAttempts.productionOrderId,
            ids.sourceOrder,
          ),
        )
        .orderBy(
          asc(productionTestSchema.productionOrderStageAttempts.attemptNumber),
          asc(productionTestSchema.productionOrderStageAttempts.stageKind),
          asc(productionTestSchema.productionOrderStageAttempts.id),
        ),
      database.db
        .select()
        .from(productionTestSchema.workEvents)
        .orderBy(
          asc(productionTestSchema.workEvents.createdAt),
          asc(productionTestSchema.workEvents.id),
        ),
      database.db
        .select({
          revision: productionTestSchema.productionLocations.liveRevision,
        })
        .from(productionTestSchema.productionLocations)
        .where(eq(productionTestSchema.productionLocations.id, locationId)),
    ]);
  return {
    runs,
    orders,
    batches,
    memberships,
    attempts,
    events,
    liveRevision: locations[0]?.revision ?? -1,
  };
};

const firstReadBarrier = () => {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await bothArrived;
    },
    arrivals: () => arrivals,
  };
};

const gateFirstReplayRead =
  (barrier: ReturnType<typeof firstReadBarrier>): RepositoryTransform =>
  (native) => ({
    transaction: (work) =>
      native.transaction((repository) => {
        let first = true;
        return work({
          ...repository,
          findWorkEvent: async (key) => {
            const stored = await repository.findWorkEvent(key);
            if (first && stored === null) {
              first = false;
              await barrier.wait();
            }
            return stored;
          },
        });
      }),
  });

describe('commit order route native PostgreSQL command', () => {
  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects a not_found route context without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const before = await state();
          const execute = makeExecute({ ids: idSource() });
          await expect(
            execute({
              ...(await queuedCommand()),
              productionOrderId: '60000000-0000-4000-8000-000000000999',
              idempotencyKey: 'commit-order-route-not-found',
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'not_found',
              code: 'production_order_route_not_found',
            },
          });
          expect(await state()).toEqual(before);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits a queued whole-order move with exact state, event receipt, revision, and post-commit signal',
        proves: ['postgres-commit'],
        run: async () => {
          await seed();
          const membershipId = '60000000-0000-4000-8000-000000000001';
          const attemptIds = stages.map(
            (_stage, index) =>
              `60000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
          );
          const eventId = '60000000-0000-4000-8000-000000000006';
          const trace: string[] = [];
          const observeUnitOfWork: ProductionResultUnitOfWorkObserver = (
            unitOfWork,
          ) => ({
            transaction: async (work) => {
              const outcome = await unitOfWork.transaction(work);
              trace.push('transaction:committed');
              return outcome;
            },
          });
          const orderRouteOutcome = vi.fn<
            CommitOrderRouteSignals['orderRouteOutcome']
          >(() => trace.push('signal:outcome'));
          const queueConflict =
            vi.fn<CommitOrderRouteSignals['queueConflict']>();
          const command = await queuedCommand();
          const execute = makeExecute({
            ids: idSource(membershipId, ...attemptIds, eventId),
            observeUnitOfWork,
            signals: { orderRouteOutcome, queueConflict },
          });

          await expect(execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: {
              status: 'routed',
              queueVersion: 5,
              orderVersion: 4,
              sourceBatchVersion: 3,
              targetBatchVersion: 6,
              createdAttemptIds: attemptIds,
              replayed: false,
            },
          });

          const after = await state();
          expect(after.runs).toEqual([
            {
              id: ids.run,
              queueVersion: 5,
              overtimeProposalHash: null,
              overtimeQueueVersion: null,
              overtimeAcknowledgedBy: null,
              overtimeAcknowledgedAt: null,
            },
          ]);
          expect(
            after.orders.find((order) => order.id === ids.sourceOrder),
          ).toMatchObject({
            operationalStatus: 'scheduled',
            executionStatus: 'scheduled',
            resolutionState: 'open',
            version: 4,
            updatedAt: now,
          });
          expect(after.batches).toEqual([
            expect.objectContaining({
              id: ids.sourceBatch,
              derivedWeightLbs: 10,
              version: 3,
              updatedAt: now,
            }),
            expect.objectContaining({
              id: ids.targetBatch,
              derivedWeightLbs: 60,
              version: 6,
              updatedAt: now,
            }),
          ]);
          expect(after.memberships).toHaveLength(2);
          expect(after.memberships).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                productionBatchId: ids.sourceBatch,
                active: false,
                releasedAt: now,
                releasedBy: ids.actor,
                releaseReason: 'manual_rebatch',
              }),
              expect.objectContaining({
                id: membershipId,
                productionBatchId: ids.targetBatch,
                active: true,
                placementProvenance: 'manual_rebatch',
                placedAt: now,
                placedBy: ids.actor,
                pinnedAt: now,
                pinnedBy: ids.actor,
              }),
            ]),
          );
          expect(
            after.attempts.filter((attempt) => attempt.status === 'released'),
          ).toHaveLength(4);
          expect(
            after.attempts
              .filter((attempt) => attempt.status === 'assigned')
              .map((attempt) => attempt.id),
          ).toEqual(expect.arrayContaining(attemptIds));
          expect(
            after.attempts
              .filter((attempt) => attempt.status === 'assigned')
              .map((attempt) => attempt.attemptNumber),
          ).toEqual([2, 2, 2, 2]);
          expect(after.events).toHaveLength(1);
          expect(after.events[0]).toMatchObject({
            id: eventId,
            locationId,
            eventType: 'production_order_rebatched',
            entityType: 'production_order',
            entityId: ids.sourceOrder,
            actorId: ids.actor,
            expectedVersion: 3,
            idempotencyKey: command.idempotencyKey,
            payload: {
              productionRunId: ids.run,
              sourceProductionBatchId: ids.sourceBatch,
              targetProductionBatchId: ids.targetBatch,
              reason: 'manual_rebatch',
              restartStage: 'sorting',
              releasedStages: stages,
              assignedStages: stages,
              proposalHash: command.proposalHash,
              queueVersion: 5,
              orderVersion: 4,
              _idempotency: {
                version: 1,
                command: {
                  operation: 'production_order_rebatched',
                  locationId,
                  actorId: ids.actor,
                  target: {
                    entityType: 'production_order',
                    entityId: ids.sourceOrder,
                  },
                  expectedVersion: 3,
                  payload: {
                    kind: 'queued_move',
                    authorizedAction: 'production:stage',
                    reason: 'manual_rebatch',
                    restartStage: 'sorting',
                    expectedQueueVersion: 4,
                    expectedSourceBatchVersion: 2,
                    proposalHash: command.proposalHash,
                    targetProductionBatchId: ids.targetBatch,
                  },
                },
                result: {
                  status: 'routed',
                  queueVersion: 5,
                  orderVersion: 4,
                  sourceBatchVersion: 3,
                  targetBatchVersion: 6,
                  createdAttemptIds: attemptIds,
                  replayed: false,
                },
              },
            },
          });
          expect(after.liveRevision).toBe(1);
          expect(after.batches).toHaveLength(2);
          expect(trace).toEqual(['transaction:committed', 'signal:outcome']);
          expect(orderRouteOutcome).toHaveBeenCalledWith({
            operation: 'commit',
            status: 'committed',
            kind: 'queued_move',
            reason: 'manual_rebatch',
          });
          expect(queueConflict).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it('commits an in-flight exception route with suffix-only attempts and unpinned membership', async () => {
    await seed();
    const startedAt = new Date('2026-08-21T13:00:00.000Z');
    await database.db
      .update(productionTestSchema.productionBatches)
      .set({
        status: 'washing',
        startedAt,
        membershipFrozenAt: startedAt,
        membershipFrozenBy: ids.actor,
      })
      .where(eq(productionTestSchema.productionBatches.id, ids.sourceBatch));
    await database.db
      .update(productionTestSchema.stageRuns)
      .set({
        status: 'completed',
        actualStartAt: now,
        actualEndAt: startedAt,
        actualStartProvenance: 'live_observed',
        actualEndProvenance: 'live_observed',
        startedBy: ids.actor,
        completedBy: ids.actor,
        version: 3,
      })
      .where(eq(productionTestSchema.stageRuns.id, sourceStages.sorting));
    await database.db
      .update(productionTestSchema.stageRuns)
      .set({
        status: 'started',
        actualStartAt: startedAt,
        actualStartProvenance: 'live_observed',
        startedBy: ids.actor,
        version: 2,
      })
      .where(eq(productionTestSchema.stageRuns.id, sourceStages.washing));
    await database.db
      .update(productionTestSchema.productionOrderStageAttempts)
      .set({
        status: 'completed',
        completedAt: startedAt,
        completedBy: ids.actor,
      })
      .where(
        eq(
          productionTestSchema.productionOrderStageAttempts.stageRunId,
          sourceStages.sorting,
        ),
      );

    const exceptionProposalCommand: OrderRouteProposalCommand = {
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.sourceOrder,
      actorId: ids.actor,
      authorizedAction: 'production:stage',
      kind: 'exception',
      reason: 'rewash_required',
      restartStage: 'washing',
      note: '  Rewash verified.  ',
      expectedQueueVersion: 4,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 2,
    };
    const proposal = await proposalFor(exceptionProposalCommand);
    const command: CommitOrderRouteCommand = {
      ...exceptionProposalCommand,
      proposalHash: proposal.proposalHash,
      idempotencyKey: 'commit-order-route-exception-1',
    };
    const membershipId = '61000000-0000-4000-8000-000000000001';
    const attemptIds = [
      '61000000-0000-4000-8000-000000000002',
      '61000000-0000-4000-8000-000000000003',
      '61000000-0000-4000-8000-000000000004',
    ];
    const eventId = '61000000-0000-4000-8000-000000000005';

    await expect(
      makeExecute({
        ids: idSource(membershipId, ...attemptIds, eventId),
      })(command),
    ).resolves.toMatchObject({
      kind: 'success',
      value: {
        proposal: {
          kind: 'exception',
          restartStage: 'washing',
          releasedStages: ['washing', 'drying', 'folding_packaging'],
          assignedStages: ['washing', 'drying', 'folding_packaging'],
        },
        createdAttemptIds: attemptIds,
      },
    });

    const after = await state();
    expect(after.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: membershipId,
          placementProvenance: 'exception_route',
          pinnedAt: null,
          pinnedBy: null,
        }),
      ]),
    );
    const oldSorting = after.attempts.find(
      (attempt) =>
        attempt.stageRunId === sourceStages.sorting &&
        attempt.attemptNumber === 1,
    );
    expect(oldSorting).toMatchObject({ status: 'completed' });
    expect(
      after.attempts.filter((attempt) => attempt.status === 'released'),
    ).toHaveLength(3);
    expect(
      after.attempts
        .filter((attempt) => attemptIds.includes(attempt.id))
        .map((attempt) => attempt.metadata),
    ).toEqual([
      {
        sourceProductionBatchId: ids.sourceBatch,
        targetProductionBatchId: ids.targetBatch,
        note: 'Rewash verified.',
      },
      {
        sourceProductionBatchId: ids.sourceBatch,
        targetProductionBatchId: ids.targetBatch,
        note: 'Rewash verified.',
      },
      {
        sourceProductionBatchId: ids.sourceBatch,
        targetProductionBatchId: ids.targetBatch,
        note: 'Rewash verified.',
      },
    ]);
    expect(after.events).toHaveLength(1);
    expect(after.events[0]).toMatchObject({
      id: eventId,
      eventType: 'production_order_route_exception_recorded',
      payload: {
        reason: 'rewash_required',
        restartStage: 'washing',
        note: 'Rewash verified.',
        _idempotency: {
          command: {
            operation: 'production_order_route_exception_recorded',
            payload: { note: 'Rewash verified.' },
          },
        },
      },
    });
    expect(after.liveRevision).toBe(1);
  });

  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays the exact durable receipt, rejects divergent reuse, and emits no duplicate revision',
        proves: [
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const command = await queuedCommand();
          const statuses: string[] = [];
          const execute = makeExecute({
            ids: idSource(
              '62000000-0000-4000-8000-000000000001',
              '62000000-0000-4000-8000-000000000002',
              '62000000-0000-4000-8000-000000000003',
              '62000000-0000-4000-8000-000000000004',
              '62000000-0000-4000-8000-000000000005',
              '62000000-0000-4000-8000-000000000006',
            ),
            signals: {
              orderRouteOutcome: ({ status }) => statuses.push(status),
              queueConflict: () => undefined,
            },
          });

          const first = await execute(command);
          const replay = await execute(command);
          const divergent = await execute({
            ...command,
            proposalHash: 'f'.repeat(64),
          });

          expect(first).toMatchObject({
            kind: 'success',
            value: { replayed: false },
          });
          expect(replay).toMatchObject({
            kind: 'success',
            value: { replayed: true },
          });
          expect(divergent).toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          if (first.kind === 'success' && replay.kind === 'success')
            expect(replay.value).toEqual({ ...first.value, replayed: true });
          const after = await state();
          expect(after.events).toHaveLength(1);
          expect(after.liveRevision).toBe(1);
          expect(statuses).toEqual(['committed', 'replayed', 'conflict']);
          const envelope = (after.events[0]?.payload as JsonObject)[
            '_idempotency'
          ];
          expect(envelope).toMatchObject({ version: 1 });
        },
      },
    ],
  });

  it.each([
    {
      name: 'queue version',
      expectedCode: 'production_queue_version_conflict',
      command: { expectedQueueVersion: 3 },
    },
    {
      name: 'order version',
      expectedCode: 'production_order_version_conflict',
      command: { expectedOrderVersion: 2 },
    },
    {
      name: 'source batch version',
      expectedCode: 'production_batch_version_conflict',
      command: { expectedSourceBatchVersion: 1 },
    },
    {
      name: 'proposal hash',
      expectedCode: 'production_order_route_proposal_stale',
      command: { proposalHash: 'f'.repeat(64) },
    },
  ])('rejects a stale $name without durable mutation', async (candidate) => {
    await seed();
    const command = await queuedCommand(candidate.command);
    const before = await state();
    const queueConflict = vi.fn<CommitOrderRouteSignals['queueConflict']>();

    await expect(
      makeExecute({
        ids: idSource(),
        signals: {
          orderRouteOutcome: () => undefined,
          queueConflict,
        },
      })(command),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: candidate.expectedCode },
    });
    expect(await state()).toEqual(before);
    expect(queueConflict).toHaveBeenCalledTimes(
      candidate.expectedCode === 'production_queue_version_conflict' ? 1 : 0,
    );
  });

  it('fences the derived target version through the proposal hash and rejects semantic capacity loss', async () => {
    await seed();
    const versionCommand = await queuedCommand();
    await database.db
      .update(productionTestSchema.productionBatches)
      .set({ version: 6 })
      .where(eq(productionTestSchema.productionBatches.id, ids.targetBatch));
    const versionState = await state();
    await expect(
      makeExecute({ ids: idSource() })(versionCommand),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_route_proposal_stale' },
    });
    expect(await state()).toEqual(versionState);

    await database.reset();
    await seed();
    const capacityCommand = await queuedCommand();
    await database.db
      .update(productionTestSchema.machines)
      .set({ isActive: false })
      .where(
        inArray(productionTestSchema.machines.id, [ids.washer, ids.dryer]),
      );
    const capacityState = await state();
    const orderRouteOutcome =
      vi.fn<CommitOrderRouteSignals['orderRouteOutcome']>();
    await expect(
      makeExecute({
        ids: idSource(),
        signals: {
          orderRouteOutcome,
          queueConflict: () => undefined,
        },
      })(capacityCommand),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'validation',
        code: 'target_stage_graph_invalid',
      },
    });
    expect(await state()).toEqual(capacityState);
    expect(orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'commit',
      status: 'rejected',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes identical and different-key same-version races through the ordered lock graph',
        proves: ['same-key-concurrency', 'declared-concurrency-race'],
        run: async () => {
          await seed();
          const command = await queuedCommand();
          const identicalBarrier = firstReadBarrier();
          const identicalGate = gateFirstReplayRead(identicalBarrier);
          const identical = await Promise.all([
            makeExecute({
              ids: idSource(
                '63000000-0000-4000-8000-000000000001',
                '63000000-0000-4000-8000-000000000002',
                '63000000-0000-4000-8000-000000000003',
                '63000000-0000-4000-8000-000000000004',
                '63000000-0000-4000-8000-000000000005',
                '63000000-0000-4000-8000-000000000006',
              ),
              transformRepository: identicalGate,
            })(command),
            makeExecute({
              ids: idSource(
                '63100000-0000-4000-8000-000000000001',
                '63100000-0000-4000-8000-000000000002',
                '63100000-0000-4000-8000-000000000003',
                '63100000-0000-4000-8000-000000000004',
                '63100000-0000-4000-8000-000000000005',
                '63100000-0000-4000-8000-000000000006',
              ),
              transformRepository: identicalGate,
            })(command),
          ]);
          expect(identicalBarrier.arrivals()).toBe(2);
          expect(identical).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                kind: 'success',
                value: expect.objectContaining({ replayed: false }),
              }),
              expect.objectContaining({
                kind: 'success',
                value: expect.objectContaining({ replayed: true }),
              }),
            ]),
          );
          expect((await state()).events).toHaveLength(1);

          await database.reset();
          await seed();
          const raced = await queuedCommand();
          const differentBarrier = firstReadBarrier();
          const differentGate = gateFirstReplayRead(differentBarrier);
          const different = await Promise.all([
            makeExecute({
              ids: idSource(),
              transformRepository: differentGate,
            })({ ...raced, idempotencyKey: 'commit-order-route-race-a' }),
            makeExecute({
              ids: idSource(),
              transformRepository: differentGate,
            })({ ...raced, idempotencyKey: 'commit-order-route-race-b' }),
          ]);
          expect(differentBarrier.arrivals()).toBe(2);
          expect(
            different.filter(({ kind }) => kind === 'success'),
          ).toHaveLength(1);
          expect(different).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_queue_version_conflict',
              }),
            }),
          );
          const racedState = await state();
          expect(racedState.events).toHaveLength(1);
          expect(racedState.liveRevision).toBe(1);
        },
      },
    ],
  });

  it('detects divergent same-key reuse at the second replay checkpoint after both first reads miss', async () => {
    await seed();
    const command = await queuedCommand();
    const barrier = firstReadBarrier();
    const gate = gateFirstReplayRead(barrier);
    const statuses: string[] = [];
    const queueConflict = vi.fn<CommitOrderRouteSignals['queueConflict']>();
    const signals: CommitOrderRouteSignals = {
      orderRouteOutcome: ({ status }) => statuses.push(status),
      queueConflict,
    };

    const outcomes = await Promise.all([
      makeExecute({
        ids: idSource(
          '63200000-0000-4000-8000-000000000001',
          '63200000-0000-4000-8000-000000000002',
          '63200000-0000-4000-8000-000000000003',
          '63200000-0000-4000-8000-000000000004',
          '63200000-0000-4000-8000-000000000005',
          '63200000-0000-4000-8000-000000000006',
        ),
        transformRepository: gate,
        signals,
      })(command),
      makeExecute({
        ids: idSource(
          '63300000-0000-4000-8000-000000000001',
          '63300000-0000-4000-8000-000000000002',
          '63300000-0000-4000-8000-000000000003',
          '63300000-0000-4000-8000-000000000004',
          '63300000-0000-4000-8000-000000000005',
          '63300000-0000-4000-8000-000000000006',
        ),
        transformRepository: gate,
        signals,
      })({
        ...command,
        actorId: '10000000-0000-4000-8000-000000000099',
      }),
    ]);

    expect(barrier.arrivals()).toBe(2);
    expect(outcomes.filter(({ kind }) => kind === 'success')).toHaveLength(1);
    expect(outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'failure',
        failure: expect.objectContaining({
          code: 'production_idempotency_conflict',
        }),
      }),
    );
    const after = await state();
    expect(after.memberships).toHaveLength(2);
    expect(
      after.attempts.filter(({ status }) => status === 'released'),
    ).toHaveLength(4);
    expect(
      after.attempts.filter(({ status }) => status === 'assigned'),
    ).toHaveLength(4);
    expect(after.events).toHaveLength(1);
    expect(after.liveRevision).toBe(1);
    expect(statuses.slice().sort()).toEqual(['committed', 'conflict']);
    expect(queueConflict).not.toHaveBeenCalled();
  });

  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back the route graph when an assigned attempt loses its row CAS after context loading',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          const command = await queuedCommand();
          let expectedConcurrentState:
            | Awaited<ReturnType<typeof state>>
            | undefined;
          const orderRouteOutcome =
            vi.fn<CommitOrderRouteSignals['orderRouteOutcome']>();
          const queueConflict =
            vi.fn<CommitOrderRouteSignals['queueConflict']>();
          const transformRepository: RepositoryTransform = (native) => ({
            transaction: (work) =>
              native.transaction((repository) =>
                work({
                  ...repository,
                  commit: async (input) => {
                    const attemptId =
                      input.plan.attemptLifecycles[0]?.attemptId;
                    if (attemptId === undefined)
                      throw invariantViolationError({
                        code: 'commit_route_attempt_fixture_missing',
                        message:
                          'The attempt CAS fixture requires one attempt.',
                        safeMessage:
                          'The attempt CAS fixture requires one attempt.',
                      });
                    await database.db
                      .update(productionTestSchema.productionOrderStageAttempts)
                      .set({
                        status: 'completed',
                        completedAt: now,
                        completedBy: ids.actor,
                        updatedAt: now,
                      })
                      .where(
                        eq(
                          productionTestSchema.productionOrderStageAttempts.id,
                          attemptId,
                        ),
                      );
                    expectedConcurrentState = await state();
                    return repository.commit(input);
                  },
                }),
              ),
          });

          await expect(
            makeExecute({
              ids: idSource(),
              transformRepository,
              signals: { orderRouteOutcome, queueConflict },
            })(command),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              code: 'production_order_route_attempt_version_conflict',
            },
          });

          expect(expectedConcurrentState).toBeDefined();
          expect(await state()).toEqual(expectedConcurrentState);
          expect(expectedConcurrentState).toMatchObject({
            events: [],
            liveRevision: 0,
          });
          expect(orderRouteOutcome).toHaveBeenCalledWith({
            operation: 'commit',
            status: 'conflict',
            kind: 'queued_move',
            reason: 'manual_rebatch',
          });
          expect(queueConflict).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it.each([
    {
      name: 'membership CAS',
      expectedCode: 'production_order_route_membership_version_conflict',
      mutate: (input: CommitOrderRouteMutationInput) => ({
        ...input,
        context: {
          ...input.context,
          source: {
            ...input.context.source,
            membershipId: '64000000-0000-4000-8000-000000000099',
          },
        },
      }),
    },
    {
      name: 'source attempt fence',
      expectedCode: 'production_order_route_source_attempts_conflict',
      mutate: (input: CommitOrderRouteMutationInput) => ({
        ...input,
        plan: {
          ...input.plan,
          attemptLifecycles: input.plan.attemptLifecycles.slice(1),
        },
      }),
    },
    {
      name: 'source batch CAS',
      expectedCode: 'production_order_route_batch_version_conflict',
      mutate: (input: CommitOrderRouteMutationInput) => ({
        ...input,
        context: {
          ...input.context,
          source: {
            ...input.context.source,
            version: input.context.source.version + 100,
          },
        },
      }),
    },
    {
      name: 'target batch CAS',
      expectedCode: 'production_order_route_batch_version_conflict',
      mutate: (input: CommitOrderRouteMutationInput) => ({
        ...input,
        context: {
          ...input.context,
          candidates: input.context.candidates.map((candidate) =>
            candidate.productionBatchId ===
            input.plan.proposal.targetProductionBatchId
              ? { ...candidate, version: candidate.version + 100 }
              : candidate,
          ),
        },
      }),
    },
    {
      name: 'order CAS',
      expectedCode: 'production_order_route_order_version_conflict',
      mutate: (input: CommitOrderRouteMutationInput) => ({
        ...input,
        context: {
          ...input.context,
          order: {
            ...input.context.order,
            version: input.context.order.version + 100,
          },
        },
      }),
    },
    {
      name: 'queue CAS',
      expectedCode: 'production_order_route_queue_version_conflict',
      mutate: (input: CommitOrderRouteMutationInput) => ({
        ...input,
        context: {
          ...input.context,
          run: {
            ...input.context.run,
            queueVersion: input.context.run.queueVersion + 100,
          },
        },
      }),
    },
  ])(
    'rolls back the complete mutation graph after late $name loss',
    async (candidate) => {
      await seed();
      const command = await queuedCommand();
      const before = await state();
      const transformRepository: RepositoryTransform = (native) => ({
        transaction: (work) =>
          native.transaction((repository) =>
            work({
              ...repository,
              commit: (input) => repository.commit(candidate.mutate(input)),
            }),
          ),
      });

      await expect(
        makeExecute({
          ids: idSource(),
          transformRepository,
        })(command),
      ).resolves.toMatchObject({
        kind: 'failure',
        failure: { code: candidate.expectedCode },
      });
      expect(await state()).toEqual(before);
    },
  );

  it('rolls back memberships, attempts, versions, event receipt, and live revision when append fails', async () => {
    await seed();
    const collision = '65000000-0000-4000-8000-000000000006';
    await database.db.insert(productionTestSchema.workEvents).values({
      id: collision,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: collision,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'commit-route-event-collision-fixture',
      payload: {},
    });
    const command = await queuedCommand();
    const before = await state();

    await expect(
      makeExecute({
        ids: idSource(
          '65000000-0000-4000-8000-000000000001',
          '65000000-0000-4000-8000-000000000002',
          '65000000-0000-4000-8000-000000000003',
          '65000000-0000-4000-8000-000000000004',
          '65000000-0000-4000-8000-000000000005',
          collision,
        ),
      })(command),
    ).rejects.toMatchObject({
      code: 'production_order_route_failed',
      status: 503,
    });
    expect(await state()).toEqual(before);
  });
});
