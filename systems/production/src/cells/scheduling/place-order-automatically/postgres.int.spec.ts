import { proveOperation } from '@pressly/testkit/operation-proof';
import { placeOrderAutomaticallyCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq, sql } from '@pressly/postgres/query';
import {
  createPostgresRuntime,
  type PostgresTransaction,
} from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import * as result from '@pressly/cells/result';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
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
  ProposeOnlinePlacement,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import {
  makeExecutePlaceOrderAutomatically,
  type ExecutePlaceOrderAutomatically,
  type PlaceOrderAutomaticallyRepository,
  type PlaceOrderAutomaticallySignals,
} from './execute.ts';
import {
  placeOrderAutomaticallyIdempotency,
  type StoredPlaceOrderAutomaticallyWorkEvent,
} from './idempotency.ts';
import { makePlaceOrderAutomaticallyPostgresRepository } from './postgres.ts';
import type {
  PlaceOrderAutomaticallyPolicy,
  PlaceProductionOrderAutomaticallyCommand,
} from './types.ts';

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
    'scheduler_configs',
    'production_machines',
    'production_stations',
    'production_orders',
    'production_shifts',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 12,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: productionTestSchema,
  maxConnections: 1,
});

const ids = {
  actor: '56000000-0000-4000-8000-000000000001',
  shift: '56000000-0000-4000-8000-000000000002',
  config: '56000000-0000-4000-8000-000000000003',
  schedule: '56000000-0000-4000-8000-000000000004',
  run: '56000000-0000-4000-8000-000000000005',
  frozenBatch: '56000000-0000-4000-8000-000000000006',
  mutableBatch: '56000000-0000-4000-8000-000000000007',
  frozenOrder: '56000000-0000-4000-8000-000000000008',
  queuedOrder: '56000000-0000-4000-8000-000000000009',
  arrivingOrderA: '56000000-0000-4000-8000-000000000010',
  arrivingOrderB: '56000000-0000-4000-8000-000000000011',
  frozenDemand: '56000000-0000-4000-8000-000000000012',
  queuedDemand: '56000000-0000-4000-8000-000000000013',
  arrivingDemandA: '56000000-0000-4000-8000-000000000014',
  arrivingDemandB: '56000000-0000-4000-8000-000000000015',
  frozenFulfillment: '56000000-0000-4000-8000-000000000020',
  queuedFulfillment: '56000000-0000-4000-8000-000000000021',
  arrivingFulfillmentA: '56000000-0000-4000-8000-000000000022',
  arrivingFulfillmentB: '56000000-0000-4000-8000-000000000023',
  sortingStation: '56000000-0000-4000-8000-000000000024',
  washingStation: '56000000-0000-4000-8000-000000000025',
  dryingStation: '56000000-0000-4000-8000-000000000026',
  foldingStation: '56000000-0000-4000-8000-000000000027',
  washer: '56000000-0000-4000-8000-000000000028',
  dryer: '56000000-0000-4000-8000-000000000029',
  frozenStage: '56000000-0000-4000-8000-000000000030',
  mutableSorting: '56000000-0000-4000-8000-000000000031',
  mutableWashing: '56000000-0000-4000-8000-000000000032',
  mutableDrying: '56000000-0000-4000-8000-000000000033',
  mutableFolding: '56000000-0000-4000-8000-000000000034',
  collisionEvent: '56000000-0000-4000-8000-000000000035',
} as const;

const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'automatic-placement-location';
const startsAt = new Date('2026-08-22T13:00:00.000Z');
const shiftEndsAt = new Date('2026-08-22T22:00:00.000Z');
const now = new Date('2026-08-22T15:00:00.000Z');
const pulseMinutes = 56;
const stageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

type RowLockBlocker = Readonly<{
  release: () => void;
  done: Promise<void>;
}>;

const holdRowLock = async (
  acquire: (transaction: PostgresTransaction) => Promise<unknown>,
): Promise<RowLockBlocker> => {
  let signalReady: () => void = () => undefined;
  let signalRelease: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const done = database.db.transaction(async (transaction) => {
    await acquire(transaction);
    signalReady();
    await released;
  });
  await ready;
  return { release: signalRelease, done };
};

const waitForBlockedRowLock = async (): Promise<boolean> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await database.db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_locks where locktype = 'transactionid' and granted = false`,
    );
    if ((row?.waiting ?? 0) > 0) return true;
    await delay(10);
  }
  return false;
};

const removeFaults = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists place_automatic_reject_stage on stage_runs`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists place_automatic_reject_order on production_orders`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists place_automatic_reject_run on production_runs`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists place_automatic_reject_stage_update()`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists place_automatic_reject_order_update()`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists place_automatic_reject_run_update()`,
  );
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
beforeEach(async () => {
  await removeFaults();
  await database.reset();
});
afterAll(async () => {
  await removeFaults();
  await database.close();
  await faultDatabase.close();
});

const stageProjection = (sequence: number) =>
  stageKinds.map((stage, index) => {
    const stageStartsAt = new Date(
      startsAt.getTime() + (sequence + index) * pulseMinutes * 60_000,
    );
    return {
      stage,
      startsAt: stageStartsAt.toISOString(),
      endsAt: new Date(
        stageStartsAt.getTime() + pulseMinutes * 60_000,
      ).toISOString(),
      machineIds:
        stage === 'washing'
          ? [ids.washer]
          : stage === 'drying'
            ? [ids.dryer]
            : [],
    };
  });

const stationId = (stage: (typeof stageKinds)[number]) =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const seedOrderAuthorities = async (): Promise<void> => {
  const demands = [
    [ids.frozenDemand, ids.frozenFulfillment, 'auto-frozen', 50],
    [ids.queuedDemand, ids.queuedFulfillment, 'auto-queued', 40],
    [ids.arrivingDemandA, ids.arrivingFulfillmentA, 'auto-arriving-a', 20],
    [ids.arrivingDemandB, ids.arrivingFulfillmentB, 'auto-arriving-b', 20],
  ] as const;
  await database.db.insert(productionTestSchema.orderDemands).values(
    demands.map(([id, fulfillmentId, displayReference, weight]) => ({
      id,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference,
      locationId,
      revisionAt: startsAt,
      phase: 'production_released',
      estimatedWeightLbs: weight,
      estimatedWeightSource: 'test_estimate',
      dueAt: shiftEndsAt,
    })),
  );
  await database.db.insert(productionTestSchema.productionOrders).values([
    {
      id: ids.frozenOrder,
      orderDemandId: ids.frozenDemand,
      locationId,
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: 50,
      bagCount: 2,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
    },
    {
      id: ids.queuedOrder,
      orderDemandId: ids.queuedDemand,
      locationId,
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: 40,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
    },
    ...[
      [ids.arrivingOrderA, ids.arrivingDemandA],
      [ids.arrivingOrderB, ids.arrivingDemandB],
    ].map(([id, orderDemandId]) => ({
      id: id!,
      orderDemandId: orderDemandId!,
      locationId,
      dueAt: shiftEndsAt,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      resolutionState: 'open',
      derivedWeightLbs: 20,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
    })),
  ]);
};

const seed = async (input: { queueVersion?: number } = {}): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Automatic Placement Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt,
    endsAt: shiftEndsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.stations).values(
    stageKinds.map((kind, index) => ({
      id: stationId(kind),
      locationId,
      kind,
      label: kind,
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
    pulseMinutes,
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
  const scheduleInput = {
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
      startsAt: startsAt.toISOString(),
      endsAt: shiftEndsAt.toISOString(),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: ids.config,
      pulseMinutes,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
    },
  };
  const scheduleOutput = {
    algorithmVersion: 'fixed-pulse-ffd-v2',
    inputSnapshotHash: 'a'.repeat(64),
    outputPlanHash: 'b'.repeat(64),
    canonicalOutput: '{}',
    pulseMinutes,
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 336,
    plannedCompletionAt: '2026-08-22T18:40:00.000Z',
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
    inputSnapshot: scheduleInput,
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: scheduleOutput,
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 336,
    plannedCompletionAt: new Date(scheduleOutput.plannedCompletionAt),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: startsAt,
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: startsAt,
    queueVersion: input.queueVersion ?? 1,
    plannedCompletionAt: new Date(scheduleOutput.plannedCompletionAt),
    version: 1,
  });
  await seedOrderAuthorities();
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: ids.frozenBatch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'sorting',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 50,
      pulseMinutes,
      plannedDoneAt: new Date(stageProjection(0).at(-1)!.endsAt),
      startedAt: startsAt,
      membershipFrozenAt: startsAt,
      membershipFrozenBy: ids.actor,
      version: 2,
    },
    {
      id: ids.mutableBatch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 40,
      pulseMinutes,
      plannedDoneAt: new Date(stageProjection(1).at(-1)!.endsAt),
      version: 1,
    },
  ]);
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
    {
      locationId,
      productionBatchId: ids.frozenBatch,
      productionOrderId: ids.frozenOrder,
      active: true,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: ids.mutableBatch,
      productionOrderId: ids.queuedOrder,
      active: true,
      placementProvenance: 'initial_schedule',
    },
  ]);
  await database.db.insert(productionTestSchema.stageRuns).values({
    id: ids.frozenStage,
    locationId,
    productionBatchId: ids.frozenBatch,
    stationId: ids.sortingStation,
    stageKind: 'sorting',
    status: 'started',
    plannedStartAt: new Date(stageProjection(0)[0]!.startsAt),
    plannedEndAt: new Date(stageProjection(0)[0]!.endsAt),
    actualStartAt: startsAt,
    actualStartProvenance: 'live_observed',
    startedBy: ids.actor,
    version: 2,
  });
  const mutableStageIds = [
    ids.mutableSorting,
    ids.mutableWashing,
    ids.mutableDrying,
    ids.mutableFolding,
  ];
  const mutableStages = stageProjection(1);
  await database.db.insert(productionTestSchema.stageRuns).values(
    mutableStages.map((stage, index) => ({
      id: mutableStageIds[index]!,
      locationId,
      productionBatchId: ids.mutableBatch,
      stationId: stationId(stage.stage),
      stageKind: stage.stage,
      status: 'planned',
      plannedStartAt: new Date(stage.startsAt),
      plannedEndAt: new Date(stage.endsAt),
      version: 1,
    })),
  );
  await database.db.insert(productionTestSchema.stageMachineAssignments).values(
    mutableStages.flatMap((stage, index) =>
      stage.machineIds.map((machineId) => ({
        locationId,
        stageRunId: mutableStageIds[index]!,
        machineId,
        plannedStartAt: new Date(stage.startsAt),
        plannedEndAt: new Date(stage.endsAt),
        status: 'planned',
      })),
    ),
  );
};

const command = (
  input: Partial<PlaceProductionOrderAutomaticallyCommand> = {},
): PlaceProductionOrderAutomaticallyCommand => ({
  locationId,
  productionRunId: ids.run,
  productionOrderId: ids.arrivingOrderA,
  expectedQueueVersion: 1,
  idempotencyKey: 'place-automatic-postgres-1',
  actorId: ids.actor,
  authorizedAction: 'production:override',
  ...input,
});

const proposal = (
  input: {
    orderId?: string;
    queueVersion?: number;
    target?: 'existing' | 'new';
    overtimeMinutes?: number;
  } = {},
): OnlinePlacementProposal => {
  const orderId = input.orderId ?? ids.arrivingOrderA;
  const queueVersion = input.queueVersion ?? 1;
  const target = input.target ?? 'existing';
  const overtimeMinutes = input.overtimeMinutes ?? 0;
  const existingProjection = {
    sourceBatchId: ids.mutableBatch,
    sequence: 1,
    status: 'queued' as const,
    membershipFrozen: false,
    orderIds:
      target === 'existing' ? [ids.queuedOrder, orderId] : [ids.queuedOrder],
    priorityOrderIds: [],
    derivedWeightLbs: target === 'existing' ? 60 : 40,
    bagCount: target === 'existing' ? 2 : 1,
    stages: stageProjection(1),
    changed: target === 'existing',
  };
  return {
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'c'.repeat(64),
    placementPlanHash: `${target === 'new' ? 'd' : 'e'}`.repeat(64),
    canonicalPlacement: '{}',
    expectedQueueVersion: queueVersion,
    target:
      target === 'existing'
        ? {
            type: 'existing_batch',
            batchId: ids.mutableBatch,
            sequence: 1,
          }
        : { type: 'new_batch', insertAtSequence: 2 },
    affectedFromSequence: target === 'existing' ? 1 : 2,
    affectedBatches:
      target === 'existing'
        ? [existingProjection]
        : [
            {
              sourceBatchId: null,
              sequence: 2,
              status: 'queued',
              membershipFrozen: false,
              orderIds: [orderId],
              priorityOrderIds: [],
              derivedWeightLbs: 20,
              bagCount: 1,
              stages: stageProjection(2),
              changed: true,
            },
          ],
    projectedCompletionAt:
      overtimeMinutes > 0
        ? '2026-08-22T22:15:00.000Z'
        : target === 'new'
          ? stageProjection(2).at(-1)!.endsAt
          : stageProjection(1).at(-1)!.endsAt,
    overtime: {
      required: overtimeMinutes > 0,
      shiftEndsAt: shiftEndsAt.toISOString(),
      overrunMinutes: overtimeMinutes,
    },
  };
};

const sequenceIds = (prefix: string): IdSource => {
  let index = 0;
  return {
    next: () => {
      index += 1;
      return `${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`;
    },
  };
};

type TransactionObservation = 'err' | 'ok' | 'threw';
const observer =
  (
    observations: TransactionObservation[],
    timing: string[] = [],
  ): ProductionResultUnitOfWorkObserver =>
  (unitOfWork) => ({
    transaction: async (work) => {
      try {
        const outcome = await unitOfWork.transaction(work);
        observations.push(outcome.tag);
        timing.push(`transaction:${outcome.tag}`);
        return outcome;
      } catch (error) {
        observations.push('threw');
        timing.push('transaction:threw');
        throw error;
      }
    },
  });

const makeExecute = (
  input: {
    propose?: ProposeOnlinePlacement;
    source?: IdSource;
    signals?: PlaceOrderAutomaticallySignals;
    observations?: TransactionObservation[];
    timing?: string[];
    policy?: PlaceOrderAutomaticallyPolicy;
    repository?: PlaceOrderAutomaticallyRepository<StoredPlaceOrderAutomaticallyWorkEvent>;
  } = {},
): ExecutePlaceOrderAutomatically => {
  const repository =
    input.repository ??
    makePlaceOrderAutomaticallyPostgresRepository(
      {
        db: database.db,
        ids: input.source ?? sequenceIds('57000000'),
        ...(input.observations === undefined
          ? {}
          : {
              observeUnitOfWork: observer(
                input.observations,
                input.timing ?? [],
              ),
            }),
      },
      productionTestSchema,
    );
  return makeExecutePlaceOrderAutomatically({
    repo: repository,
    idempotency: placeOrderAutomaticallyIdempotency,
    policy: input.policy ?? productionRules,
    proposeOnlinePlacement: input.propose ?? (() => proposal()),
    clock: { now: () => new Date(now) },
    ...(input.signals === undefined ? {} : { signals: input.signals }),
  });
};

const readLiveRevision = async (): Promise<number> => {
  const [location] = await database.db
    .select({
      liveRevision: productionTestSchema.productionLocations.liveRevision,
    })
    .from(productionTestSchema.productionLocations)
    .where(eq(productionTestSchema.productionLocations.id, locationId));
  return location?.liveRevision ?? -1;
};

const readMutationGraph = async () => ({
  runs: await database.db
    .select()
    .from(productionTestSchema.productionRuns)
    .orderBy(asc(productionTestSchema.productionRuns.id)),
  orders: await database.db
    .select()
    .from(productionTestSchema.productionOrders)
    .orderBy(asc(productionTestSchema.productionOrders.id)),
  batches: await database.db
    .select()
    .from(productionTestSchema.productionBatches)
    .orderBy(asc(productionTestSchema.productionBatches.sequenceIndex)),
  memberships: await database.db
    .select()
    .from(productionTestSchema.productionBatchOrders)
    .orderBy(asc(productionTestSchema.productionBatchOrders.productionOrderId)),
  stages: await database.db
    .select()
    .from(productionTestSchema.stageRuns)
    .orderBy(
      asc(productionTestSchema.stageRuns.productionBatchId),
      asc(productionTestSchema.stageRuns.plannedStartAt),
    ),
  assignments: await database.db
    .select()
    .from(productionTestSchema.stageMachineAssignments)
    .orderBy(asc(productionTestSchema.stageMachineAssignments.stageRunId)),
  attempts: await database.db
    .select()
    .from(productionTestSchema.productionOrderStageAttempts)
    .orderBy(asc(productionTestSchema.productionOrderStageAttempts.stageKind)),
  events: await database.db
    .select()
    .from(productionTestSchema.workEvents)
    .orderBy(asc(productionTestSchema.workEvents.createdAt)),
});

const arrivingOrder = (
  graph: Awaited<ReturnType<typeof readMutationGraph>>,
  orderId = ids.arrivingOrderA,
) => graph.orders.find((order) => order.id === orderId);

const installCasFault = async (
  kind: 'order' | 'run' | 'stage',
): Promise<void> => {
  if (kind === 'stage') {
    await faultDatabase.db.execute(
      sql`create function place_automatic_reject_stage_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await faultDatabase.db.execute(
      sql`create trigger place_automatic_reject_stage before update on stage_runs for each row execute function place_automatic_reject_stage_update()`,
    );
    return;
  }
  if (kind === 'order') {
    await faultDatabase.db.execute(
      sql`create function place_automatic_reject_order_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await faultDatabase.db.execute(
      sql`create trigger place_automatic_reject_order before update on production_orders for each row execute function place_automatic_reject_order_update()`,
    );
    return;
  }
  await faultDatabase.db.execute(
    sql`create function place_automatic_reject_run_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  await faultDatabase.db.execute(
    sql`create trigger place_automatic_reject_run before update on production_runs for each row execute function place_automatic_reject_run_update()`,
  );
};

describe('place-order-automatically native PostgreSQL cell', () => {
  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_order_execution_event_not_allowed without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          await database.db
            .update(productionTestSchema.productionOrders)
            .set({ executionStatus: 'scheduled' })
            .where(
              eq(productionTestSchema.productionOrders.id, ids.arrivingOrderA),
            );
          const before = await readMutationGraph();
          await expect(
            makeExecute()(
              command({ idempotencyKey: 'place-event-not-allowed' }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_event_not_allowed',
            },
          });
          expect(await readMutationGraph()).toEqual(before);
        },
      },
      {
        name: 'rejects production_order_execution_state_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const before = await readMutationGraph();
          const execute = makeExecute({
            policy: {
              ...productionRules,
              resolveProductionOrderExecutionState: () =>
                result.err({
                  code: 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
                  message: 'The production order execution state is invalid.',
                }),
            },
          });
          await expect(
            execute(command({ idempotencyKey: 'place-state-invalid' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_state_invalid',
            },
          });
          expect(await readMutationGraph()).toEqual(before);
        },
      },
      {
        name: 'commits the complete existing-batch graph, audits once, replays, and rejects divergence',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const observations: TransactionObservation[] = [];
          const timing: string[] = [];
          const placementOutcome = vi.fn(() => timing.push('signal:placement'));
          const queueConflict = vi.fn(() => timing.push('signal:queue'));
          const candidate = proposal();
          const proposeOnlinePlacement = vi.fn(() => candidate);
          const execute = makeExecute({
            propose: proposeOnlinePlacement,
            observations,
            timing,
            signals: { placementOutcome, queueConflict },
          });
          const input = command();

          await expect(execute(input)).resolves.toMatchObject({
            kind: 'success',
            value: {
              status: 'placed',
              mode: 'automatic',
              productionBatchId: ids.mutableBatch,
              createdBatch: false,
              affectedBatchIds: [ids.mutableBatch],
              queueVersion: 2,
              replayed: false,
            },
          });
          await expect(execute(input)).resolves.toMatchObject({
            kind: 'success',
            value: { status: 'placed', queueVersion: 2, replayed: true },
          });
          await expect(
            execute(command({ expectedQueueVersion: 2 })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });

          const graph = await readMutationGraph();
          expect(observations).toEqual(['ok', 'ok', 'err']);
          expect(timing.indexOf('signal:placement')).toBeGreaterThan(
            timing.indexOf('transaction:ok'),
          );
          expect(placementOutcome).toHaveBeenCalledOnce();
          expect(queueConflict).not.toHaveBeenCalled();
          expect(proposeOnlinePlacement).toHaveBeenCalledWith(
            expect.objectContaining({
              mode: { type: 'automatic' },
              machines: [
                expect.objectContaining({
                  id: ids.washer,
                  stationKind: 'washing',
                }),
                expect.objectContaining({
                  id: ids.dryer,
                  stationKind: 'drying',
                }),
              ],
              batches: [
                expect.objectContaining({
                  id: ids.frozenBatch,
                  sequence: 0,
                  status: 'sorting',
                  membershipFrozen: true,
                  orderIds: [ids.frozenOrder],
                  stages: [expect.objectContaining({ stage: 'sorting' })],
                }),
                expect.objectContaining({
                  id: ids.mutableBatch,
                  sequence: 1,
                  status: 'queued',
                  membershipFrozen: false,
                  orderIds: [ids.queuedOrder],
                  stages: expect.arrayContaining([
                    expect.objectContaining({
                      stage: 'washing',
                      machineIds: [ids.washer],
                    }),
                    expect.objectContaining({
                      stage: 'drying',
                      machineIds: [ids.dryer],
                    }),
                  ]),
                }),
              ],
            }),
          );
          expect(graph.runs[0]).toMatchObject({
            id: ids.run,
            queueVersion: 2,
            overtimeProposalHash: null,
          });
          expect(graph.runs[0]?.plannedCompletionAt.toISOString()).toBe(
            candidate.projectedCompletionAt,
          );
          expect(arrivingOrder(graph)).toMatchObject({
            operationalStatus: 'scheduled',
            executionStatus: 'scheduled',
            pendingPlacement: null,
            version: 2,
          });
          expect(graph.batches).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: ids.frozenBatch,
                sequenceIndex: 0,
                status: 'sorting',
                derivedWeightLbs: 50,
                version: 2,
              }),
              expect.objectContaining({
                id: ids.mutableBatch,
                sequenceIndex: 1,
                status: 'queued',
                derivedWeightLbs: 60,
                version: 2,
              }),
            ]),
          );
          expect(graph.memberships).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                productionBatchId: ids.frozenBatch,
                productionOrderId: ids.frozenOrder,
                placementProvenance: 'initial_schedule',
              }),
              expect.objectContaining({
                productionBatchId: ids.mutableBatch,
                productionOrderId: ids.queuedOrder,
                placementProvenance: 'initial_schedule',
              }),
              expect.objectContaining({
                productionBatchId: ids.mutableBatch,
                productionOrderId: ids.arrivingOrderA,
                placementProvenance: 'automatic',
                placedBy: ids.actor,
                pinnedAt: null,
                pinnedBy: null,
              }),
            ]),
          );
          expect(
            graph.stages.filter((stage) => stage.id === ids.frozenStage),
          ).toEqual([
            expect.objectContaining({ status: 'started', version: 2 }),
          ]);
          expect(
            graph.stages.filter(
              (stage) => stage.productionBatchId === ids.mutableBatch,
            ),
          ).toHaveLength(4);
          expect(
            graph.stages
              .filter((stage) => stage.productionBatchId === ids.mutableBatch)
              .map((stage) => stage.version),
          ).toEqual([2, 2, 2, 2]);
          expect(graph.assignments).toHaveLength(2);
          expect(graph.attempts).toHaveLength(4);
          expect(graph.attempts).toEqual(
            expect.arrayContaining(
              stageKinds.map((stageKind) =>
                expect.objectContaining({
                  productionOrderId: ids.arrivingOrderA,
                  stageKind,
                  attemptNumber: 1,
                  status: 'assigned',
                  assignmentReason: 'automatic',
                  assignedBy: ids.actor,
                }),
              ),
            ),
          );
          expect(graph.events).toEqual([
            expect.objectContaining({
              eventType: 'production_order_placement_resolved',
              entityType: 'production_order',
              entityId: ids.arrivingOrderA,
              actorId: ids.actor,
              expectedVersion: 1,
              idempotencyKey: input.idempotencyKey,
              payload: expect.objectContaining({
                productionRunId: ids.run,
                authorizedAction: 'production:override',
                mode: 'automatic',
                targetBatchId: null,
                proposalHash: candidate.placementPlanHash,
                queueVersion: 1,
                outcome: 'placed',
                _idempotency: {
                  version: 1,
                  command: {
                    operation: 'production_order_placed_automatically',
                    locationId,
                    actorId: ids.actor,
                    target: {
                      entityType: 'production_order',
                      entityId: ids.arrivingOrderA,
                    },
                    expectedVersion: 1,
                    payload: {
                      expectedQueueVersion: 1,
                      authorizedAction: 'production:override',
                      mode: 'automatic',
                    },
                  },
                  result: expect.objectContaining({
                    status: 'placed',
                    queueVersion: 2,
                    replayed: false,
                  }),
                },
              }),
            }),
          ]);
          expect(await readLiveRevision()).toBe(1);
        },
      },
    ],
  });

  it('materializes an appended new target without moving existing orders', async () => {
    await seed();
    const candidate = proposal({ target: 'new' });
    const execute = makeExecute({
      propose: () => candidate,
      source: sequenceIds('58000000'),
    });
    const outcome = await execute(command({ idempotencyKey: 'place-new-1' }));
    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        status: 'placed',
        createdBatch: true,
        queueVersion: 2,
        affectedBatchIds: expect.any(Array),
      },
    });
    if (outcome.kind !== 'success' || outcome.value.status !== 'placed') return;
    const graph = await readMutationGraph();
    const newBatchId = outcome.value.productionBatchId;
    expect(outcome.value.affectedBatchIds).toEqual([newBatchId]);
    expect(graph.batches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids.frozenBatch,
          sequenceIndex: 0,
          derivedWeightLbs: 50,
          version: 2,
        }),
        expect.objectContaining({
          id: newBatchId,
          sequenceIndex: 2,
          status: 'queued',
          derivedWeightLbs: 20,
          version: 1,
        }),
        expect.objectContaining({
          id: ids.mutableBatch,
          sequenceIndex: 1,
          derivedWeightLbs: 40,
          version: 1,
        }),
      ]),
    );
    expect(
      graph.memberships.find(
        (membership) => membership.productionOrderId === ids.queuedOrder,
      ),
    ).toMatchObject({ productionBatchId: ids.mutableBatch, active: true });
    expect(
      graph.memberships.find(
        (membership) => membership.productionOrderId === ids.arrivingOrderA,
      ),
    ).toMatchObject({
      productionBatchId: newBatchId,
      placementProvenance: 'automatic',
    });
    expect(
      graph.stages.filter((stage) => stage.productionBatchId === newBatchId),
    ).toHaveLength(4);
    expect(
      graph.stages.filter(
        (stage) => stage.productionBatchId === ids.mutableBatch,
      ),
    ).toHaveLength(4);
    expect(graph.assignments).toHaveLength(4);
    expect(graph.attempts).toHaveLength(4);
    expect(graph.events).toHaveLength(1);
  });

  it('persists rejected and overtime outcomes without mutating the queue graph', async () => {
    await seed();
    const before = await readMutationGraph();
    const placementOutcome = vi.fn();
    const signals = {
      placementOutcome,
      queueConflict: vi.fn(),
    } satisfies PlaceOrderAutomaticallySignals;
    const rejected = makeExecute({
      propose: () => ({
        kind: 'rejected',
        algorithmVersion: 'online-stable-insertion-v1',
        inputSnapshotHash: 'f'.repeat(64),
        reason: {
          code: 'ORDER_EXCEEDS_PULSE_CAPACITY',
          message: 'A whole order cannot exceed pulse capacity.',
        },
      }),
      signals,
    });
    await expect(
      rejected(command({ idempotencyKey: 'place-rejected-1' })),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'not_placed', reason: 'hard_capacity_exceeded' },
    });
    let graph = await readMutationGraph();
    expect(graph.runs[0]?.queueVersion).toBe(1);
    expect(graph.batches).toEqual(before.batches);
    expect(arrivingOrder(graph)?.pendingPlacement).toMatchObject({
      status: 'not_placed',
      reason: 'hard_capacity_exceeded',
      preview: null,
    });
    expect(graph.events[0]).toMatchObject({
      eventType: 'production_order_placement_resolved',
      expectedVersion: null,
    });

    await database.reset();
    await seed();
    const beforeOvertime = await readMutationGraph();
    const overtime = proposal({ target: 'new', overtimeMinutes: 15 });
    const overtimeExecute = makeExecute({
      propose: () => overtime,
      signals,
    });
    const overtimeCommand = command({
      idempotencyKey: 'place-overtime-required-1',
    });
    await expect(overtimeExecute(overtimeCommand)).resolves.toMatchObject({
      kind: 'success',
      value: {
        status: 'confirmation_required',
        proposalHash: overtime.placementPlanHash,
        queueVersion: 1,
        overtimeMinutes: 15,
        replayed: false,
      },
    });
    await expect(overtimeExecute(overtimeCommand)).resolves.toMatchObject({
      kind: 'success',
      value: { status: 'confirmation_required', replayed: true },
    });
    graph = await readMutationGraph();
    expect(graph.runs[0]?.queueVersion).toBe(1);
    expect(graph.batches).toEqual(beforeOvertime.batches);
    expect(arrivingOrder(graph)?.pendingPlacement).toMatchObject({
      status: 'confirmation_required',
      proposalHash: overtime.placementPlanHash,
      queueVersion: 1,
      overtimeMinutes: 15,
    });
    expect(graph.events).toHaveLength(1);
    expect(graph.events[0]).toMatchObject({
      eventType: 'production_order_placement_overtime_required',
      expectedVersion: 1,
    });
    expect(placementOutcome).toHaveBeenCalledTimes(2);
    expect(await readLiveRevision()).toBe(1);
  });

  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes two distinct same-queue orders so one places and one records queue conflict',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const placementOutcome = vi.fn();
          const queueConflict = vi.fn();
          const signals = { placementOutcome, queueConflict };
          const dynamicProposal: ProposeOnlinePlacement = (input) =>
            proposal({
              orderId: input.order.id,
              queueVersion: input.run.queueVersion,
            });
          const first = makeExecute({
            propose: dynamicProposal,
            source: sequenceIds('59000000'),
            signals,
          });
          const second = makeExecute({
            propose: dynamicProposal,
            source: sequenceIds('5a000000'),
            signals,
          });
          const outcomes = await Promise.all([
            first(command({ idempotencyKey: 'same-queue-a' })),
            second(
              command({
                productionOrderId: ids.arrivingOrderB,
                idempotencyKey: 'same-queue-b',
              }),
            ),
          ]);
          expect(
            outcomes.filter(
              (outcome) =>
                outcome.kind === 'success' && outcome.value.status === 'placed',
            ),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'success',
              value: expect.objectContaining({
                status: 'not_placed',
                reason: 'queue_conflict',
                queueVersion: 2,
              }),
            }),
          );
          const graph = await readMutationGraph();
          expect(graph.runs[0]?.queueVersion).toBe(2);
          expect(
            graph.memberships.filter(
              (membership) =>
                membership.productionOrderId === ids.arrivingOrderA ||
                membership.productionOrderId === ids.arrivingOrderB,
            ),
          ).toHaveLength(1);
          expect(graph.events).toHaveLength(2);
          expect(await readLiveRevision()).toBe(2);
          expect(placementOutcome).toHaveBeenCalledTimes(2);
          expect(queueConflict).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_order_execution_transition_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const before = await readMutationGraph();
          const execute = makeExecute({
            policy: {
              ...productionRules,
              evaluateProductionOrderExecutionTransition: () =>
                result.ok({
                  from: 'scheduled' as const,
                  state: 'scheduled' as const,
                }),
            },
          });
          await expect(
            execute(
              command({
                idempotencyKey: 'place-invalid-execution-transition',
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_transition_invalid',
            },
          });
          expect(await readMutationGraph()).toEqual(before);
        },
      },
      {
        name: 'rejects production_placement_queue_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          await installCasFault('run');
          const before = await readMutationGraph();
          const revision = await readLiveRevision();
          await expect(
            makeExecute()(
              command({ idempotencyKey: 'place-queue-version-conflict' }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_placement_queue_version_conflict',
            },
          });
          expect(await readMutationGraph()).toEqual(before);
          expect(await readLiveRevision()).toBe(revision);
        },
      },
      {
        name: 'rejects production_placement_stage_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          await installCasFault('stage');
          const before = await readMutationGraph();
          const revision = await readLiveRevision();
          await expect(
            makeExecute()(
              command({ idempotencyKey: 'place-stage-version-conflict' }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_placement_stage_version_conflict',
            },
          });
          expect(await readMutationGraph()).toEqual(before);
          expect(await readLiveRevision()).toBe(revision);
        },
      },
    ],
  });

  it.each([
    ['stage', 'production_placement_stage_version_conflict'],
    ['order', 'production_placement_order_version_conflict'],
    ['run', 'production_placement_queue_version_conflict'],
  ] as const)(
    'rolls back the complete graph on late %s CAS conflict',
    async (kind, code) => {
      await seed();
      await installCasFault(kind);
      const before = await readMutationGraph();
      const observations: TransactionObservation[] = [];
      const placementOutcome = vi.fn();
      const execute = makeExecute({
        observations,
        signals: { placementOutcome, queueConflict: vi.fn() },
      });
      await expect(
        execute(command({ idempotencyKey: `place-${kind}-cas` })),
      ).resolves.toMatchObject({
        kind: 'failure',
        failure: { code },
      });
      const after = await readMutationGraph();
      expect(observations).toEqual(['err']);
      expect(after).toEqual(before);
      expect(await readLiveRevision()).toBe(0);
      expect(placementOutcome).not.toHaveBeenCalled();
    },
  );

  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back the complete graph on late work-event ID failure',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.collisionEvent,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.arrivingOrderB,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'fixture-existing-event',
            payload: {},
          });
          const before = await readMutationGraph();
          const values = [
            '5b000000-0000-4000-8000-000000000001',
            '5b000000-0000-4000-8000-000000000002',
            '5b000000-0000-4000-8000-000000000003',
            '5b000000-0000-4000-8000-000000000004',
            '5b000000-0000-4000-8000-000000000005',
            '5b000000-0000-4000-8000-000000000006',
            ids.collisionEvent,
          ];
          let index = 0;
          const placementOutcome = vi.fn();
          const execute = makeExecute({
            source: { next: () => values[index++]! },
            signals: { placementOutcome, queueConflict: vi.fn() },
          });
          await expect(
            execute(command({ idempotencyKey: 'place-late-event-id' })),
          ).rejects.toMatchObject({
            code: 'production_order_placement_failed',
            status: 503,
          });
          const after = await readMutationGraph();
          expect(after).toEqual(before);
          expect(placementOutcome).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it('rolls back placement on a late competing receipt and keeps only the competitor', async () => {
    await seed();
    const base = makePlaceOrderAutomaticallyPostgresRepository(
      {
        db: database.db,
        ids: sequenceIds('5c000000'),
      },
      productionTestSchema,
    );
    let injected = false;
    const repository: PlaceOrderAutomaticallyRepository<StoredPlaceOrderAutomaticallyWorkEvent> =
      {
        transaction: (work) =>
          base.transaction((repo) =>
            work({
              ...repo,
              appendWorkEvent: async (event) => {
                if (!injected) {
                  injected = true;
                  await database.db
                    .insert(productionTestSchema.workEvents)
                    .values({
                      id: ids.collisionEvent,
                      locationId,
                      eventType: 'fixture_competing_receipt',
                      entityType: 'production_order',
                      entityId: ids.arrivingOrderA,
                      actorId: ids.actor,
                      expectedVersion: 1,
                      idempotencyKey: event.idempotencyKey,
                      payload: {
                        _idempotency: {
                          version: 1,
                          command: {},
                          result: {},
                        },
                      },
                    });
                }
                await repo.appendWorkEvent(event);
              },
            }),
          ),
      };
    const placementOutcome = vi.fn();
    const execute = makeExecute({
      repository,
      signals: { placementOutcome, queueConflict: vi.fn() },
    });
    const before = await readMutationGraph();
    await expect(
      execute(command({ idempotencyKey: 'place-late-receipt' })),
    ).rejects.toMatchObject({
      code: 'production_order_placement_failed',
      status: 503,
    });
    const after = await readMutationGraph();
    expect(after.runs).toEqual(before.runs);
    expect(after.orders).toEqual(before.orders);
    expect(after.batches).toEqual(before.batches);
    expect(after.memberships).toEqual(before.memberships);
    expect(after.stages).toEqual(before.stages);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.events).toEqual([
      expect.objectContaining({
        eventType: 'fixture_competing_receipt',
        idempotencyKey: 'place-late-receipt',
      }),
    ]);
    expect(await readLiveRevision()).toBe(1);
    expect(placementOutcome).not.toHaveBeenCalled();
  });

  proveOperation({
    operationId: 'production.place-order-automatically.v1',
    declaration: placeOrderAutomaticallyCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays a same-key contender only after its locked context becomes available',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const base = makePlaceOrderAutomaticallyPostgresRepository(
            {
              db: database.db,
              ids: sequenceIds('5d000000'),
            },
            productionTestSchema,
          );
          let signalCommitReached: () => void = () => undefined;
          let releaseCommit: () => void = () => undefined;
          const commitReached = new Promise<void>((resolve) => {
            signalCommitReached = resolve;
          });
          const commitReleased = new Promise<void>((resolve) => {
            releaseCommit = resolve;
          });
          const gatedRepository: PlaceOrderAutomaticallyRepository<StoredPlaceOrderAutomaticallyWorkEvent> =
            {
              transaction: (work) =>
                base.transaction((repo) =>
                  work({
                    ...repo,
                    commitPlacement: async (input) => {
                      signalCommitReached();
                      await commitReleased;
                      return repo.commitPlacement(input);
                    },
                  }),
                ),
            };
          const placementOutcome = vi.fn();
          const firstProposal = vi.fn(() => proposal());
          const secondProposal = vi.fn(() => proposal());
          const first = makeExecute({
            repository: gatedRepository,
            propose: firstProposal,
            signals: { placementOutcome, queueConflict: vi.fn() },
          });
          const second = makeExecute({
            source: sequenceIds('5e000000'),
            propose: secondProposal,
            signals: { placementOutcome, queueConflict: vi.fn() },
          });
          const input = command({ idempotencyKey: 'place-after-lock-replay' });
          const firstOutcome = first(input);
          await commitReached;
          const secondOutcome = second(input);
          expect(await waitForBlockedRowLock()).toBe(true);
          releaseCommit();
          const outcomes = await Promise.all([firstOutcome, secondOutcome]);
          expect(outcomes).toEqual(
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
          expect(firstProposal).toHaveBeenCalledOnce();
          expect(secondProposal).not.toHaveBeenCalled();
          expect(placementOutcome).toHaveBeenCalledOnce();
          expect((await readMutationGraph()).events).toHaveLength(1);
          expect(await readLiveRevision()).toBe(1);
        },
      },
    ],
  });

  it.each(['run', 'order', 'batch'] as const)(
    'locks %s before the next mutable graph level',
    async (blockedLevel) => {
      await seed();
      const blocker = await holdRowLock((transaction) => {
        if (blockedLevel === 'run')
          return transaction
            .select({ id: productionTestSchema.productionRuns.id })
            .from(productionTestSchema.productionRuns)
            .where(eq(productionTestSchema.productionRuns.id, ids.run))
            .for('update');
        if (blockedLevel === 'order')
          return transaction
            .select({ id: productionTestSchema.productionOrders.id })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.arrivingOrderA),
            )
            .for('update');
        return transaction
          .select({ id: productionTestSchema.productionBatches.id })
          .from(productionTestSchema.productionBatches)
          .where(eq(productionTestSchema.productionBatches.id, ids.frozenBatch))
          .for('update');
      });
      const execute = makeExecute({
        source: sequenceIds(
          blockedLevel === 'run'
            ? '5f000000'
            : blockedLevel === 'order'
              ? '60000000'
              : '61000000',
        ),
      });
      const outcome = execute(
        command({ idempotencyKey: `place-lock-order-${blockedLevel}` }),
      );
      try {
        expect(await waitForBlockedRowLock()).toBe(true);
        if (blockedLevel === 'run')
          await expect(
            database.db.transaction((transaction) =>
              transaction.execute(
                sql`select id from production_orders where id = ${ids.arrivingOrderA} for update nowait`,
              ),
            ),
          ).resolves.toBeDefined();
        else if (blockedLevel === 'order')
          await expect(
            database.db.transaction((transaction) =>
              transaction.execute(
                sql`select id from production_batches where production_run_id = ${ids.run} for update nowait`,
              ),
            ),
          ).resolves.toBeDefined();
        else
          await expect(
            database.db.transaction((transaction) =>
              transaction.execute(
                sql`select id from production_batches where id = ${ids.mutableBatch} for update nowait`,
              ),
            ),
          ).resolves.toBeDefined();
      } finally {
        blocker.release();
        await blocker.done;
      }
      await expect(outcome).resolves.toMatchObject({
        kind: 'success',
        value: { status: 'placed' },
      });
    },
    30_000,
  );

  it('preserves the priority middle-insertion assignment-overlap rollback quirk', async () => {
    await seed();
    const before = await readMutationGraph();
    const newProjection = {
      sourceBatchId: null,
      sequence: 1,
      status: 'queued' as const,
      membershipFrozen: false,
      orderIds: [ids.arrivingOrderA],
      priorityOrderIds: [ids.arrivingOrderA],
      derivedWeightLbs: 20,
      bagCount: 1,
      stages: stageProjection(1),
      changed: true,
    };
    const shiftedProjection = {
      sourceBatchId: ids.mutableBatch,
      sequence: 2,
      status: 'queued' as const,
      membershipFrozen: false,
      orderIds: [ids.queuedOrder],
      priorityOrderIds: [],
      derivedWeightLbs: 40,
      bagCount: 1,
      stages: stageProjection(2),
      changed: true,
    };
    const middle: OnlinePlacementProposal = {
      ...proposal({ target: 'new' }),
      target: { type: 'new_batch', insertAtSequence: 1 },
      affectedFromSequence: 1,
      affectedBatches: [newProjection, shiftedProjection],
      projectedCompletionAt: stageProjection(2).at(-1)!.endsAt,
    };
    const placementOutcome = vi.fn();
    const execute = makeExecute({
      propose: () => middle,
      source: sequenceIds('62000000'),
      signals: { placementOutcome, queueConflict: vi.fn() },
    });
    await expect(
      execute(command({ idempotencyKey: 'place-priority-middle-quirk' })),
    ).rejects.toMatchObject({
      code: 'production_order_placement_failed',
      status: 503,
    });
    expect(await readMutationGraph()).toEqual(before);
    expect(await readLiveRevision()).toBe(0);
    expect(placementOutcome).not.toHaveBeenCalled();
  });

  it.each([
    ['missing run', { productionRunId: ids.config }],
    ['missing order', { productionOrderId: ids.config }],
  ] as const)('returns $s without mutation', async (_name, override) => {
    await seed();
    const before = await readMutationGraph();
    const execute = makeExecute();
    await expect(
      execute(
        command({
          ...override,
          idempotencyKey: `place-context-${_name.replace(' ', '-')}`,
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_placement_context_not_found' },
    });
    expect(await readMutationGraph()).toEqual(before);
    expect(await readLiveRevision()).toBe(0);
  });
});
