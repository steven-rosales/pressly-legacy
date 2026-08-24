import { proveOperation } from '@pressly/testkit/operation-proof';
import { confirmOrderOvertimeCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
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
  OnlinePlacementResult,
  ProposeOnlinePlacement,
} from '../../../model/online-order-placement/model.ts';
import { productionRules } from '../../../model/public.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import {
  makeExecuteConfirmOrderOvertime,
  type ConfirmOrderOvertimeRepository,
  type ConfirmOrderOvertimeSignals,
  type ExecuteConfirmOrderOvertime,
} from './execute.ts';
import {
  confirmOrderOvertimeIdempotency,
  type StoredConfirmOrderOvertimeWorkEvent,
} from './idempotency.ts';
import { makeConfirmOrderOvertimePostgresRepository } from './postgres.ts';
import type {
  ConfirmOrderOvertimePolicy,
  ConfirmProductionOrderOvertimeCommand,
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
  actor: '68000000-0000-4000-8000-000000000001',
  shift: '68000000-0000-4000-8000-000000000002',
  config: '68000000-0000-4000-8000-000000000003',
  schedule: '68000000-0000-4000-8000-000000000004',
  run: '68000000-0000-4000-8000-000000000005',
  batch: '68000000-0000-4000-8000-000000000006',
  queuedOrder: '68000000-0000-4000-8000-000000000007',
  arrivingOrderA: '68000000-0000-4000-8000-000000000008',
  arrivingOrderB: '68000000-0000-4000-8000-000000000009',
  queuedFulfillment: '68000000-0000-4000-8000-000000000013',
  arrivingFulfillmentA: '68000000-0000-4000-8000-000000000014',
  arrivingFulfillmentB: '68000000-0000-4000-8000-000000000015',
  queuedDemand: '68000000-0000-4000-8000-000000000016',
  arrivingDemandA: '68000000-0000-4000-8000-000000000017',
  arrivingDemandB: '68000000-0000-4000-8000-000000000018',
  sortingStation: '68000000-0000-4000-8000-000000000019',
  washingStation: '68000000-0000-4000-8000-000000000020',
  dryingStation: '68000000-0000-4000-8000-000000000021',
  foldingStation: '68000000-0000-4000-8000-000000000022',
  washer: '68000000-0000-4000-8000-000000000023',
  dryer: '68000000-0000-4000-8000-000000000024',
  sortingStage: '68000000-0000-4000-8000-000000000025',
  washingStage: '68000000-0000-4000-8000-000000000026',
  dryingStage: '68000000-0000-4000-8000-000000000027',
  foldingStage: '68000000-0000-4000-8000-000000000028',
  overtimeEventA: '68000000-0000-4000-8000-000000000029',
  overtimeEventB: '68000000-0000-4000-8000-000000000030',
  collisionEvent: '68000000-0000-4000-8000-000000000031',
} as const;

const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'confirm-overtime-location';
const startsAt = new Date('2026-08-22T13:00:00.000Z');
const shiftEndsAt = new Date('2026-08-22T16:00:00.000Z');
const now = new Date('2026-08-22T15:00:00.000Z');
const pulseMinutes = 56;
const automaticHash = 'a'.repeat(64);
const exactHash = 'b'.repeat(64);
const secondHash = 'c'.repeat(64);
const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const stageProjection = (sequence: number) =>
  stages.map((stage, index) => {
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
const stationId = (stage: (typeof stages)[number]) =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const removeFaults = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists confirm_overtime_reject_stage on stage_runs`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists confirm_overtime_reject_order on production_orders`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists confirm_overtime_reject_run on production_runs`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists confirm_overtime_reject_stage_update()`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists confirm_overtime_reject_order_update()`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists confirm_overtime_reject_run_update()`,
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

const seedOrderAuthorities = async (): Promise<void> => {
  const demands = [
    [ids.queuedDemand, ids.queuedFulfillment, 'confirm-queued', 40],
    [ids.arrivingDemandA, ids.arrivingFulfillmentA, 'confirm-arriving-a', 20],
    [ids.arrivingDemandB, ids.arrivingFulfillmentB, 'confirm-arriving-b', 20],
  ] as const;
  await database.db.insert(productionTestSchema.orderDemands).values(
    demands.map(([id, fulfillmentId, displayReference, weight]) => ({
      id,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'd'.repeat(64),
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

type SeedOvertime = Readonly<{
  orderId: string;
  eventId: string;
  hash: string;
  mode: 'automatic' | 'manager_exact';
  targetBatchId?: string | null;
  queueVersion?: number;
}>;

const seedOvertimeProposal = async (input: SeedOvertime): Promise<void> => {
  const targetBatchId = input.targetBatchId ?? null;
  await database.db
    .update(productionTestSchema.productionOrders)
    .set({
      pendingPlacement: {
        status: 'confirmation_required',
        mode: input.mode,
        productionRunId: ids.run,
        target:
          targetBatchId === null
            ? { kind: 'new_batch', sequence: 1 }
            : {
                kind: 'existing_batch',
                productionBatchId: targetBatchId,
                sequence: 0,
              },
        affectedBatchIds: targetBatchId === null ? [] : [targetBatchId],
        queueVersion: input.queueVersion ?? 1,
        proposalHash: input.hash,
        projectedCompletionAt: '2026-08-22T17:40:00.000Z',
        overtimeMinutes: 100,
      },
    })
    .where(eq(productionTestSchema.productionOrders.id, input.orderId));
  await database.db.insert(productionTestSchema.workEvents).values({
    id: input.eventId,
    locationId,
    eventType: 'production_order_placement_overtime_required',
    entityType: 'production_order',
    entityId: input.orderId,
    actorId: ids.actor,
    expectedVersion: input.queueVersion ?? 1,
    idempotencyKey: `initial-overtime-${input.orderId}`,
    payload: {
      productionRunId: ids.run,
      authorizedAction: 'production:override',
      mode: input.mode,
      targetBatchId,
      proposalHash: input.hash,
      queueVersion: input.queueVersion ?? 1,
      outcome: 'confirmation_required',
    },
  });
};

const seed = async (
  input: {
    overtimes?: readonly SeedOvertime[];
    queueVersion?: number;
  } = {},
): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Confirm Overtime Facility',
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
    stages.map((kind, index) => ({
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
    inputSnapshotHash: 'f'.repeat(64),
    outputPlanHash: '1'.repeat(64),
    canonicalOutput: '{}',
    pulseMinutes,
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 224,
    plannedCompletionAt: stageProjection(0).at(-1)!.endsAt,
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
    inputSnapshotHash: scheduleOutput.inputSnapshotHash,
    outputPlan: scheduleOutput,
    outputPlanHash: scheduleOutput.outputPlanHash,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 224,
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
  });
  await seedOrderAuthorities();
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 0,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 40,
    pulseMinutes,
    plannedDoneAt: new Date(stageProjection(0).at(-1)!.endsAt),
    version: 1,
  });
  await database.db.insert(productionTestSchema.productionBatchOrders).values({
    locationId,
    productionBatchId: ids.batch,
    productionOrderId: ids.queuedOrder,
    active: true,
    placementProvenance: 'initial_schedule',
  });
  const stageIds = [
    ids.sortingStage,
    ids.washingStage,
    ids.dryingStage,
    ids.foldingStage,
  ];
  const projections = stageProjection(0);
  await database.db.insert(productionTestSchema.stageRuns).values(
    projections.map((stage, index) => ({
      id: stageIds[index]!,
      locationId,
      productionBatchId: ids.batch,
      stationId: stationId(stage.stage),
      stageKind: stage.stage,
      status: 'planned',
      plannedStartAt: new Date(stage.startsAt),
      plannedEndAt: new Date(stage.endsAt),
      version: 1,
    })),
  );
  await database.db.insert(productionTestSchema.stageMachineAssignments).values(
    projections.flatMap((stage, index) =>
      stage.machineIds.map((machineId) => ({
        locationId,
        stageRunId: stageIds[index]!,
        machineId,
        plannedStartAt: new Date(stage.startsAt),
        plannedEndAt: new Date(stage.endsAt),
        status: 'planned',
      })),
    ),
  );
  for (const overtime of input.overtimes ?? [])
    await seedOvertimeProposal(overtime);
};

const command = (
  input: Partial<ConfirmProductionOrderOvertimeCommand> = {},
): ConfirmProductionOrderOvertimeCommand => ({
  locationId,
  productionRunId: ids.run,
  productionOrderId: ids.arrivingOrderA,
  expectedQueueVersion: 1,
  proposalHash: automaticHash,
  idempotencyKey: 'confirm-overtime-postgres-1',
  actorId: ids.actor,
  authorizedAction: 'production:override',
  ...input,
});

const proposal = (
  input: {
    hash?: string;
    orderId?: string;
    queueVersion?: number;
    target?: 'existing' | 'new';
  } = {},
): OnlinePlacementProposal => {
  const hash = input.hash ?? automaticHash;
  const orderId = input.orderId ?? ids.arrivingOrderA;
  const queueVersion = input.queueVersion ?? 1;
  const target = input.target ?? 'existing';
  return {
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: '2'.repeat(64),
    placementPlanHash: hash,
    canonicalPlacement: '{}',
    expectedQueueVersion: queueVersion,
    target:
      target === 'existing'
        ? { type: 'existing_batch', batchId: ids.batch, sequence: 0 }
        : { type: 'new_batch', insertAtSequence: 1 },
    affectedFromSequence: target === 'existing' ? 0 : 1,
    affectedBatches: [
      {
        sourceBatchId: target === 'existing' ? ids.batch : null,
        sequence: target === 'existing' ? 0 : 1,
        status: 'queued',
        membershipFrozen: false,
        orderIds:
          target === 'existing' ? [ids.queuedOrder, orderId] : [orderId],
        priorityOrderIds: [],
        derivedWeightLbs: target === 'existing' ? 60 : 20,
        bagCount: target === 'existing' ? 2 : 1,
        stages: stageProjection(target === 'existing' ? 0 : 1),
        changed: true,
      },
    ],
    projectedCompletionAt: stageProjection(target === 'existing' ? 0 : 1).at(
      -1,
    )!.endsAt,
    overtime: {
      required: true,
      shiftEndsAt: shiftEndsAt.toISOString(),
      overrunMinutes: target === 'existing' ? 44 : 100,
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

type Observation = 'err' | 'ok' | 'threw';
const observer =
  (
    observations: Observation[],
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
    source?: IdSource;
    propose?: ProposeOnlinePlacement;
    signals?: ConfirmOrderOvertimeSignals;
    observations?: Observation[];
    timing?: string[];
    policy?: ConfirmOrderOvertimePolicy;
    repository?: ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent>;
    transformRepository?: (
      repository: ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent>,
    ) => ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent>;
  } = {},
): ExecuteConfirmOrderOvertime => {
  const nativeRepository =
    input.repository ??
    makeConfirmOrderOvertimePostgresRepository(
      {
        db: database.db,
        ids: input.source ?? sequenceIds('69000000'),
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
  const repository =
    input.transformRepository?.(nativeRepository) ?? nativeRepository;
  return makeExecuteConfirmOrderOvertime({
    repo: repository,
    idempotency: confirmOrderOvertimeIdempotency,
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

const graph = async () => ({
  run: (
    await database.db
      .select()
      .from(productionTestSchema.productionRuns)
      .where(eq(productionTestSchema.productionRuns.id, ids.run))
  )[0],
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
  stageRuns: await database.db
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
const orderFrom = (
  state: Awaited<ReturnType<typeof graph>>,
  orderId = ids.arrivingOrderA,
) => state.orders.find((order) => order.id === orderId);

const installCasFault = async (
  kind: 'order' | 'run' | 'stage',
): Promise<void> => {
  if (kind === 'stage') {
    await faultDatabase.db.execute(
      sql`create function confirm_overtime_reject_stage_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await faultDatabase.db.execute(
      sql`create trigger confirm_overtime_reject_stage before update on stage_runs for each row execute function confirm_overtime_reject_stage_update()`,
    );
    return;
  }
  if (kind === 'order') {
    await faultDatabase.db.execute(
      sql`create function confirm_overtime_reject_order_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
    );
    await faultDatabase.db.execute(
      sql`create trigger confirm_overtime_reject_order before update on production_orders for each row execute function confirm_overtime_reject_order_update()`,
    );
    return;
  }
  await faultDatabase.db.execute(
    sql`create function confirm_overtime_reject_run_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  await faultDatabase.db.execute(
    sql`create trigger confirm_overtime_reject_run before update on production_runs for each row execute function confirm_overtime_reject_run_update()`,
  );
};

const stored = (
  input: {
    orderId?: string;
    eventId?: string;
    hash?: string;
    mode?: 'automatic' | 'manager_exact';
    targetBatchId?: string | null;
    queueVersion?: number;
  } = {},
): SeedOvertime => ({
  orderId: input.orderId ?? ids.arrivingOrderA,
  eventId: input.eventId ?? ids.overtimeEventA,
  hash: input.hash ?? automaticHash,
  mode: input.mode ?? 'automatic',
  ...(input.targetBatchId === undefined
    ? {}
    : { targetBatchId: input.targetBatchId }),
  ...(input.queueVersion === undefined
    ? {}
    : { queueVersion: input.queueVersion }),
});

describe('confirm-order-overtime native PostgreSQL cell', () => {
  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_order_execution_event_not_allowed without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          await database.db
            .update(productionTestSchema.productionOrders)
            .set({ executionStatus: 'scheduled' })
            .where(
              eq(productionTestSchema.productionOrders.id, ids.arrivingOrderA),
            );
          const before = await graph();
          await expect(makeExecute()(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_event_not_allowed',
            },
          });
          expect(await graph()).toEqual(before);
        },
      },
      {
        name: 'rejects production_order_execution_state_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          const before = await graph();
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
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_state_invalid',
            },
          });
          expect(await graph()).toEqual(before);
        },
      },
      {
        name: 'commits each stored overtime provenance then replays and rejects divergence',
        proves: [
          'postgres-commit',
          'expected-rejection-no-partial-write',
          'same-payload-replay',
          'divergent-key-conflict',
        ],
        run: async () => {
          for (const [_name, overtime, mode] of [
            ['automatic', stored(), { type: 'automatic' }],
            [
              'manager_exact',
              stored({
                hash: exactHash,
                mode: 'manager_exact',
                targetBatchId: ids.batch,
              }),
              { type: 'manager_exact', targetBatchId: ids.batch },
            ],
          ] as const) {
            await database.reset();

            await seed({ overtimes: [overtime] });
            const baselineRevision = await readLiveRevision();
            const timing: string[] = [];
            const observations: Observation[] = [];
            const placementOutcome = vi.fn(() =>
              timing.push('signal:placement'),
            );
            const queueConflict = vi.fn(() => timing.push('signal:queue'));
            const overtimeConfirmed = vi.fn(() =>
              timing.push('signal:overtime'),
            );
            const hash = overtime.hash;
            const candidate = proposal({ hash });
            const proposeOnlinePlacement = vi.fn(() => candidate);
            const execute = makeExecute({
              propose: proposeOnlinePlacement,
              observations,
              timing,
              signals: { placementOutcome, queueConflict, overtimeConfirmed },
            });
            const input = command({ proposalHash: hash });
            await expect(execute(input)).resolves.toMatchObject({
              kind: 'success',
              value: {
                status: 'placed',
                mode: mode.type,
                productionBatchId: ids.batch,
                createdBatch: false,
                queueVersion: 2,
                proposalHash: hash,
                replayed: false,
              },
            });
            await expect(execute(input)).resolves.toMatchObject({
              kind: 'success',
              value: { status: 'placed', mode: mode.type, replayed: true },
            });
            await expect(
              execute(command({ proposalHash: hash, expectedQueueVersion: 2 })),
            ).resolves.toMatchObject({
              kind: 'failure',
              failure: { code: 'production_idempotency_conflict' },
            });
            const state = await graph();
            expect(observations).toEqual(['ok', 'ok', 'err']);
            expect(timing.slice(-2)).not.toContain('signal:placement');
            expect(placementOutcome).toHaveBeenCalledOnce();
            expect(queueConflict).not.toHaveBeenCalled();
            expect(overtimeConfirmed).toHaveBeenCalledOnce();
            expect(timing.indexOf('signal:placement')).toBeGreaterThan(
              timing.indexOf('transaction:ok'),
            );
            expect(proposeOnlinePlacement).toHaveBeenCalledWith(
              expect.objectContaining({ mode }),
            );
            expect(state.run).toMatchObject({
              queueVersion: 2,
              overtimeProposalHash: hash,
              overtimeQueueVersion: 2,
              overtimeAcknowledgedBy: ids.actor,
              overtimeAcknowledgedAt: now,
            });
            expect(orderFrom(state)).toMatchObject({
              operationalStatus: 'scheduled',
              executionStatus: 'scheduled',
              pendingPlacement: null,
              version: 2,
            });
            expect(state.batches[0]).toMatchObject({
              id: ids.batch,
              derivedWeightLbs: 60,
              version: 2,
            });
            expect(
              state.memberships.find(
                (membership) =>
                  membership.productionOrderId === ids.queuedOrder,
              ),
            ).toMatchObject({
              productionBatchId: ids.batch,
              placementProvenance: 'initial_schedule',
            });
            expect(
              state.memberships.find(
                (membership) =>
                  membership.productionOrderId === ids.arrivingOrderA,
              ),
            ).toMatchObject({
              productionBatchId: ids.batch,
              placementProvenance:
                mode.type === 'manager_exact' ? 'manager_exact' : 'automatic',
              pinnedBy: mode.type === 'manager_exact' ? ids.actor : null,
            });
            expect(state.stageRuns).toHaveLength(4);
            expect(state.stageRuns.map((stage) => stage.version)).toEqual([
              2, 2, 2, 2,
            ]);
            expect(state.assignments).toHaveLength(2);
            expect(state.attempts).toHaveLength(4);
            expect(state.attempts).toEqual(
              expect.arrayContaining(
                stages.map((stageKind) =>
                  expect.objectContaining({
                    productionOrderId: ids.arrivingOrderA,
                    stageKind,
                    status: 'assigned',
                    assignmentReason:
                      mode.type === 'manager_exact'
                        ? 'manager_exact'
                        : 'automatic',
                  }),
                ),
              ),
            );
            expect(state.events).toHaveLength(2);
            expect(state.events[1]).toMatchObject({
              eventType: 'production_order_placement_resolved',
              expectedVersion: 1,
              idempotencyKey: input.idempotencyKey,
              payload: expect.objectContaining({
                authorizedAction: 'production:override',
                mode: mode.type,
                targetBatchId: mode.type === 'manager_exact' ? ids.batch : null,
                proposalHash: hash,
                outcome: 'placed',
                _idempotency: {
                  version: 1,
                  command: expect.objectContaining({
                    operation: 'production_order_overtime_confirmed',
                    expectedVersion: 1,
                    payload: expect.objectContaining({
                      authorizedAction: 'production:override',
                      mode: mode.type,
                      proposalHash: hash,
                    }),
                  }),
                  result: expect.objectContaining({
                    status: 'placed',
                    mode: mode.type,
                    queueVersion: 2,
                    replayed: false,
                  }),
                },
              }),
            });
            expect(await readLiveRevision()).toBe(baselineRevision + 1);
          }
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits a reachable automatic appended-new target and preserves existing membership',
        proves: ['postgres-commit'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          const candidate = proposal({ target: 'new' });
          const execute = makeExecute({
            propose: () => candidate,
            source: sequenceIds('6a000000'),
          });
          const outcome = await execute(
            command({ idempotencyKey: 'confirm-new-target' }),
          );
          expect(outcome).toMatchObject({
            kind: 'success',
            value: { status: 'placed', createdBatch: true, queueVersion: 2 },
          });
          if (outcome.kind !== 'success' || outcome.value.status !== 'placed')
            return;
          const state = await graph();
          const newBatchId = outcome.value.productionBatchId;
          expect(state.batches).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: ids.batch,
                sequenceIndex: 0,
                derivedWeightLbs: 40,
                version: 1,
              }),
              expect.objectContaining({
                id: newBatchId,
                sequenceIndex: 1,
                derivedWeightLbs: 20,
                version: 1,
              }),
            ]),
          );
          expect(
            state.memberships.find(
              (membership) => membership.productionOrderId === ids.queuedOrder,
            ),
          ).toMatchObject({ productionBatchId: ids.batch, active: true });
          expect(
            state.memberships.find(
              (membership) =>
                membership.productionOrderId === ids.arrivingOrderA,
            ),
          ).toMatchObject({ productionBatchId: newBatchId });
          expect(
            state.stageRuns.filter(
              (stage) => stage.productionBatchId === newBatchId,
            ),
          ).toHaveLength(4);
          expect(state.attempts).toHaveLength(4);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_order_execution_transition_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          const before = await graph();
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
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_transition_invalid',
            },
          });
          expect(await graph()).toEqual(before);
        },
      },
      {
        name: 'rejects production_placement_context_not_found without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          const before = await graph();
          const execute = makeExecute({
            transformRepository: (native) => ({
              ...native,
              transaction: (work) =>
                native.transaction((repository) =>
                  work({
                    ...repository,
                    loadContext: async () => null,
                  }),
                ),
            }),
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'not_found',
              code: 'production_placement_context_not_found',
            },
          });
          expect(await graph()).toEqual(before);
        },
      },
      {
        name: 'rejects production_placement_order_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          await installCasFault('order');
          const before = await graph();
          const revision = await readLiveRevision();
          await expect(makeExecute()(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_placement_order_version_conflict',
            },
          });
          expect(await graph()).toEqual(before);
          expect(await readLiveRevision()).toBe(revision);
        },
      },
      {
        name: 'rejects production_placement_stage_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          await installCasFault('stage');
          const before = await graph();
          const revision = await readLiveRevision();
          await expect(makeExecute()(command())).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_placement_stage_version_conflict',
            },
          });
          expect(await graph()).toEqual(before);
          expect(await readLiveRevision()).toBe(revision);
        },
      },
    ],
  });

  it.each([
    ['missing stored proposal', [], proposal(), 'proposal_stale'],
    [
      'stored queue mismatch',
      [stored({ queueVersion: 2 })],
      proposal(),
      'proposal_stale',
    ],
    [
      'recomputed hash mismatch',
      [stored()],
      proposal({ hash: 'd'.repeat(64) }),
      'proposal_stale',
    ],
    [
      'recomputed rejection',
      [],
      {
        kind: 'rejected',
        algorithmVersion: 'online-stable-insertion-v1',
        inputSnapshotHash: '2'.repeat(64),
        reason: {
          code: 'TARGET_BATCH_NOT_MUTABLE',
          message: 'The target is no longer mutable.',
        },
      },
      'no_mutable_position',
    ],
  ] as const)(
    'persists $s without queue mutation',
    async (_name, overtimes, recomputed, reason) => {
      await seed({ overtimes });
      const baseline = await graph();
      const baselineRevision = await readLiveRevision();
      const placementOutcome = vi.fn();
      const execute = makeExecute({
        propose: () => recomputed as OnlinePlacementResult,
        signals: {
          placementOutcome,
          queueConflict: vi.fn(),
          overtimeConfirmed: vi.fn(),
        },
      });
      await expect(
        execute(
          command({ idempotencyKey: `confirm-${_name.replaceAll(' ', '-')}` }),
        ),
      ).resolves.toMatchObject({
        kind: 'success',
        value: { status: 'not_placed', reason },
      });
      const state = await graph();
      expect(state.run).toEqual(baseline.run);
      expect(state.batches).toEqual(baseline.batches);
      expect(state.memberships).toEqual(baseline.memberships);
      expect(state.attempts).toEqual([]);
      expect(orderFrom(state)?.pendingPlacement).toMatchObject({
        status: 'not_placed',
        reason,
      });
      expect(state.events).toHaveLength(overtimes.length + 1);
      expect(await readLiveRevision()).toBe(baselineRevision + 1);
      expect(placementOutcome).toHaveBeenCalledWith({
        status: 'not_placed',
        mode: 'automatic',
        reason,
      });
    },
  );

  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes two same-queue confirmations so one places and one records queue conflict',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed({
            overtimes: [
              stored(),
              stored({
                orderId: ids.arrivingOrderB,
                eventId: ids.overtimeEventB,
                hash: secondHash,
              }),
            ],
          });
          const baselineRevision = await readLiveRevision();
          const placementOutcome = vi.fn();
          const queueConflict = vi.fn();
          const signals = {
            placementOutcome,
            queueConflict,
            overtimeConfirmed: vi.fn(),
          };
          const dynamic: ProposeOnlinePlacement = (input) =>
            proposal({
              hash:
                input.order.id === ids.arrivingOrderA
                  ? automaticHash
                  : secondHash,
              orderId: input.order.id,
              queueVersion: input.run.queueVersion,
            });
          const first = makeExecute({
            propose: dynamic,
            source: sequenceIds('6b000000'),
            signals,
          });
          const second = makeExecute({
            propose: dynamic,
            source: sequenceIds('6c000000'),
            signals,
          });
          const outcomes = await Promise.all([
            first(command({ idempotencyKey: 'confirm-race-a' })),
            second(
              command({
                productionOrderId: ids.arrivingOrderB,
                proposalHash: secondHash,
                idempotencyKey: 'confirm-race-b',
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
          const state = await graph();
          expect(state.run?.queueVersion).toBe(2);
          expect(
            state.memberships.filter(
              (membership) =>
                membership.productionOrderId === ids.arrivingOrderA ||
                membership.productionOrderId === ids.arrivingOrderB,
            ),
          ).toHaveLength(1);
          expect(state.events).toHaveLength(4);
          expect(await readLiveRevision()).toBe(baselineRevision + 2);
          expect(placementOutcome).toHaveBeenCalledTimes(2);
          expect(queueConflict).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  it.each([
    ['stage', 'production_placement_stage_version_conflict'],
    ['order', 'production_placement_order_version_conflict'],
    ['run', 'production_placement_queue_version_conflict'],
  ] as const)(
    'rolls back the complete graph on late %s CAS',
    async (kind, code) => {
      await seed({ overtimes: [stored()] });
      await installCasFault(kind);
      const before = await graph();
      const revision = await readLiveRevision();
      const placementOutcome = vi.fn();
      const observations: Observation[] = [];
      const execute = makeExecute({
        observations,
        signals: {
          placementOutcome,
          queueConflict: vi.fn(),
          overtimeConfirmed: vi.fn(),
        },
      });
      await expect(
        execute(command({ idempotencyKey: `confirm-${kind}-cas` })),
      ).resolves.toMatchObject({
        kind: 'failure',
        failure: { code },
      });
      expect(await graph()).toEqual(before);
      expect(await readLiveRevision()).toBe(revision);
      expect(observations).toEqual(['err']);
      expect(placementOutcome).not.toHaveBeenCalled();
    },
  );

  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back placement on late event ID collision',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.collisionEvent,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.arrivingOrderB,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'fixture-event',
            payload: {},
          });
          const before = await graph();
          const values = [
            '6d000000-0000-4000-8000-000000000001',
            '6d000000-0000-4000-8000-000000000002',
            '6d000000-0000-4000-8000-000000000003',
            '6d000000-0000-4000-8000-000000000004',
            '6d000000-0000-4000-8000-000000000005',
            '6d000000-0000-4000-8000-000000000006',
            ids.collisionEvent,
          ];
          let index = 0;
          const execute = makeExecute({
            source: { next: () => values[index++]! },
          });
          await expect(
            execute(command({ idempotencyKey: 'confirm-late-event' })),
          ).rejects.toMatchObject({
            code: 'production_order_overtime_confirmation_failed',
            status: 503,
          });
          expect(await graph()).toEqual(before);
        },
      },
    ],
  });

  it('rolls back placement on a late competing receipt and preserves only the competitor', async () => {
    await seed({ overtimes: [stored()] });
    const base = makeConfirmOrderOvertimePostgresRepository(
      {
        db: database.db,
        ids: sequenceIds('6e000000'),
      },
      productionTestSchema,
    );
    let injected = false;
    const repository: ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent> =
      {
        findOvertimeProposal: base.findOvertimeProposal,
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
                        _idempotency: { version: 1, command: {}, result: {} },
                      },
                    });
                }
                await repo.appendWorkEvent(event);
              },
            }),
          ),
      };
    const before = await graph();
    const execute = makeExecute({ repository });
    await expect(
      execute(command({ idempotencyKey: 'confirm-late-receipt' })),
    ).rejects.toMatchObject({
      code: 'production_order_overtime_confirmation_failed',
      status: 503,
    });
    const after = await graph();
    expect(after.run).toEqual(before.run);
    expect(after.orders).toEqual(before.orders);
    expect(after.batches).toEqual(before.batches);
    expect(after.memberships).toEqual(before.memberships);
    expect(after.stageRuns).toEqual(before.stageRuns);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.events).toEqual([
      ...before.events,
      expect.objectContaining({
        eventType: 'fixture_competing_receipt',
        idempotencyKey: 'confirm-late-receipt',
      }),
    ]);
  });

  it('commits unresolved confirmation evidence before raising the invariant error', async () => {
    await seed({ overtimes: [stored()] });
    const baselineRevision = await readLiveRevision();
    const policy = {
      ...productionRules,
      evaluatePlacementCommit: () => ({
        tag: 'err' as const,
        error: {
          code: 'OVERTIME_CONFIRMATION_REQUIRED',
          message: 'Confirmation is still required.',
        },
      }),
    } satisfies ConfirmOrderOvertimePolicy;
    const placementOutcome = vi.fn();
    const execute = makeExecute({
      policy,
      signals: {
        placementOutcome,
        queueConflict: vi.fn(),
        overtimeConfirmed: vi.fn(),
      },
    });
    await expect(
      execute(command({ idempotencyKey: 'confirm-unresolved-quirk' })),
    ).rejects.toMatchObject({
      code: 'production_overtime_confirmation_unresolved',
      status: 500,
    });
    const state = await graph();
    expect(state.events.at(-1)).toMatchObject({
      eventType: 'production_order_placement_overtime_required',
      idempotencyKey: 'confirm-unresolved-quirk',
    });
    expect(orderFrom(state)?.pendingPlacement).toMatchObject({
      status: 'confirmation_required',
    });
    expect(await readLiveRevision()).toBe(baselineRevision + 1);
    expect(placementOutcome).not.toHaveBeenCalled();
  });

  proveOperation({
    operationId: 'production.confirm-order-overtime.v1',
    declaration: confirmOrderOvertimeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays only after the prior stored-proposal read and locked context',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed({ overtimes: [stored()] });
          const base = makeConfirmOrderOvertimePostgresRepository(
            {
              db: database.db,
              ids: sequenceIds('6f000000'),
            },
            productionTestSchema,
          );
          let signalCommit: () => void = () => undefined;
          let releaseCommit: () => void = () => undefined;
          const commitReached = new Promise<void>((resolve) => {
            signalCommit = resolve;
          });
          const commitReleased = new Promise<void>((resolve) => {
            releaseCommit = resolve;
          });
          const gated: ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent> =
            {
              findOvertimeProposal: base.findOvertimeProposal,
              transaction: (work) =>
                base.transaction((repo) =>
                  work({
                    ...repo,
                    commitPlacement: async (input) => {
                      signalCommit();
                      await commitReleased;
                      return repo.commitPlacement(input);
                    },
                  }),
                ),
            };
          const placementOutcome = vi.fn();
          const firstProposal = vi.fn(() => proposal());
          const secondProposal = vi.fn(() => proposal());
          const signals = {
            placementOutcome,
            queueConflict: vi.fn(),
            overtimeConfirmed: vi.fn(),
          };
          const first = makeExecute({
            repository: gated,
            propose: firstProposal,
            signals,
          });
          const second = makeExecute({
            propose: secondProposal,
            source: sequenceIds('70000000'),
            signals,
          });
          const input = command({
            idempotencyKey: 'confirm-after-lock-replay',
          });
          const firstOutcome = first(input);
          await commitReached;
          const secondOutcome = second(input);
          await delay(30);
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
          expect((await graph()).events).toHaveLength(2);
        },
      },
    ],
  });
});
