import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderExactlyCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import type { IdSource } from '@pressly/cells/id-source';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  OnlinePlacementProposal,
  OnlinePlacementResult,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import {
  makeExecutePlaceOrderExactly,
  type ExecutePlaceOrderExactly,
  type PlaceOrderExactlyRepository,
  type PlaceOrderExactlySignals,
} from './execute.ts';
import {
  placeOrderExactlyIdempotency,
  type StoredPlaceOrderExactlyWorkEvent,
} from './idempotency.ts';
import { makePlaceOrderExactlyPostgresRepository } from './postgres.ts';
import type {
  PlaceOrderExactlyCommand,
  PlaceOrderExactlyMutationInput,
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

const locationId = 'exact-placement-location';
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
        [ids.sourceDemand, ids.sourceFulfillment, 'exact-source', 20],
        [ids.sourceAnchorDemand, ids.anchorFulfillment, 'exact-anchor', 10],
        [ids.targetDemand, ids.targetFulfillment, 'exact-target', 40],
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
      operationalStatus: id === ids.sourceOrder ? 'eligible' : 'scheduled',
      executionStatus: id === ids.sourceOrder ? 'unassigned' : 'scheduled',
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
    name: 'Exact Placement Facility',
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
  const inputSnapshot = {
    orders: [],
    machines: [
      {
        id: ids.washer,
        stationKind: 'washing',
        effectiveCapacityLbs: 100,
        active: true,
      },
      {
        id: ids.dryer,
        stationKind: 'drying',
        effectiveCapacityLbs: 100,
        active: true,
      },
    ],
    shift: {
      id: ids.shift,
      startsAt: now.toISOString(),
      endsAt: shiftEndsAt.toISOString(),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: ids.config,
      pulseMinutes: 60,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
    },
  };
  const outputPlan = {
    algorithmVersion: 'fixed-pulse-ffd-v2',
    inputSnapshotHash: 'a'.repeat(64),
    outputPlanHash: 'b'.repeat(64),
    canonicalOutput: '{}',
    pulseMinutes: 60,
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 480,
    plannedCompletionAt: shiftEndsAt.toISOString(),
    batches: [],
    unplacedOrderIds: [],
    warnings: [],
  };
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot,
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan,
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
      derivedWeightLbs: 10,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T16:00:00.000Z'),
      version: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
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

const placementStages = (base: string) =>
  stages.map((stage, index) => ({
    stage,
    startsAt: new Date(Date.parse(base) + index * 60 * 60_000).toISOString(),
    endsAt: new Date(
      Date.parse(base) + (index + 1) * 60 * 60_000,
    ).toISOString(),
    machineIds:
      stage === 'washing'
        ? [ids.washer]
        : stage === 'drying'
          ? [ids.dryer]
          : [],
  }));

const exactProposal = (
  input: {
    queueVersion?: number;
    hash?: string;
    overtimeMinutes?: number;
  } = {},
): OnlinePlacementProposal => ({
  kind: 'proposed',
  algorithmVersion: 'online-stable-insertion-v1',
  inputSnapshotHash: 'c'.repeat(64),
  placementPlanHash: input.hash ?? 'd'.repeat(64),
  canonicalPlacement: '{}',
  expectedQueueVersion: input.queueVersion ?? 4,
  target: {
    type: 'existing_batch',
    batchId: ids.targetBatch,
    sequence: 1,
  },
  affectedFromSequence: 1,
  affectedBatches: [
    {
      sourceBatchId: ids.targetBatch,
      sequence: 1,
      status: 'queued',
      membershipFrozen: false,
      orderIds: [ids.targetOrder, ids.sourceOrder],
      priorityOrderIds: [],
      derivedWeightLbs: 60,
      bagCount: 2,
      stages: placementStages('2026-08-21T18:00:00.000Z'),
      changed: true,
    },
  ],
  projectedCompletionAt: '2026-08-21T22:00:00.000Z',
  overtime: {
    required: (input.overtimeMinutes ?? 0) > 0,
    shiftEndsAt: shiftEndsAt.toISOString(),
    overrunMinutes: input.overtimeMinutes ?? 0,
  },
});

const command = (
  overrides: Partial<
    Pick<
      PlaceOrderExactlyCommand,
      'expectedQueueVersion' | 'expectedBatchVersion' | 'idempotencyKey'
    >
  > = {},
): PlaceOrderExactlyCommand => ({
  locationId,
  productionRunId: ids.run,
  productionBatchId: ids.targetBatch,
  productionOrderId: ids.sourceOrder,
  expectedQueueVersion: 4,
  expectedBatchVersion: 5,
  idempotencyKey: 'place-order-exact-postgres-1',
  actorId: ids.actor,
  authorizedAction: 'production:override',
  ...overrides,
});

const idSource = (...fixed: string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      fixed[index++] ??
      `60000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`,
  };
};

type RepositoryTransform = (
  repository: PlaceOrderExactlyRepository<StoredPlaceOrderExactlyWorkEvent>,
) => PlaceOrderExactlyRepository<StoredPlaceOrderExactlyWorkEvent>;

const makeExecute = (input: {
  ids: IdSource;
  proposed?: OnlinePlacementResult;
  proposeOnlinePlacement?: (input: unknown) => OnlinePlacementResult;
  transformRepository?: RepositoryTransform;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
  signals?: PlaceOrderExactlySignals;
}): ExecutePlaceOrderExactly => {
  const native = makePlaceOrderExactlyPostgresRepository(
    {
      db: database.db,
      ids: input.ids,
      ...(input.observeUnitOfWork === undefined
        ? {}
        : { observeUnitOfWork: input.observeUnitOfWork }),
    },
    productionTestSchema,
  );
  return makeExecutePlaceOrderExactly({
    repo: input.transformRepository?.(native) ?? native,
    idempotency: placeOrderExactlyIdempotency,
    policy: productionRules,
    proposeOnlinePlacement:
      input.proposeOnlinePlacement ?? (() => input.proposed ?? exactProposal()),
    clock: { now: () => now },
    ...(input.signals === undefined ? {} : { signals: input.signals }),
  });
};

const state = async () => {
  const [
    runs,
    orders,
    batches,
    memberships,
    stages,
    assignments,
    attempts,
    events,
    locations,
  ] = await Promise.all([
    database.db
      .select()
      .from(productionTestSchema.productionRuns)
      .orderBy(asc(productionTestSchema.productionRuns.id)),
    database.db
      .select()
      .from(productionTestSchema.productionOrders)
      .orderBy(asc(productionTestSchema.productionOrders.id)),
    database.db
      .select()
      .from(productionTestSchema.productionBatches)
      .orderBy(
        asc(productionTestSchema.productionBatches.sequenceIndex),
        asc(productionTestSchema.productionBatches.id),
      ),
    database.db
      .select()
      .from(productionTestSchema.productionBatchOrders)
      .orderBy(
        asc(productionTestSchema.productionBatchOrders.productionOrderId),
        asc(productionTestSchema.productionBatchOrders.id),
      ),
    database.db
      .select()
      .from(productionTestSchema.stageRuns)
      .orderBy(
        asc(productionTestSchema.stageRuns.plannedStartAt),
        asc(productionTestSchema.stageRuns.id),
      ),
    database.db
      .select()
      .from(productionTestSchema.stageMachineAssignments)
      .orderBy(
        asc(productionTestSchema.stageMachineAssignments.machineId),
        asc(productionTestSchema.stageMachineAssignments.id),
      ),
    database.db
      .select()
      .from(productionTestSchema.productionOrderStageAttempts)
      .orderBy(
        asc(
          productionTestSchema.productionOrderStageAttempts.productionOrderId,
        ),
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
    stages,
    assignments,
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

describe('place order exactly native PostgreSQL command', () => {
  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits one exact existing-target placement with complete state, receipt, revision, and post-commit signal',
        proves: ['postgres-commit'],
        run: async () => {
          await seed();
          const assignmentIds = [
            '60000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000002',
          ];
          const attemptIds = [
            '60000000-0000-4000-8000-000000000003',
            '60000000-0000-4000-8000-000000000004',
            '60000000-0000-4000-8000-000000000005',
            '60000000-0000-4000-8000-000000000006',
          ];
          const eventId = '60000000-0000-4000-8000-000000000007';
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
          const placementOutcome = vi.fn<
            PlaceOrderExactlySignals['placementOutcome']
          >(() => trace.push('signal:placement'));
          const queueConflict =
            vi.fn<PlaceOrderExactlySignals['queueConflict']>();
          const execute = makeExecute({
            ids: idSource(...assignmentIds, ...attemptIds, eventId),
            observeUnitOfWork,
            signals: { placementOutcome, queueConflict },
          });

          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
            value: {
              status: 'placed',
              mode: 'manager_exact',
              productionBatchId: ids.targetBatch,
              createdBatch: false,
              affectedBatchIds: [ids.targetBatch],
              queueVersion: 5,
              proposalHash: 'd'.repeat(64),
              replayed: false,
            },
          });
          const after = await state();
          expect(after.batches).toEqual([
            expect.objectContaining({
              id: ids.sourceBatch,
              derivedWeightLbs: 10,
              version: 2,
            }),
            expect.objectContaining({
              id: ids.targetBatch,
              sequenceIndex: 1,
              derivedWeightLbs: 60,
              version: 6,
              updatedAt: now,
            }),
          ]);
          expect(after.memberships).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                productionOrderId: ids.sourceAnchorOrder,
                placementProvenance: 'initial_schedule',
              }),
              expect.objectContaining({
                productionOrderId: ids.targetOrder,
                placementProvenance: 'initial_schedule',
              }),
              expect.objectContaining({
                productionBatchId: ids.targetBatch,
                productionOrderId: ids.sourceOrder,
                placementProvenance: 'manager_exact',
                placedAt: now,
                placedBy: ids.actor,
                pinnedAt: now,
                pinnedBy: ids.actor,
              }),
            ]),
          );
          expect(
            after.attempts
              .filter(
                (attempt) => attempt.productionOrderId === ids.sourceOrder,
              )
              .map((attempt) => attempt.id),
          ).toEqual(expect.arrayContaining(attemptIds));
          expect(
            after.attempts.filter(
              (attempt) => attempt.productionOrderId === ids.sourceOrder,
            ),
          ).toEqual(
            expect.arrayContaining(
              stages.map((stage) =>
                expect.objectContaining({
                  stageKind: stage,
                  attemptNumber: 1,
                  status: 'assigned',
                  assignmentReason: 'manager_exact',
                  assignedBy: ids.actor,
                }),
              ),
            ),
          );
          const arriving = after.orders.find(
            (order) => order.id === ids.sourceOrder,
          );
          expect(arriving).toMatchObject({
            operationalStatus: 'scheduled',
            executionStatus: 'scheduled',
            pendingPlacement: null,
            version: 4,
            updatedAt: now,
          });
          expect(after.runs[0]).toMatchObject({
            queueVersion: 5,
            plannedCompletionAt: new Date('2026-08-21T22:00:00.000Z'),
            overtimeProposalHash: null,
            overtimeQueueVersion: null,
          });
          expect(after.assignments.map((assignment) => assignment.id)).toEqual(
            expect.arrayContaining(assignmentIds),
          );
          expect(after.events).toHaveLength(1);
          expect(after.events[0]).toMatchObject({
            id: eventId,
            eventType: 'production_order_placement_resolved',
            entityType: 'production_order',
            entityId: ids.sourceOrder,
            actorId: ids.actor,
            expectedVersion: 4,
            idempotencyKey: command().idempotencyKey,
            payload: {
              productionRunId: ids.run,
              authorizedAction: 'production:override',
              mode: 'manager_exact',
              targetBatchId: ids.targetBatch,
              proposalHash: 'd'.repeat(64),
              queueVersion: 4,
              outcome: 'placed',
              _idempotency: {
                version: 1,
                command: {
                  operation: 'production_order_placed_exactly',
                  expectedVersion: 4,
                  payload: {
                    expectedQueueVersion: 4,
                    expectedBatchVersion: 5,
                    authorizedAction: 'production:override',
                    mode: 'manager_exact',
                    productionBatchId: ids.targetBatch,
                  },
                },
                result: {
                  status: 'placed',
                  queueVersion: 5,
                  proposalHash: 'd'.repeat(64),
                  replayed: false,
                },
              },
            },
          });
          expect(after.liveRevision).toBe(1);
          expect(trace).toEqual(['transaction:committed', 'signal:placement']);
          expect(queueConflict).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it('audits stale target version before proposal with durable pending state and queue signal', async () => {
    await seed();
    const proposeOnlinePlacement = vi.fn(() => exactProposal());
    const placementOutcome =
      vi.fn<PlaceOrderExactlySignals['placementOutcome']>();
    const queueConflict = vi.fn<PlaceOrderExactlySignals['queueConflict']>();
    const execute = makeExecute({
      ids: idSource('61000000-0000-4000-8000-000000000001'),
      proposeOnlinePlacement,
      signals: { placementOutcome, queueConflict },
    });

    await expect(
      execute(command({ expectedBatchVersion: 4 })),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'not_placed', reason: 'queue_conflict' },
    });
    expect(proposeOnlinePlacement).not.toHaveBeenCalled();
    const after = await state();
    expect(
      after.orders.find((order) => order.id === ids.sourceOrder),
    ).toMatchObject({
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      version: 3,
      pendingPlacement: {
        status: 'not_placed',
        mode: 'manager_exact',
        reason: 'queue_conflict',
        queueVersion: 4,
        preview: null,
      },
    });
    expect(after.events[0]).toMatchObject({
      eventType: 'production_order_placement_resolved',
      expectedVersion: null,
      payload: {
        proposalHash: null,
        outcome: 'not_placed',
      },
    });
    expect(after.liveRevision).toBe(1);
    expect(placementOutcome).toHaveBeenCalledWith({
      status: 'not_placed',
      mode: 'manager_exact',
      reason: 'queue_conflict',
    });
    expect(queueConflict).toHaveBeenCalledWith({
      operation: 'manager_exact_placement',
    });
  });

  it.each([
    {
      name: 'algorithm rejection',
      proposed: {
        kind: 'rejected' as const,
        algorithmVersion: 'online-stable-insertion-v1' as const,
        inputSnapshotHash: 'e'.repeat(64),
        reason: {
          code: 'TARGET_BATCH_CAPACITY_EXCEEDED',
          message: 'Exact placement cannot override hard pulse capacity.',
        },
      },
      status: 'not_placed',
      eventType: 'production_order_placement_resolved',
    },
    {
      name: 'overtime confirmation',
      proposed: exactProposal({ overtimeMinutes: 60 }),
      status: 'confirmation_required',
      eventType: 'production_order_placement_overtime_required',
    },
  ])('persists reload-safe $name without placing', async (candidate) => {
    await seed();
    const execute = makeExecute({
      ids: idSource('62000000-0000-4000-8000-000000000001'),
      proposed: candidate.proposed,
    });
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'success',
      value: { status: candidate.status },
    });
    const after = await state();
    expect(after.memberships).toHaveLength(2);
    expect(
      after.orders.find((order) => order.id === ids.sourceOrder),
    ).toMatchObject({
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      version: 3,
      pendingPlacement: expect.objectContaining({ status: candidate.status }),
    });
    expect(after.events[0]?.eventType).toBe(candidate.eventType);
    expect(after.liveRevision).toBe(1);
  });

  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays exact receipt and rejects divergent target version without duplicate state',
        proves: [
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const execute = makeExecute({ ids: idSource() });
          const first = await execute(command());
          const replay = await execute(command());
          const divergent = await execute(command({ expectedBatchVersion: 4 }));
          expect(first).toMatchObject({
            kind: 'success',
            value: { status: 'placed', replayed: false },
          });
          expect(replay).toMatchObject({
            kind: 'success',
            value: { status: 'placed', replayed: true },
          });
          expect(divergent).toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          const after = await state();
          expect(after.events).toHaveLength(1);
          expect(after.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes identical and different-key same-version races at the run lock',
        proves: ['same-key-concurrency', 'declared-concurrency-race'],
        run: async () => {
          await seed();
          const identicalBarrier = firstReadBarrier();
          const identical = await Promise.all([
            makeExecute({
              ids: idSource(),
              transformRepository: gateFirstReplayRead(identicalBarrier),
            })(command()),
            makeExecute({
              ids: idSource(),
              transformRepository: gateFirstReplayRead(identicalBarrier),
            })(command()),
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
          const differentBarrier = firstReadBarrier();
          const different = await Promise.all([
            makeExecute({
              ids: idSource(),
              transformRepository: gateFirstReplayRead(differentBarrier),
            })(command({ idempotencyKey: 'place-exact-race-a' })),
            makeExecute({
              ids: idSource(),
              transformRepository: gateFirstReplayRead(differentBarrier),
            })(command({ idempotencyKey: 'place-exact-race-b' })),
          ]);
          expect(differentBarrier.arrivals()).toBe(2);
          expect(different).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                kind: 'success',
                value: expect.objectContaining({ status: 'placed' }),
              }),
              expect.objectContaining({
                kind: 'success',
                value: expect.objectContaining({
                  status: 'not_placed',
                  reason: 'queue_conflict',
                }),
              }),
            ]),
          );
          const raced = await state();
          expect(raced.events).toHaveLength(2);
          expect(raced.liveRevision).toBe(2);
        },
      },
    ],
  });

  it.each([
    {
      name: 'derived order CAS',
      expectedCode: 'production_placement_order_version_conflict',
      mutate: (input: PlaceOrderExactlyMutationInput) => ({
        ...input,
        plan: {
          ...input.plan,
          orderLifecycle: {
            ...input.plan.orderLifecycle,
            expectedVersion: input.plan.orderLifecycle.expectedVersion + 100,
          },
        },
      }),
    },
    {
      name: 'queue CAS',
      expectedCode: 'production_placement_queue_version_conflict',
      mutate: (input: PlaceOrderExactlyMutationInput) => ({
        ...input,
        context: {
          ...input.context,
          input: {
            ...input.context.input,
            run: {
              ...input.context.input.run,
              queueVersion: input.context.input.run.queueVersion + 100,
            },
          },
        },
      }),
    },
  ])(
    'rolls back every partial mutation after late $name loss',
    async (candidate) => {
      await seed();
      const before = await state();
      const transformRepository: RepositoryTransform = (native) => ({
        ...native,
        transaction: (work) =>
          native.transaction((repository) =>
            work({
              ...repository,
              commitPlacement: (input) =>
                repository.commitPlacement(candidate.mutate(input)),
            }),
          ),
      });
      await expect(
        makeExecute({ ids: idSource(), transformRepository })(command()),
      ).resolves.toMatchObject({
        kind: 'failure',
        failure: { code: candidate.expectedCode },
      });
      expect(await state()).toEqual(before);
    },
  );

  proveOperation({
    operationId: 'production.place-order-exactly.v1',
    declaration: placeOrderExactlyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back placement mutations and receipt revision when event append fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          const collision = '65000000-0000-4000-8000-000000000007';
          await database.db.insert(productionTestSchema.workEvents).values({
            id: collision,
            locationId,
            eventType: 'fixture',
            entityType: 'fixture',
            entityId: collision,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'place-exact-event-collision-fixture',
            payload: {},
          });
          const before = await state();
          await expect(
            makeExecute({
              ids: idSource(
                '65000000-0000-4000-8000-000000000001',
                '65000000-0000-4000-8000-000000000002',
                '65000000-0000-4000-8000-000000000003',
                '65000000-0000-4000-8000-000000000004',
                '65000000-0000-4000-8000-000000000005',
                '65000000-0000-4000-8000-000000000006',
                collision,
              ),
            })(command()),
          ).rejects.toMatchObject({
            code: 'production_order_placement_failed',
            status: 503,
          });
          expect(await state()).toEqual(before);
        },
      },
    ],
  });

  it('rolls back pending audit and revision when its receipt append fails', async () => {
    await seed();
    const collision = '66000000-0000-4000-8000-000000000001';
    await database.db.insert(productionTestSchema.workEvents).values({
      id: collision,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: collision,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'place-exact-audit-collision-fixture',
      payload: {},
    });
    const before = await state();
    await expect(
      makeExecute({ ids: idSource(collision) })(
        command({ expectedBatchVersion: 4 }),
      ),
    ).rejects.toMatchObject({
      code: 'production_order_placement_failed',
      status: 503,
    });
    expect(await state()).toEqual(before);
  });
});
