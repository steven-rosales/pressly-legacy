import { proveOperation } from '@pressly/testkit/operation-proof';
import { startScheduleCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq, sql } from '@pressly/postgres/query';
import { createPostgresRuntime } from '@pressly/postgres/client';
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
import { productionRules } from '../../../model/public.ts';
import type { SchedulingInput } from '../../../model/production-schedule/model.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { decideStartSchedule } from './decide.ts';
import { makeExecuteStartSchedule } from './execute.ts';
import { orderVersionConflict } from './failures.ts';
import { startScheduleIdempotency } from './idempotency.ts';
import { makeStartSchedulePostgresRepository } from './postgres.ts';
import type {
  ScheduleStartRecord,
  StartScheduleCommand,
  StartSchedulePolicy,
} from './types.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_start_schedule_cell_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);
const database = createTestDatabaseRuntime({
  databaseUrl,
  tableNames: [
    'stage_machine_assignments',
    'production_order_stage_attempts',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'work_events',
    'schedule_runs',
    'production_shift_selected_orders',
    'production_shift_selections',
    'scheduler_configs',
    'production_machines',
    'production_stations',
    'production_bags',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 6,
  resetDatabaseUrl,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: productionTestSchema,
  maxConnections: 1,
});

const uuid = (prefix: number, suffix: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const id = {
  business: '00000000-0000-4000-8000-000000000100',
  actor: uuid(41000000, 1),
  fallbackActor: uuid(41000000, 2),
  orderA: uuid(41000000, 10),
  fulfillmentA: uuid(41000000, 11),
  demandA: uuid(41000000, 12),
  productionOrderA: uuid(41000000, 13),
  orderB: uuid(41000000, 20),
  fulfillmentB: uuid(41000000, 21),
  demandB: uuid(41000000, 22),
  productionOrderB: uuid(41000000, 23),
  shift: uuid(41000000, 30),
  config: uuid(41000000, 31),
  schedule: uuid(41000000, 32),
  sortingStation: uuid(41000000, 40),
  washingStation: uuid(41000000, 41),
  dryingStation: uuid(41000000, 42),
  foldingStation: uuid(41000000, 43),
  washer: uuid(41000000, 44),
  dryer: uuid(41000000, 45),
  existingRun: uuid(41000000, 50),
  fixtureEvent: uuid(41000000, 60),
} as const;

const locationId = 'location-start-schedule-cell';
const now = new Date('2026-08-22T15:00:00.000Z');
const outputPlanHash = 'b'.repeat(64);
const inputSnapshotHash = 'a'.repeat(64);

const stages = (
  offset: number,
): ScheduleStartRecord['schedule']['batches'][number]['stages'] =>
  [
    ['sorting', [], 0],
    ['washing', [id.washer], 1],
    ['drying', [id.dryer], 2],
    ['folding_packaging', [], 3],
  ].map(([stage, machineIds, stageOffset]) => ({
    stage: stage as 'sorting' | 'washing' | 'drying' | 'folding_packaging',
    startsAt: new Date(
      now.getTime() + (offset + Number(stageOffset)) * 56 * 60_000,
    ).toISOString(),
    endsAt: new Date(
      now.getTime() + (offset + Number(stageOffset) + 1) * 56 * 60_000,
    ).toISOString(),
    machineIds: machineIds as string[],
  }));

const schedulingInput = (
  startsAt = '2026-08-22T14:00:00.000Z',
): SchedulingInput => ({
  orders: [
    {
      id: id.productionOrderA,
      externalOrderId: 'START-A',
      dueAt: '2026-08-22T20:00:00.000Z',
      priority: true,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 1,
    },
    {
      id: id.productionOrderB,
      externalOrderId: 'START-B',
      dueAt: '2026-08-22T21:00:00.000Z',
      priority: false,
      derivedWeightLbs: 30,
      bagCount: 2,
      version: 1,
    },
  ],
  machines: [
    {
      id: id.washer,
      stationKind: 'washing',
      effectiveCapacityLbs: 100,
      active: true,
    },
    {
      id: id.dryer,
      stationKind: 'drying',
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  shift: {
    id: id.shift,
    startsAt,
    endsAt: '2026-08-22T22:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: id.config,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
});

const batches = () => [
  {
    sequence: 0,
    orderIds: [id.productionOrderA],
    derivedWeightLbs: 20,
    bagCount: 1,
    stages: stages(0),
  },
  {
    sequence: 1,
    orderIds: [id.productionOrderB],
    derivedWeightLbs: 30,
    bagCount: 2,
    stages: stages(1),
  },
];

const record = (
  input: {
    startsAt?: string;
    status?: string;
    empty?: boolean;
    acceptedBy?: string | null;
  } = {},
): ScheduleStartRecord => {
  const snapshot = schedulingInput(input.startsAt);
  const plannedBatches = input.empty === true ? [] : batches();
  return {
    schedule: {
      scheduleRunId: id.schedule,
      productionShiftId: id.shift,
      status: input.status ?? 'accepted',
      outputPlanHash,
      pulseMinutes: 56,
      pulseCapacityLbs: 100,
      plannedCompletionAt: '2026-08-22T23:00:00.000Z',
      batches: plannedBatches,
      unplacedOrderIds:
        input.empty === true ? [id.productionOrderA, id.productionOrderB] : [],
    },
    inputSnapshot: snapshot,
    acceptedBy: input.acceptedBy === undefined ? id.actor : input.acceptedBy,
    acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
  };
};

const storedOutput = (value: ScheduleStartRecord) => ({
  algorithmVersion: 'fixed-pulse-ffd-v2',
  inputSnapshotHash,
  outputPlanHash,
  canonicalOutput: '{"algorithmVersion":"fixed-pulse-ffd-v2"}',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: value.schedule.batches.length,
  makespanMinutes: value.schedule.batches.length === 0 ? 0 : 280,
  plannedCompletionAt: value.schedule.plannedCompletionAt,
  batches: value.schedule.batches,
  unplacedOrderIds: value.schedule.unplacedOrderIds,
  warnings: [
    {
      code: 'SHIFT_OVERFLOW',
      message: 'The accepted plan extends beyond the shift.',
      blocking: false,
    },
  ],
});

const command = (
  patch: Partial<StartScheduleCommand> = {},
): StartScheduleCommand => ({
  locationId,
  scheduleRunId: id.schedule,
  expectedOutputPlanHash: outputPlanHash,
  idempotencyKey: 'start-schedule-pg-1',
  actorId: id.fallbackActor,
  ...patch,
});

const generatedIds = (prefix = 51000000): readonly string[] =>
  Array.from({ length: 30 }, (_, index) => uuid(prefix, index + 1));

const idSource = (values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () => values[index++] ?? uuid(59000000, index),
  };
};

type TransactionObservation = 'ok' | 'err' | 'threw';
const observer =
  (seen: TransactionObservation[]): ProductionResultUnitOfWorkObserver =>
  (unit) => ({
    transaction: async (work) => {
      try {
        const outcome = await unit.transaction(work);
        seen.push(outcome.tag);
        return outcome;
      } catch (error) {
        seen.push('threw');
        throw error;
      }
    },
  });

const rendezvous = (participants: number): (() => Promise<void>) => {
  let arrived = 0;
  let release = (): void => undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === participants) release();
    await ready;
  };
};

const make = (
  input: {
    ids?: readonly string[];
    seen?: TransactionObservation[];
    signal?: () => void;
    clock?: () => Date;
    policy?: StartSchedulePolicy;
    beforeFirstReplay?: () => Promise<void>;
    transformRepository?: (
      repository: ReturnType<typeof makeStartSchedulePostgresRepository>,
    ) => ReturnType<typeof makeStartSchedulePostgresRepository>;
  } = {},
) => {
  const ids = idSource(input.ids ?? generatedIds());
  const nativeRepository = makeStartSchedulePostgresRepository(
    {
      db: database.db,
      ids,
      ...(input.seen === undefined
        ? {}
        : { observeUnitOfWork: observer(input.seen) }),
    },
    productionTestSchema,
  );
  const transformedRepository =
    input.transformRepository?.(nativeRepository) ?? nativeRepository;
  const beforeFirstReplay = input.beforeFirstReplay;
  const repo =
    beforeFirstReplay === undefined
      ? transformedRepository
      : {
          transaction: (
            work: Parameters<typeof nativeRepository.transaction>[0],
          ) =>
            transformedRepository.transaction((repository) => {
              let replayChecks = 0;
              return work({
                ...repository,
                findWorkEvent: async (key) => {
                  const stored = await repository.findWorkEvent(key);
                  replayChecks += 1;
                  if (replayChecks === 1) await beforeFirstReplay();
                  return stored;
                },
              });
            }),
        };
  return makeExecuteStartSchedule({
    repo,
    idempotency: startScheduleIdempotency,
    policy: input.policy ?? productionRules,
    clock: { now: input.clock ?? (() => new Date(now)) },
    ...(input.signal === undefined
      ? {}
      : { signals: { runStarted: input.signal } }),
  });
};

const seedOrder = async (input: {
  orderId: string;
  fulfillmentId: string;
  demandId: string;
  productionOrderId: string;
  displayReference: string;
  dueAt: string;
  weight: number;
  bagCount: number;
  priority: boolean;
}) => {
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: input.demandId,
    fulfillmentId: input.fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: input.displayReference,
    locationId,
    revisionAt: now,
    phase: 'production_released',
    estimatedWeightLbs: input.weight,
    estimatedWeightSource: 'test',
    dueAt: new Date(input.dueAt),
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: input.demandId,
    locationId,
    dueAt: new Date(input.dueAt),
    priority: input.priority,
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: input.weight,
    bagCount: input.bagCount,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: now,
    intakeVersion: 1,
    eligibleAt: now,
    version: 1,
  });
};

const seed = async (
  input: {
    startsAt?: string;
    status?: string;
    empty?: boolean;
    existingRun?: boolean;
  } = {},
) => {
  const startRecord = record(input);
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId: id.business,
    name: 'Start Schedule Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: id.shift,
    locationId,
    startsAt: new Date(startRecord.inputSnapshot.shift.startsAt),
    endsAt: new Date(startRecord.inputSnapshot.shift.endsAt),
    timezone: startRecord.inputSnapshot.shift.timezone,
    status: 'open',
    effectiveFolderCount: 2,
    version: 1,
  });
  await database.db.insert(productionTestSchema.stations).values([
    {
      id: id.sortingStation,
      locationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    },
    {
      id: id.washingStation,
      locationId,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
    },
    {
      id: id.dryingStation,
      locationId,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 3,
    },
    {
      id: id.foldingStation,
      locationId,
      kind: 'folding_packaging',
      label: 'Folding',
      sortOrder: 4,
    },
  ]);
  await database.db.insert(productionTestSchema.machines).values([
    {
      id: id.washer,
      locationId,
      stationId: id.washingStation,
      label: 'Washer',
      effectiveCapacityLbs: 100,
    },
    {
      id: id.dryer,
      locationId,
      stationId: id.dryingStation,
      label: 'Dryer',
      effectiveCapacityLbs: 100,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: id.config,
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
    assertedBy: id.actor,
  });
  await seedOrder({
    orderId: id.orderA,
    fulfillmentId: id.fulfillmentA,
    demandId: id.demandA,
    productionOrderId: id.productionOrderA,
    displayReference: 'START-A',
    dueAt: '2026-08-22T20:00:00.000Z',
    weight: 20,
    bagCount: 1,
    priority: true,
  });
  await seedOrder({
    orderId: id.orderB,
    fulfillmentId: id.fulfillmentB,
    demandId: id.demandB,
    productionOrderId: id.productionOrderB,
    displayReference: 'START-B',
    dueAt: '2026-08-22T21:00:00.000Z',
    weight: 30,
    bagCount: 2,
    priority: false,
  });
  await database.db
    .insert(productionTestSchema.productionShiftSelections)
    .values({
      productionShiftId: id.shift,
      locationId,
      version: 1,
      selectedBy: id.actor,
    });
  await database.db
    .insert(productionTestSchema.productionShiftSelectedOrders)
    .values([
      {
        productionShiftId: id.shift,
        locationId,
        productionOrderId: id.productionOrderA,
        selectedBy: id.actor,
      },
      {
        productionShiftId: id.shift,
        locationId,
        productionOrderId: id.productionOrderB,
        selectedBy: id.actor,
      },
    ]);
  const accepted = startRecord.schedule.status === 'accepted';
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: id.schedule,
    locationId,
    productionShiftId: id.shift,
    schedulerConfigId: id.config,
    status: startRecord.schedule.status,
    inputSnapshot: startRecord.inputSnapshot,
    inputSnapshotHash,
    outputPlan: storedOutput(startRecord),
    outputPlanHash,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: startRecord.schedule.batches.length,
    makespanMinutes: startRecord.schedule.batches.length === 0 ? 0 : 280,
    plannedCompletionAt: new Date(startRecord.schedule.plannedCompletionAt),
    warnings: storedOutput(startRecord).warnings,
    acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
    createdAt: new Date('2026-08-22T13:00:00.000Z'),
    acceptedAt: accepted ? new Date('2026-08-22T13:30:00.000Z') : null,
    acceptedBy: accepted ? id.actor : null,
  });
  if (input.existingRun === true)
    await database.db.insert(productionTestSchema.productionRuns).values({
      id: id.existingRun,
      locationId,
      productionShiftId: id.shift,
      scheduleRunId: id.schedule,
      status: 'started',
      startedAt: now,
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-22T23:00:00.000Z'),
      version: 1,
    });
};

const startDurableState = async () => {
  const [
    runs,
    batches,
    stages,
    assignments,
    attempts,
    orderRows,
    schedules,
    shifts,
    events,
  ] = await Promise.all([
    database.db.select().from(productionTestSchema.productionRuns),
    database.db.select().from(productionTestSchema.productionBatches),
    database.db.select().from(productionTestSchema.stageRuns),
    database.db.select().from(productionTestSchema.stageMachineAssignments),
    database.db
      .select()
      .from(productionTestSchema.productionOrderStageAttempts),
    database.db.select().from(productionTestSchema.productionOrders),
    database.db.select().from(productionTestSchema.scheduleRuns),
    database.db.select().from(productionTestSchema.productionShifts),
    database.db.select().from(productionTestSchema.workEvents),
  ]);
  return {
    runs,
    batches,
    stages,
    assignments,
    attempts,
    orders: orderRows,
    schedules,
    shifts,
    events,
  };
};

const removeFaults = async () => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists start_schedule_order_fault on production_orders`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists start_schedule_reject_second_order()`,
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

describe('start schedule native PostgreSQL cell', () => {
  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
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
              eq(productionTestSchema.productionOrders.id, id.productionOrderA),
            );
          const before = await startDurableState();
          await expect(
            make()(command({ idempotencyKey: 'start-event-not-allowed' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_order_execution_event_not_allowed',
            },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
      {
        name: 'rejects production_run_already_exists without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ existingRun: true });
          const before = await startDurableState();
          await expect(
            make()(command({ idempotencyKey: 'start-run-already-exists' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_run_already_exists',
            },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
      {
        name: 'rejects production_shift_not_found without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const before = await startDurableState();
          await expect(
            make({
              transformRepository: (native) => ({
                transaction: (work) =>
                  native.transaction((repository) =>
                    work({
                      ...repository,
                      lockShiftForStart: async () => false,
                    }),
                  ),
              }),
            })(command({ idempotencyKey: 'start-shift-not-found' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'not_found',
              code: 'production_shift_not_found',
            },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
      {
        name: 'rejects schedule_has_no_batches without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ empty: true });
          const before = await startDurableState();
          await expect(
            make()(command({ idempotencyKey: 'start-has-no-batches' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { kind: 'conflict', code: 'schedule_has_no_batches' },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
      {
        name: 'rejects schedule_not_accepted without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed({ status: 'draft' });
          const before = await startDurableState();
          await expect(
            make()(command({ idempotencyKey: 'start-not-accepted' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { kind: 'conflict', code: 'schedule_not_accepted' },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
      {
        name: 'materializes the complete deterministic graph and receipt atomically',
        proves: ['postgres-commit'],
        run: async () => {
          await seed();
          const ids = generatedIds();
          const seen: TransactionObservation[] = [];
          const timeline: string[] = [];
          const clock = vi.fn(() => new Date(now));
          const signal = vi.fn(() => timeline.push('signal'));
          const execute = make({
            ids,
            seen,
            clock,
            signal: () => {
              timeline.push(...seen);
              signal();
            },
          });

          await expect(execute(command())).resolves.toEqual({
            kind: 'success',
            value: {
              scheduleRunId: id.schedule,
              productionRunId: ids[0],
              productionBatchIds: [ids[1], ids[8]],
              queueVersion: 1,
              startedAt: now.toISOString(),
              replayed: false,
            },
          });
          expect(clock).toHaveBeenCalledOnce();
          expect(seen).toEqual(['ok']);
          expect(timeline).toEqual(['ok', 'signal']);
          expect(signal).toHaveBeenCalledOnce();

          const [
            runs,
            batchRows,
            memberships,
            stageRows,
            assignments,
            attempts,
          ] = await Promise.all([
            database.db.select().from(productionTestSchema.productionRuns),
            database.db.select().from(productionTestSchema.productionBatches),
            database.db
              .select()
              .from(productionTestSchema.productionBatchOrders),
            database.db.select().from(productionTestSchema.stageRuns),
            database.db
              .select()
              .from(productionTestSchema.stageMachineAssignments),
            database.db
              .select()
              .from(productionTestSchema.productionOrderStageAttempts),
          ]);
          expect(runs).toHaveLength(1);
          expect(runs[0]).toMatchObject({
            id: ids[0],
            scheduleRunId: id.schedule,
            productionShiftId: id.shift,
            status: 'started',
            startedAt: now,
            queueVersion: 1,
            overtimeProposalHash: outputPlanHash,
            overtimeQueueVersion: 1,
            overtimeAcknowledgedBy: id.actor,
            overtimeAcknowledgedAt: now,
            version: 1,
          });
          expect(
            batchRows
              .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
              .map((row) => [row.id, row.sequenceIndex, row.status]),
          ).toEqual([
            [ids[1], 0, 'queued'],
            [ids[8], 1, 'queued'],
          ]);
          expect(
            memberships
              .map((row) => [
                row.productionBatchId,
                row.productionOrderId,
                row.active,
              ])
              .sort((left, right) =>
                String(left[1]).localeCompare(String(right[1])),
              ),
          ).toEqual([
            [ids[1], id.productionOrderA, true],
            [ids[8], id.productionOrderB, true],
          ]);
          const orderedStages = stageRows.sort(
            (left, right) =>
              left.plannedStartAt.getTime() - right.plannedStartAt.getTime() ||
              left.id.localeCompare(right.id),
          );
          expect(stageRows).toHaveLength(8);
          expect(
            new Map(
              batchRows.map((batch) => [
                batch.id,
                stageRows.filter(
                  (stage) => stage.productionBatchId === batch.id,
                ).length,
              ]),
            ),
          ).toEqual(
            new Map([
              [ids[1], 4],
              [ids[8], 4],
            ]),
          );
          expect(stageRows.map((row) => row.id).sort()).toEqual(
            [
              ids[2],
              ids[3],
              ids[5],
              ids[7],
              ids[9],
              ids[10],
              ids[12],
              ids[14],
            ].sort(),
          );
          expect(orderedStages.every((row) => row.status === 'planned')).toBe(
            true,
          );
          expect(
            assignments
              .map((row) => [row.id, row.stageRunId, row.machineId])
              .sort(),
          ).toEqual(
            [
              [ids[4], ids[3], id.washer],
              [ids[6], ids[5], id.dryer],
              [ids[11], ids[10], id.washer],
              [ids[13], ids[12], id.dryer],
            ].sort(),
          );
          expect(attempts).toHaveLength(8);
          expect(
            attempts.map((row) => [
              row.id,
              row.stageRunId,
              row.productionOrderId,
            ]),
          ).toEqual([
            [ids[15], ids[2], id.productionOrderA],
            [ids[16], ids[3], id.productionOrderA],
            [ids[17], ids[5], id.productionOrderA],
            [ids[18], ids[7], id.productionOrderA],
            [ids[19], ids[9], id.productionOrderB],
            [ids[20], ids[10], id.productionOrderB],
            [ids[21], ids[12], id.productionOrderB],
            [ids[22], ids[14], id.productionOrderB],
          ]);
          expect(
            attempts.every(
              (attempt) =>
                attempt.status === 'assigned' &&
                attempt.attemptNumber === 1 &&
                attempt.assignmentReason === 'initial_schedule' &&
                attempt.assignedBy === id.fallbackActor,
            ),
          ).toBe(true);

          const changedOrders = await database.db
            .select()
            .from(productionTestSchema.productionOrders);
          expect(
            changedOrders.map((order) => [
              order.id,
              order.operationalStatus,
              order.executionStatus,
              order.version,
            ]),
          ).toEqual([
            [id.productionOrderA, 'scheduled', 'scheduled', 2],
            [id.productionOrderB, 'scheduled', 'scheduled', 2],
          ]);
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            id: ids[23],
            eventType: 'production_run_started',
            entityType: 'production_run',
            entityId: ids[0],
            actorId: id.fallbackActor,
            idempotencyKey: command().idempotencyKey,
            expectedVersion: null,
            payload: expect.objectContaining({
              scheduleRunId: id.schedule,
              productionRunId: ids[0],
              productionBatchIds: [ids[1], ids[8]],
              queueVersion: 1,
              _idempotency: expect.objectContaining({ version: 1 }),
            }),
          });
          const [location] = await database.db
            .select()
            .from(productionTestSchema.productionLocations);
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes concurrent identical starts, replays exactly, and rejects divergent reuse',
        proves: [
          'same-payload-replay',
          'same-key-concurrency',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const signal = vi.fn();
          const first = make({ ids: generatedIds(52000000), signal });
          const second = make({ ids: generatedIds(53000000), signal });
          const outcomes = await Promise.all([
            first(command()),
            second(command()),
          ]);
          expect(outcomes.every((outcome) => outcome.kind === 'success')).toBe(
            true,
          );
          expect(
            outcomes
              .flatMap((outcome) =>
                outcome.kind === 'success' ? [outcome.value.replayed] : [],
              )
              .sort(),
          ).toEqual([false, true]);
          expect(signal).toHaveBeenCalledOnce();
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionRuns),
          ).toHaveLength(1);
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionBatches),
          ).toHaveLength(2);
          expect(
            await database.db.select().from(productionTestSchema.stageRuns),
          ).toHaveLength(8);
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);

          await expect(
            first(command({ expectedOutputPlanHash: 'e'.repeat(64) })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          expect(signal).toHaveBeenCalledOnce();
          const [location] = await database.db
            .select()
            .from(productionTestSchema.productionLocations);
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'resolves same-key divergence and different-key races after both first replay misses',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const sameKeyBarrier = rendezvous(2);
          const sameKeySignal = vi.fn();
          const sameKey = await Promise.all([
            make({
              ids: generatedIds(53100000),
              signal: sameKeySignal,
              beforeFirstReplay: sameKeyBarrier,
            })(command({ actorId: id.actor })),
            make({
              ids: generatedIds(53200000),
              signal: sameKeySignal,
              beforeFirstReplay: sameKeyBarrier,
            })(command({ actorId: id.fallbackActor })),
          ]);
          expect(
            sameKey.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(sameKey).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_idempotency_conflict',
              }),
            }),
          );
          expect(sameKeySignal).toHaveBeenCalledOnce();
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionRuns),
          ).toHaveLength(1);
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);

          await database.reset();
          await seed();
          const differentKeyBarrier = rendezvous(2);
          const differentKeySignal = vi.fn();
          const differentKeys = await Promise.all([
            make({
              ids: generatedIds(53300000),
              signal: differentKeySignal,
              beforeFirstReplay: differentKeyBarrier,
            })(command({ idempotencyKey: 'start-race-a' })),
            make({
              ids: generatedIds(53400000),
              signal: differentKeySignal,
              beforeFirstReplay: differentKeyBarrier,
            })(command({ idempotencyKey: 'start-race-b' })),
          ]);
          expect(
            differentKeys.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(differentKeys).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'schedule_input_snapshot_stale',
              }),
            }),
          );
          expect(differentKeySignal).toHaveBeenCalledOnce();
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionRuns),
          ).toHaveLength(1);
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_shift_window_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const before = await startDurableState();
          await expect(
            make({ clock: () => new Date(Number.NaN) })(
              command({ idempotencyKey: 'start-invalid-shift-window' }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_shift_window_invalid',
            },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
      {
        name: 'rejects schedule_not_current without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const before = await startDurableState();
          await expect(
            make({
              policy: {
                ...productionRules,
                evaluateScheduleStart: () =>
                  result.err({
                    code: 'SCHEDULE_NOT_CURRENT',
                    message: 'The selected schedule is not current.',
                  }),
              },
            })(command({ idempotencyKey: 'start-not-current' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { kind: 'conflict', code: 'schedule_not_current' },
          });
          expect(await startDurableState()).toEqual(before);
        },
      },
    ],
  });

  it('rolls back every reachable pre-commit lifecycle and snapshot rejection', async () => {
    const scenarios = [
      {
        arrange: () => seed({ status: 'draft' }),
        code: 'schedule_not_accepted',
      },
      {
        arrange: async () => {
          await seed();
          await database.db
            .update(productionTestSchema.productionOrders)
            .set({ version: 2 })
            .where(
              sql`${productionTestSchema.productionOrders.id} = ${id.productionOrderA}`,
            );
        },
        code: 'schedule_input_snapshot_stale',
      },
      {
        arrange: async () => {
          await seed();
          await database.db
            .update(productionTestSchema.productionOrders)
            .set({ executionStatus: 'scheduled' })
            .where(
              sql`${productionTestSchema.productionOrders.id} = ${id.productionOrderA}`,
            );
        },
        code: 'production_order_execution_event_not_allowed',
      },
      {
        arrange: () => seed({ empty: true }),
        code: 'schedule_has_no_batches',
      },
      {
        arrange: () => seed({ existingRun: true }),
        code: 'production_run_already_exists',
      },
      {
        arrange: () => seed({ startsAt: '2026-08-22T16:00:00.000Z' }),
        code: 'production_shift_not_started',
      },
    ] as const;

    for (const [index, scenario] of scenarios.entries()) {
      if (index > 0) await database.reset();
      await scenario.arrange();
      const before = {
        runs: await database.db
          .select()
          .from(productionTestSchema.productionRuns),
        orders: await database.db
          .select()
          .from(productionTestSchema.productionOrders),
      };
      const signal = vi.fn();
      await expect(
        make({ ids: generatedIds(54000000 + index), signal })(
          command({ idempotencyKey: `start-reject-${index}` }),
        ),
      ).resolves.toMatchObject({
        kind: 'failure',
        failure: { code: scenario.code },
      });
      expect(signal).not.toHaveBeenCalled();
      expect(
        await database.db.select().from(productionTestSchema.productionRuns),
      ).toEqual(before.runs);
      expect(
        await database.db.select().from(productionTestSchema.productionOrders),
      ).toEqual(before.orders);
      expect(
        await database.db.select().from(productionTestSchema.productionBatches),
      ).toEqual([]);
      expect(
        await database.db.select().from(productionTestSchema.workEvents),
      ).toEqual([]);
      const [location] = await database.db
        .select()
        .from(productionTestSchema.productionLocations);
      expect(location?.liveRevision).toBe(0);
    }
  });

  it('preserves the private accepted-schedule loader invariants without partial state', async () => {
    const scenarios = [
      {
        code: 'production_schedule_input_snapshot_invalid',
        corrupt: () =>
          database.db
            .update(productionTestSchema.scheduleRuns)
            .set({ inputSnapshot: { orders: [] } })
            .where(
              sql`${productionTestSchema.scheduleRuns.id} = ${id.schedule}`,
            ),
      },
      {
        code: 'production_schedule_output_plan_invalid',
        corrupt: () =>
          database.db
            .update(productionTestSchema.scheduleRuns)
            .set({ outputPlan: {} })
            .where(
              sql`${productionTestSchema.scheduleRuns.id} = ${id.schedule}`,
            ),
      },
      {
        code: 'production_schedule_acknowledged_warning_codes_invalid',
        corrupt: () =>
          database.db
            .update(productionTestSchema.scheduleRuns)
            .set({ acknowledgedWarningCodes: ['UNKNOWN_WARNING'] })
            .where(
              sql`${productionTestSchema.scheduleRuns.id} = ${id.schedule}`,
            ),
      },
    ] as const;

    for (const [index, scenario] of scenarios.entries()) {
      if (index > 0) await database.reset();
      await seed();
      await scenario.corrupt();
      const seen: TransactionObservation[] = [];
      const signal = vi.fn();
      const clock = vi.fn(() => new Date(now));
      await expect(
        make({
          ids: generatedIds(54500000 + index),
          seen,
          signal,
          clock,
        })(command({ idempotencyKey: `start-loader-invalid-${index}` })),
      ).rejects.toMatchObject({ code: scenario.code });
      expect(seen).toEqual(['threw']);
      expect(clock).not.toHaveBeenCalled();
      expect(signal).not.toHaveBeenCalled();
      expect(
        await database.db.select().from(productionTestSchema.productionRuns),
      ).toEqual([]);
      expect(
        await database.db.select().from(productionTestSchema.productionBatches),
      ).toEqual([]);
      expect(
        await database.db.select().from(productionTestSchema.stageRuns),
      ).toEqual([]);
      expect(
        await database.db.select().from(productionTestSchema.workEvents),
      ).toEqual([]);
      expect(
        (
          await database.db.select().from(productionTestSchema.productionOrders)
        ).every(
          (order) =>
            order.operationalStatus === 'eligible' && order.version === 1,
        ),
      ).toBe(true);
      const [location] = await database.db
        .select()
        .from(productionTestSchema.productionLocations);
      expect(location?.liveRevision).toBe(0);
    }
  });

  it('returns typed late order CAS conflict and rolls back an earlier order update', async () => {
    await seed();
    await faultDatabase.db.execute(sql`
      create function start_schedule_reject_second_order()
      returns trigger language plpgsql as $$
      begin
        if old.id = '41000000-0000-4000-8000-000000000023'::uuid then
          return null;
        end if;
        return new;
      end;
      $$
    `);
    await faultDatabase.db.execute(sql`
      create trigger start_schedule_order_fault
      before update on production_orders
      for each row execute function start_schedule_reject_second_order()
    `);
    const seen: TransactionObservation[] = [];
    const signal = vi.fn();
    await expect(
      make({ ids: generatedIds(55000000), seen, signal })(
        command({ idempotencyKey: 'start-order-cas' }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_schedule_start_order_version_conflict' },
    });
    expect(seen).toEqual(['err']);
    expect(signal).not.toHaveBeenCalled();
    const rows = await database.db
      .select()
      .from(productionTestSchema.productionOrders);
    expect(
      rows.map((row) => [row.id, row.operationalStatus, row.version]),
    ).toEqual([
      [id.productionOrderA, 'eligible', 1],
      [id.productionOrderB, 'eligible', 1],
    ]);
    expect(
      await database.db.select().from(productionTestSchema.productionRuns),
    ).toEqual([]);
    expect(
      await database.db.select().from(productionTestSchema.productionBatches),
    ).toEqual([]);
    expect(
      await database.db.select().from(productionTestSchema.workEvents),
    ).toEqual([]);
    const [location] = await database.db
      .select()
      .from(productionTestSchema.productionLocations);
    expect(location?.liveRevision).toBe(0);
  });

  it('rolls back the whole partial graph when a required station is missing', async () => {
    await seed();
    await database.db
      .delete(productionTestSchema.stations)
      .where(sql`${productionTestSchema.stations.id} = ${id.foldingStation}`);
    const seen: TransactionObservation[] = [];
    const signal = vi.fn();
    await expect(
      make({ ids: generatedIds(56000000), seen, signal })(
        command({ idempotencyKey: 'start-missing-station' }),
      ),
    ).rejects.toMatchObject({
      code: 'production_schedule_start_station_missing',
    });
    expect(seen).toEqual(['threw']);
    expect(signal).not.toHaveBeenCalled();
    expect(
      await database.db.select().from(productionTestSchema.productionRuns),
    ).toEqual([]);
    expect(
      await database.db.select().from(productionTestSchema.productionBatches),
    ).toEqual([]);
    expect(
      await database.db.select().from(productionTestSchema.stageRuns),
    ).toEqual([]);
    expect(
      await database.db
        .select()
        .from(productionTestSchema.productionOrderStageAttempts),
    ).toEqual([]);
    expect(
      (
        await database.db.select().from(productionTestSchema.productionOrders)
      ).every(
        (order) =>
          order.operationalStatus === 'eligible' && order.version === 1,
      ),
    ).toBe(true);
    expect(
      await database.db.select().from(productionTestSchema.workEvents),
    ).toEqual([]);
  });

  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back graph and order state on a late receipt ID collision',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          const ids = generatedIds(57000000);
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids[23],
            locationId,
            eventType: 'fixture',
            entityType: 'fixture',
            entityId: id.fixtureEvent,
            actorId: id.actor,
            idempotencyKey: 'fixture-event',
            payload: {},
          });
          const seen: TransactionObservation[] = [];
          const signal = vi.fn();
          await expect(
            make({ ids, seen, signal })(
              command({ idempotencyKey: 'start-late-receipt-fault' }),
            ),
          ).rejects.toMatchObject({ code: 'production_run_start_failed' });
          expect(seen).toEqual(['threw']);
          expect(signal).not.toHaveBeenCalled();
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionRuns),
          ).toEqual([]);
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionBatches),
          ).toEqual([]);
          expect(
            await database.db.select().from(productionTestSchema.stageRuns),
          ).toEqual([]);
          expect(
            await database.db
              .select()
              .from(productionTestSchema.productionOrderStageAttempts),
          ).toEqual([]);
          expect(
            (
              await database.db
                .select()
                .from(productionTestSchema.productionOrders)
            ).every(
              (order) =>
                order.operationalStatus === 'eligible' && order.version === 1,
            ),
          ).toBe(true);
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
          const [location] = await database.db
            .select()
            .from(productionTestSchema.productionLocations);
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  it('uses the command actor as the overtime owner only when acceptedBy is absent', async () => {
    await seed();
    const ids = generatedIds(58000000);
    const repo = makeStartSchedulePostgresRepository(
      {
        db: database.db,
        ids: idSource(ids),
      },
      productionTestSchema,
    );
    const startRecord = record({ acceptedBy: null });
    const lockedOrders = [
      {
        id: id.productionOrderA,
        operationalStatus: 'eligible',
        executionStatus: 'unassigned',
        version: 1,
      },
      {
        id: id.productionOrderB,
        operationalStatus: 'eligible',
        executionStatus: 'unassigned',
        version: 1,
      },
    ];
    const decision = decideStartSchedule({
      record: startRecord,
      lockedOrders,
      productionRunExists: false,
      policy: productionRules,
    });
    if (decision.kind === 'reject') return;
    const outcome = await repo.transaction(async (tx) => {
      const committed = await tx.commitStart({
        locationId,
        record: startRecord,
        actorId: id.fallbackActor,
        decision: decision.decision,
        idempotencyKey: 'start-fallback-owner',
        idempotency: {
          operation: 'production_run_started',
          locationId,
          actorId: id.fallbackActor,
          target: { entityType: 'schedule_run', entityId: id.schedule },
          expectedVersion: null,
          payload: { expectedOutputPlanHash: outputPlanHash },
        },
        now,
      });
      return committed.kind === 'started'
        ? { kind: 'success', value: committed.result }
        : { kind: 'failure', failure: orderVersionConflict() };
    });
    expect(outcome.kind).toBe('success');
    const [run] = await database.db
      .select()
      .from(productionTestSchema.productionRuns);
    expect(run?.overtimeAcknowledgedBy).toBe(id.fallbackActor);
  });
});
