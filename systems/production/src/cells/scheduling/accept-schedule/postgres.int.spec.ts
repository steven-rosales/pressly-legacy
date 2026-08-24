import { proveOperation } from '@pressly/testkit/operation-proof';
import { acceptScheduleCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import * as result from '@pressly/cells/result';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { acceptScheduleContract } from './contract.ts';
import {
  makeExecuteAcceptSchedule,
  type AcceptScheduleRepository,
  type ExecuteAcceptSchedule,
} from './execute.ts';
import type { AcceptSchedulePolicy } from './types.ts';
import {
  acceptScheduleIdempotency,
  type StoredAcceptScheduleWorkEvent,
} from './idempotency.ts';
import { makeAcceptSchedulePostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'production_runs',
    'schedule_runs',
    'production_shift_selected_orders',
    'production_shift_selections',
    'scheduler_configs',
    'production_orders',
    'production_shifts',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 8,
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
  actor: '24000000-0000-4000-8000-000000000001',
  shift: '24000000-0000-4000-8000-000000000002',
  schedule: '24000000-0000-4000-8000-000000000003',
  config: '24000000-0000-4000-8000-000000000004',
  sourceOrder: '24000000-0000-4000-8000-000000000005',
  fulfillment: '24000000-0000-4000-8000-000000000006',
  demand: '24000000-0000-4000-8000-000000000007',
  productionOrder: '24000000-0000-4000-8000-000000000008',
  event1: '24000000-0000-4000-8000-000000000009',
  event2: '24000000-0000-4000-8000-000000000010',
  raceEvent1: '24000000-0000-4000-8000-000000000011',
  raceEvent2: '24000000-0000-4000-8000-000000000012',
  rollbackEvent: '24000000-0000-4000-8000-000000000013',
} as const;

const locationId = 'location-accept-schedule';
const businessId = '00000000-0000-4000-8000-000000000100';
const outputHash = 'a'.repeat(64);
const inputHash = 'b'.repeat(64);
const now = new Date('2026-08-22T14:00:00.000Z');
const createdAt = new Date('2026-08-22T12:00:00.000Z');
const dueAt = new Date('2026-08-22T20:00:00.000Z');

const inputSnapshot = {
  orders: [
    {
      id: ids.productionOrder,
      externalOrderId: 'ACCEPT-1',
      dueAt: dueAt.toISOString(),
      priority: false,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 1,
    },
  ],
  machines: [],
  shift: {
    id: ids.shift,
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: ids.config,
    pulseMinutes: 60,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2' as const,
    version: 1,
  },
};

const outputPlan = {
  algorithmVersion: 'fixed-pulse-ffd-v2' as const,
  inputSnapshotHash: inputHash,
  outputPlanHash: outputHash,
  canonicalOutput: '{"fixture":"accept-schedule"}',
  pulseMinutes: 60,
  pulseCapacityLbs: 100,
  batchCount: 1,
  makespanMinutes: 300,
  plannedCompletionAt: '2026-08-22T17:00:00.000Z',
  batches: [
    {
      sequence: 0,
      orderIds: [ids.productionOrder],
      derivedWeightLbs: 20,
      bagCount: 1,
      stages: [
        {
          stage: 'sorting' as const,
          startsAt: '2026-08-22T13:00:00.000Z',
          endsAt: '2026-08-22T14:00:00.000Z',
          machineIds: [],
        },
        {
          stage: 'washing' as const,
          startsAt: '2026-08-22T14:00:00.000Z',
          endsAt: '2026-08-22T15:00:00.000Z',
          machineIds: [],
        },
        {
          stage: 'drying' as const,
          startsAt: '2026-08-22T15:00:00.000Z',
          endsAt: '2026-08-22T16:00:00.000Z',
          machineIds: [],
        },
        {
          stage: 'folding_packaging' as const,
          startsAt: '2026-08-22T16:00:00.000Z',
          endsAt: '2026-08-22T17:00:00.000Z',
          machineIds: [],
        },
      ],
    },
  ],
  unplacedOrderIds: [],
  warnings: [
    {
      code: 'SHIFT_OVERFLOW' as const,
      message: 'Overflow.',
      blocking: true,
    },
    {
      code: 'OVERSIZED_ORDER' as const,
      message: 'Oversized.',
      blocking: true,
      orderIds: [ids.productionOrder],
    },
  ],
};

const seedAcceptance = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Accept Schedule Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date(inputSnapshot.shift.startsAt),
    endsAt: new Date(inputSnapshot.shift.endsAt),
    timezone: inputSnapshot.shift.timezone,
    status: 'open',
    effectiveFolderCount: inputSnapshot.shift.effectiveFolderCount,
    version: inputSnapshot.shift.version,
  });
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'ACCEPT-1',
    locationId,
    revisionAt: createdAt,
    phase: 'production_released',
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'test_estimate',
    dueAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt,
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: 20,
    derivedWeightSource: 'test_estimate',
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: createdAt,
    intakeVersion: 1,
    version: 1,
    eligibleAt: createdAt,
  });
  await database.db
    .insert(productionTestSchema.productionShiftSelections)
    .values({
      productionShiftId: ids.shift,
      locationId,
      version: 1,
      selectedBy: ids.actor,
      selectedAt: createdAt,
      updatedAt: createdAt,
    });
  await database.db
    .insert(productionTestSchema.productionShiftSelectedOrders)
    .values({
      productionShiftId: ids.shift,
      locationId,
      productionOrderId: ids.productionOrder,
      selectedBy: ids.actor,
      selectedAt: createdAt,
    });
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
      assertedBy: ids.actor,
      assertedAt: createdAt.toISOString(),
    },
    assertedBy: ids.actor,
    publishedAt: createdAt,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'draft',
    inputSnapshot,
    inputSnapshotHash: inputHash,
    outputPlan,
    outputPlanHash: outputHash,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: outputPlan.pulseCapacityLbs,
    batchCount: outputPlan.batchCount,
    makespanMinutes: outputPlan.makespanMinutes,
    plannedCompletionAt: new Date(outputPlan.plannedCompletionAt),
    // The schedule mapper reads warnings from outputPlan, not this column.
    warnings: [],
    acknowledgedWarningCodes: [],
    createdAt,
  });
};

const idSource = (...values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `34000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const serializedCommand = (
  overrides: {
    acknowledgedWarningCodes?: readonly (
      | 'SHIFT_OVERFLOW'
      | 'OVERSIZED_ORDER'
    )[];
    expectedOutputPlanHash?: string;
    idempotencyKey?: string;
  } = {},
) => ({
  params: { locationId, scheduleRunId: ids.schedule },
  body: {
    expectedOutputPlanHash: overrides.expectedOutputPlanHash ?? outputHash,
    acknowledgedWarningCodes:
      overrides.acknowledgedWarningCodes ??
      (['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'] as const),
    idempotencyKey:
      overrides.idempotencyKey ?? 'accept-schedule-postgres-command-1',
  },
  actorId: ids.actor,
});

const executeSerialized = async (
  execute: ExecuteAcceptSchedule,
  serialized: ReturnType<typeof serializedCommand>,
) => {
  const decoded = acceptScheduleContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success' as const,
        value: acceptScheduleContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure' as const,
        failure: acceptScheduleContract.failure.encode(outcome.failure),
      };
};

const makeExecute = (input: {
  eventId: string;
  policy?: AcceptSchedulePolicy;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
  transformRepository?: (
    repository: AcceptScheduleRepository<StoredAcceptScheduleWorkEvent>,
  ) => AcceptScheduleRepository<StoredAcceptScheduleWorkEvent>;
}): ExecuteAcceptSchedule => {
  const native = makeAcceptSchedulePostgresRepository(
    {
      db: database.db,
      ids: idSource(input.eventId),
      ...(input.observeUnitOfWork === undefined
        ? {}
        : { observeUnitOfWork: input.observeUnitOfWork }),
    },
    productionTestSchema,
  );
  return makeExecuteAcceptSchedule({
    repo: input.transformRepository?.(native) ?? native,
    idempotency: acceptScheduleIdempotency,
    policy: input.policy ?? productionRules,
    clock: { now: () => now },
  });
};

const firstReadBarrier = () => {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async (): Promise<void> => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await bothArrived;
    },
    arrivals: () => arrivals,
  };
};

const gateFirstReplayRead =
  (barrier: ReturnType<typeof firstReadBarrier>) =>
  (
    native: AcceptScheduleRepository<StoredAcceptScheduleWorkEvent>,
  ): AcceptScheduleRepository<StoredAcceptScheduleWorkEvent> => ({
    transaction: (work) =>
      native.transaction((repo) => {
        let reads = 0;
        return work({
          ...repo,
          findWorkEvent: async (key) => {
            const event = await repo.findWorkEvent(key);
            reads += 1;
            if (reads === 1) await barrier.wait();
            return event;
          },
        });
      }),
  });

const scheduleState = async () => {
  const [schedule] = await database.db
    .select({
      status: productionTestSchema.scheduleRuns.status,
      acceptedAt: productionTestSchema.scheduleRuns.acceptedAt,
      acceptedBy: productionTestSchema.scheduleRuns.acceptedBy,
      acknowledgedWarningCodes:
        productionTestSchema.scheduleRuns.acknowledgedWarningCodes,
    })
    .from(productionTestSchema.scheduleRuns)
    .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
  return schedule;
};

const liveRevision = async (): Promise<number | undefined> => {
  const [location] = await database.db
    .select({
      liveRevision: productionTestSchema.productionLocations.liveRevision,
    })
    .from(productionTestSchema.productionLocations)
    .where(eq(productionTestSchema.productionLocations.id, locationId));
  return location?.liveRevision;
};

const acceptanceDurableState = async () => {
  const [schedules, runs, events] = await Promise.all([
    database.db.select().from(productionTestSchema.scheduleRuns),
    database.db.select().from(productionTestSchema.productionRuns),
    database.db.select().from(productionTestSchema.workEvents),
  ]);
  return { schedules, runs, events };
};

const replaceStoredSchedule = async (input: {
  inputSnapshot?: typeof inputSnapshot;
  outputPlan?: typeof outputPlan;
}): Promise<void> => {
  await database.db
    .update(productionTestSchema.scheduleRuns)
    .set(input)
    .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
};

const expectConflictWithoutPartialState = async (input: {
  code:
    | 'production_shift_window_invalid'
    | 'schedule_warning_acknowledgement_invalid'
    | 'schedule_has_no_batches'
    | 'batch_capacity_exceeded'
    | 'batch_stage_count_invalid'
    | 'batch_has_no_orders'
    | 'batch_stage_order_invalid'
    | 'stage_pulse_mismatch'
    | 'batch_stage_gap_invalid'
    | 'order_split_across_batches'
    | 'schedule_not_current';
  mutate?: () => Promise<void>;
  command?: ReturnType<typeof serializedCommand>;
  policy?: AcceptSchedulePolicy;
}): Promise<void> => {
  await seedAcceptance();
  await input.mutate?.();
  const before = await acceptanceDurableState();
  await expect(
    executeSerialized(
      makeExecute({
        eventId: ids.event1,
        ...(input.policy === undefined ? {} : { policy: input.policy }),
      }),
      input.command ?? serializedCommand(),
    ),
  ).resolves.toMatchObject({
    kind: 'failure',
    failure: { kind: 'conflict', code: input.code },
  });
  expect(await acceptanceDurableState()).toEqual(before);
};

describe('accept schedule serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'accepts once, sorts persisted warnings, replays, and treats caller order as idempotent identity',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedAcceptance();
          let committed = false;
          const observeUnitOfWork: ProductionResultUnitOfWorkObserver = (
            unitOfWork,
          ) => ({
            transaction: async (work) => {
              const outcome = await unitOfWork.transaction(work);
              committed = true;
              return outcome;
            },
          });
          const execute = makeExecute({
            eventId: ids.event1,
            observeUnitOfWork,
          });
          const request = serializedCommand();

          await expect(executeSerialized(execute, request)).resolves.toEqual({
            kind: 'success',
            value: {
              scheduleRunId: ids.schedule,
              productionShiftId: ids.shift,
              acceptedAt: now.toISOString(),
              replayed: false,
            },
          });
          expect(committed).toBe(true);
          await expect(
            executeSerialized(execute, request),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { replayed: true },
          });
          await expect(
            executeSerialized(
              execute,
              serializedCommand({
                acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
              }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });

          expect(await scheduleState()).toEqual({
            status: 'accepted',
            acceptedAt: now,
            acceptedBy: ids.actor,
            acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
          });
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            id: ids.event1,
            locationId,
            eventType: 'schedule_accepted',
            entityType: 'schedule_run',
            entityId: ids.schedule,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'accept-schedule-postgres-command-1',
            payload: {
              scheduleRunId: ids.schedule,
              acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
              _idempotency: {
                version: 1,
                command: {
                  operation: 'schedule_accepted',
                  locationId,
                  actorId: ids.actor,
                  target: {
                    entityType: 'schedule_run',
                    entityId: ids.schedule,
                  },
                  expectedVersion: null,
                  payload: {
                    expectedOutputPlanHash: outputHash,
                    acknowledgedWarningCodes: [
                      'SHIFT_OVERFLOW',
                      'OVERSIZED_ORDER',
                    ],
                  },
                },
                result: {
                  scheduleRunId: ids.schedule,
                  productionShiftId: ids.shift,
                  acceptedAt: now.toISOString(),
                  replayed: false,
                },
              },
            },
          });
          expect(await liveRevision()).toBe(1);
          await expect(
            database.db.select().from(productionTestSchema.productionRuns),
          ).resolves.toEqual([]);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'uses the after-lock replay to collapse concurrent identical acceptance',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedAcceptance();
          const barrier = firstReadBarrier();
          const transformRepository = gateFirstReplayRead(barrier);
          const first = makeExecute({
            eventId: ids.raceEvent1,
            transformRepository,
          });
          const second = makeExecute({
            eventId: ids.raceEvent2,
            transformRepository,
          });
          const request = serializedCommand({
            idempotencyKey: 'accept-schedule-concurrent-replay',
          });

          const outcomes = await Promise.all([
            executeSerialized(first, request),
            executeSerialized(second, request),
          ]);
          expect(barrier.arrivals()).toBe(2);
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
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect(await liveRevision()).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes different-key acceptance so one succeeds and one sees non-draft state',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedAcceptance();
          const barrier = firstReadBarrier();
          const transformRepository = gateFirstReplayRead(barrier);
          const first = makeExecute({
            eventId: ids.raceEvent1,
            transformRepository,
          });
          const second = makeExecute({
            eventId: ids.raceEvent2,
            transformRepository,
          });

          const outcomes = await Promise.all([
            executeSerialized(
              first,
              serializedCommand({ idempotencyKey: 'accept-schedule-race-1' }),
            ),
            executeSerialized(
              second,
              serializedCommand({ idempotencyKey: 'accept-schedule-race-2' }),
            ),
          ]);
          expect(
            outcomes.filter(({ kind }) => kind === 'success'),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({ code: 'schedule_not_draft' }),
            }),
          );
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect(await liveRevision()).toBe(1);
        },
      },
    ],
  });

  it('rejects a changed locked order snapshot without accepting or receiving', async () => {
    await seedAcceptance();
    await database.db
      .update(productionTestSchema.productionOrders)
      .set({ version: 2 })
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    const execute = makeExecute({ eventId: ids.event1 });

    await expect(
      executeSerialized(execute, serializedCommand()),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'schedule_input_snapshot_stale' },
    });
    expect(await scheduleState()).toMatchObject({
      status: 'draft',
      acceptedAt: null,
      acceptedBy: null,
    });
    await expect(
      database.db.select().from(productionTestSchema.workEvents),
    ).resolves.toEqual([]);
    expect(await liveRevision()).toBe(0);
  });

  it('preserves the late schedule lifecycle CAS without a receipt', async () => {
    await seedAcceptance();
    const execute = makeExecute({
      eventId: ids.event1,
      transformRepository: (native) => ({
        transaction: (work) =>
          native.transaction((repo) =>
            work({
              ...repo,
              acceptSchedule: (input) =>
                repo.acceptSchedule({
                  ...input,
                  lifecycle: { from: 'accepted', state: 'accepted' },
                }),
            }),
          ),
      }),
    });

    await expect(
      executeSerialized(execute, serializedCommand()),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_schedule_already_accepted',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });
    expect(await scheduleState()).toMatchObject({ status: 'draft' });
    await expect(
      database.db.select().from(productionTestSchema.workEvents),
    ).resolves.toEqual([]);
    expect(await liveRevision()).toBe(0);
  });

  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rejects production_shift_window_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'production_shift_window_invalid',
            mutate: () =>
              replaceStoredSchedule({
                inputSnapshot: {
                  ...inputSnapshot,
                  shift: {
                    ...inputSnapshot.shift,
                    endsAt: inputSnapshot.shift.startsAt,
                  },
                },
              }),
          }),
      },
      {
        name: 'rejects schedule_warning_acknowledgement_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'schedule_warning_acknowledgement_invalid',
            command: serializedCommand({
              acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'SHIFT_OVERFLOW'],
            }),
          }),
      },
      {
        name: 'rejects schedule_has_no_batches without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'schedule_has_no_batches',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: { ...outputPlan, batches: [] },
              }),
          }),
      },
      {
        name: 'rejects batch_capacity_exceeded without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'batch_capacity_exceeded',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [
                    {
                      ...outputPlan.batches[0]!,
                      derivedWeightLbs: outputPlan.pulseCapacityLbs + 1,
                    },
                  ],
                },
              }),
          }),
      },
      {
        name: 'rejects batch_stage_count_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'batch_stage_count_invalid',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [
                    {
                      ...outputPlan.batches[0]!,
                      stages: outputPlan.batches[0]!.stages.slice(0, 3),
                    },
                  ],
                },
              }),
          }),
      },
      {
        name: 'rejects batch_has_no_orders without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'batch_has_no_orders',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [{ ...outputPlan.batches[0]!, orderIds: [] }],
                },
              }),
          }),
      },
      {
        name: 'rejects batch_stage_order_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'batch_stage_order_invalid',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [
                    {
                      ...outputPlan.batches[0]!,
                      stages: [
                        outputPlan.batches[0]!.stages[1]!,
                        outputPlan.batches[0]!.stages[0]!,
                        outputPlan.batches[0]!.stages[2]!,
                        outputPlan.batches[0]!.stages[3]!,
                      ],
                    },
                  ],
                },
              }),
          }),
      },
      {
        name: 'rejects stage_pulse_mismatch without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'stage_pulse_mismatch',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [
                    {
                      ...outputPlan.batches[0]!,
                      stages: [
                        {
                          ...outputPlan.batches[0]!.stages[0]!,
                          endsAt: '2026-08-22T13:30:00.000Z',
                        },
                        ...outputPlan.batches[0]!.stages.slice(1),
                      ],
                    },
                  ],
                },
              }),
          }),
      },
      {
        name: 'rejects batch_stage_gap_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'batch_stage_gap_invalid',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [
                    {
                      ...outputPlan.batches[0]!,
                      stages: [
                        outputPlan.batches[0]!.stages[0]!,
                        {
                          ...outputPlan.batches[0]!.stages[1]!,
                          startsAt: '2026-08-22T14:30:00.000Z',
                          endsAt: '2026-08-22T15:30:00.000Z',
                        },
                        outputPlan.batches[0]!.stages[2]!,
                        outputPlan.batches[0]!.stages[3]!,
                      ],
                    },
                  ],
                },
              }),
          }),
      },
      {
        name: 'rejects order_split_across_batches without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'order_split_across_batches',
            mutate: () =>
              replaceStoredSchedule({
                outputPlan: {
                  ...outputPlan,
                  batches: [
                    outputPlan.batches[0]!,
                    { ...outputPlan.batches[0]!, sequence: 1 },
                  ],
                },
              }),
          }),
      },
      {
        name: 'rejects schedule_not_current without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectConflictWithoutPartialState({
            code: 'schedule_not_current',
            policy: {
              ...productionRules,
              evaluateCurrentPlanAcceptance: () =>
                result.err({
                  code: 'SCHEDULE_NOT_CURRENT',
                  message: 'The selected schedule is not current.',
                }),
            },
          }),
      },
    ],
  });

  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back schedule acceptance when the late receipt append fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedAcceptance();
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.rollbackEvent,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.rollbackEvent,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'fixture-existing-event',
            payload: {},
          });
          const execute = makeExecute({ eventId: ids.rollbackEvent });

          await expect(
            executeSerialized(
              execute,
              serializedCommand({ idempotencyKey: 'accept-schedule-rollback' }),
            ),
          ).rejects.toMatchObject({
            kind: 'DatabaseError',
            code: 'schedule_accept_failed',
            status: 503,
          });
          expect(await scheduleState()).toEqual({
            status: 'draft',
            acceptedAt: null,
            acceptedBy: null,
            acknowledgedWarningCodes: [],
          });
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect(await liveRevision()).toBe(1);
        },
      },
    ],
  });
});
