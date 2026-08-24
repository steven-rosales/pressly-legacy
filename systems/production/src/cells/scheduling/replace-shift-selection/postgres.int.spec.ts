import { proveOperation } from '@pressly/testkit/operation-proof';
import { replaceShiftSelectionCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { replaceShiftSelectionContract } from './contract.ts';
import {
  makeExecuteReplaceShiftSelection,
  type ExecuteReplaceShiftSelection,
  type ReplaceShiftSelectionRepository,
} from './execute.ts';
import {
  replaceShiftSelectionIdempotency,
  type StoredReplaceShiftSelectionWorkEvent,
} from './idempotency.ts';
import { makeReplaceShiftSelectionPostgresRepository } from './postgres.ts';

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
  actor: '23000000-0000-4000-8000-000000000001',
  shift: '23000000-0000-4000-8000-000000000002',
  sourceOrder1: '23000000-0000-4000-8000-000000000003',
  sourceOrder2: '23000000-0000-4000-8000-000000000004',
  sourceOrder3: '23000000-0000-4000-8000-000000000005',
  fulfillment1: '23000000-0000-4000-8000-000000000006',
  fulfillment2: '23000000-0000-4000-8000-000000000007',
  fulfillment3: '23000000-0000-4000-8000-000000000008',
  demand1: '23000000-0000-4000-8000-000000000009',
  demand2: '23000000-0000-4000-8000-000000000010',
  demand3: '23000000-0000-4000-8000-000000000011',
  productionOrder1: '23000000-0000-4000-8000-000000000012',
  productionOrder2: '23000000-0000-4000-8000-000000000013',
  productionOrder3: '23000000-0000-4000-8000-000000000014',
  config: '23000000-0000-4000-8000-000000000015',
  schedule: '23000000-0000-4000-8000-000000000016',
  event1: '23000000-0000-4000-8000-000000000017',
  event2: '23000000-0000-4000-8000-000000000018',
  raceEvent1: '23000000-0000-4000-8000-000000000019',
  raceEvent2: '23000000-0000-4000-8000-000000000020',
  rollbackEvent: '23000000-0000-4000-8000-000000000021',
} as const;

const locationId = 'location-replace-shift-selection';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-22T14:00:00.000Z');
const oldSelectionTime = new Date('2026-08-22T12:00:00.000Z');

const sourceOrders = [
  {
    sourceOrderId: ids.sourceOrder1,
    fulfillmentId: ids.fulfillment1,
    demandId: ids.demand1,
    productionOrderId: ids.productionOrder1,
    display: 'SELECTION-1',
  },
  {
    sourceOrderId: ids.sourceOrder2,
    fulfillmentId: ids.fulfillment2,
    demandId: ids.demand2,
    productionOrderId: ids.productionOrder2,
    display: 'SELECTION-2',
  },
  {
    sourceOrderId: ids.sourceOrder3,
    fulfillmentId: ids.fulfillment3,
    demandId: ids.demand3,
    productionOrderId: ids.productionOrder3,
    display: 'SELECTION-3',
  },
] as const;

const seedLocationShiftAndOrders = async (): Promise<void> => {
  const dueAt = new Date('2026-08-22T20:00:00.000Z');
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Replace Shift Selection Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-22T13:00:00.000Z'),
    endsAt: new Date('2026-08-22T21:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 4,
    version: 1,
  });
  await database.db.insert(productionTestSchema.orderDemands).values(
    sourceOrders.map((order, index) => ({
      id: order.demandId,
      fulfillmentId: order.fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: String(index + 1).repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: order.display,
      locationId,
      revisionAt: oldSelectionTime,
      phase: 'production_released',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'test_estimate',
      dueAt,
    })),
  );
  await database.db.insert(productionTestSchema.productionOrders).values(
    sourceOrders.map((order) => ({
      id: order.productionOrderId,
      orderDemandId: order.demandId,
      locationId,
      dueAt,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      resolutionState: 'open',
      derivedWeightLbs: 20,
      derivedWeightSource: 'test_estimate',
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: oldSelectionTime,
      intakeVersion: 1,
      version: 1,
      eligibleAt: oldSelectionTime,
    })),
  );
};

const seedSelection = async (
  selectedOrderIds: readonly string[],
  version = 1,
): Promise<void> => {
  await database.db
    .insert(productionTestSchema.productionShiftSelections)
    .values({
      productionShiftId: ids.shift,
      locationId,
      version,
      selectedBy: ids.actor,
      selectedAt: oldSelectionTime,
      updatedAt: oldSelectionTime,
    });
  if (selectedOrderIds.length > 0)
    await database.db
      .insert(productionTestSchema.productionShiftSelectedOrders)
      .values(
        selectedOrderIds.map((productionOrderId) => ({
          productionShiftId: ids.shift,
          locationId,
          productionOrderId,
          selectedBy: ids.actor,
          selectedAt: oldSelectionTime,
        })),
      );
};

const seedCurrentSchedule = async (): Promise<void> => {
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
      assertedBy: ids.actor,
      assertedAt: oldSelectionTime.toISOString(),
    },
    assertedBy: ids.actor,
    publishedAt: oldSelectionTime,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'draft',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 280,
    plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    createdAt: oldSelectionTime,
  });
};

const idSource = (...values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `33000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const serializedCommand = (
  overrides: {
    selectedOrderIds?: readonly string[];
    expectedVersion?: number;
    idempotencyKey?: string;
  } = {},
) => ({
  params: { locationId, productionShiftId: ids.shift },
  body: {
    selectedOrderIds:
      overrides.selectedOrderIds ??
      ([ids.productionOrder2, ids.productionOrder1] as const),
    expectedVersion: overrides.expectedVersion ?? 0,
    idempotencyKey:
      overrides.idempotencyKey ?? 'replace-selection-postgres-command-1',
  },
  actorId: ids.actor,
});

const executeSerialized = async (
  execute: ExecuteReplaceShiftSelection,
  serialized: ReturnType<typeof serializedCommand>,
) => {
  const decoded = replaceShiftSelectionContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success' as const,
        value: replaceShiftSelectionContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure' as const,
        failure: replaceShiftSelectionContract.failure.encode(outcome.failure),
      };
};

const makeExecute = (input: {
  eventId: string;
  signals?: Readonly<{ planSuperseded: () => void }>;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
  transformRepository?: (
    repository: ReplaceShiftSelectionRepository<StoredReplaceShiftSelectionWorkEvent>,
  ) => ReplaceShiftSelectionRepository<StoredReplaceShiftSelectionWorkEvent>;
}): ExecuteReplaceShiftSelection => {
  const idsSource = idSource(input.eventId);
  const native = makeReplaceShiftSelectionPostgresRepository(
    {
      db: database.db,
      ids: idsSource,
      ...(input.observeUnitOfWork === undefined
        ? {}
        : { observeUnitOfWork: input.observeUnitOfWork }),
    },
    productionTestSchema,
  );
  const repo = input.transformRepository?.(native) ?? native;
  return makeExecuteReplaceShiftSelection({
    repo,
    idempotency: replaceShiftSelectionIdempotency,
    policy: productionRules,
    clock: { now: () => now },
    ...(input.signals === undefined ? {} : { signals: input.signals }),
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
    native: ReplaceShiftSelectionRepository<StoredReplaceShiftSelectionWorkEvent>,
  ): ReplaceShiftSelectionRepository<StoredReplaceShiftSelectionWorkEvent> => ({
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

const loadSelectionState = async () => {
  const [selection] = await database.db
    .select()
    .from(productionTestSchema.productionShiftSelections)
    .where(
      eq(
        productionTestSchema.productionShiftSelections.productionShiftId,
        ids.shift,
      ),
    );
  const selected = await database.db
    .select({
      productionOrderId:
        productionTestSchema.productionShiftSelectedOrders.productionOrderId,
      selectedAt: productionTestSchema.productionShiftSelectedOrders.selectedAt,
    })
    .from(productionTestSchema.productionShiftSelectedOrders)
    .where(
      eq(
        productionTestSchema.productionShiftSelectedOrders.productionShiftId,
        ids.shift,
      ),
    )
    .orderBy(
      asc(productionTestSchema.productionShiftSelectedOrders.productionOrderId),
    );
  return { selection, selected };
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

describe('replace shift selection serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'creates version one with ordered rows and one exact replayable receipt',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedLocationShiftAndOrders();
          const execute = makeExecute({ eventId: ids.event1 });
          const request = serializedCommand();

          await expect(executeSerialized(execute, request)).resolves.toEqual({
            kind: 'success',
            value: {
              selection: {
                productionShiftId: ids.shift,
                version: 1,
                selectedOrderIds: [ids.productionOrder1, ids.productionOrder2],
              },
              supersededScheduleRunId: null,
              replayed: false,
            },
          });
          await expect(
            executeSerialized(execute, request),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { replayed: true },
          });
          await expect(
            executeSerialized(
              execute,
              serializedCommand({ selectedOrderIds: [ids.productionOrder3] }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });

          const state = await loadSelectionState();
          expect(state.selection).toMatchObject({
            version: 1,
            selectedBy: ids.actor,
            selectedAt: now,
          });
          expect(
            state.selected.map(({ productionOrderId }) => productionOrderId),
          ).toEqual([ids.productionOrder1, ids.productionOrder2]);
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            id: ids.event1,
            locationId,
            eventType: 'production_shift_selection_replaced',
            entityType: 'production_shift',
            entityId: ids.shift,
            actorId: ids.actor,
            expectedVersion: 0,
            idempotencyKey: 'replace-selection-postgres-command-1',
            payload: {
              selectedOrderIds: [ids.productionOrder1, ids.productionOrder2],
              version: 1,
              supersededScheduleRunId: null,
              _idempotency: {
                version: 1,
                command: {
                  operation: 'production_shift_selection_replaced',
                  locationId,
                  actorId: ids.actor,
                  target: {
                    entityType: 'production_shift',
                    entityId: ids.shift,
                  },
                  expectedVersion: 0,
                  payload: {
                    selectedOrderIds: [
                      ids.productionOrder1,
                      ids.productionOrder2,
                    ],
                  },
                },
                result: {
                  selection: {
                    productionShiftId: ids.shift,
                    version: 1,
                    selectedOrderIds: [
                      ids.productionOrder1,
                      ids.productionOrder2,
                    ],
                  },
                  supersededScheduleRunId: null,
                  replayed: false,
                },
              },
            },
          });
          expect(await liveRevision()).toBe(1);
        },
      },
    ],
  });

  it('audits empty and identical selections without creating or versioning selection state', async () => {
    await seedLocationShiftAndOrders();
    const empty = makeExecute({ eventId: ids.event1 });
    await expect(
      executeSerialized(
        empty,
        serializedCommand({
          selectedOrderIds: [],
          idempotencyKey: 'replace-selection-empty-no-op',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { selection: { version: 0 }, replayed: false },
    });
    expect((await loadSelectionState()).selection).toBeUndefined();

    await database.reset();
    await seedLocationShiftAndOrders();
    await seedSelection([ids.productionOrder1]);
    await seedCurrentSchedule();
    const identical = makeExecute({ eventId: ids.event2 });
    await expect(
      executeSerialized(
        identical,
        serializedCommand({
          selectedOrderIds: [ids.productionOrder1],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-identical-no-op',
        }),
      ),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        selection: {
          productionShiftId: ids.shift,
          version: 1,
          selectedOrderIds: [ids.productionOrder1],
        },
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
    const state = await loadSelectionState();
    expect(state.selection).toMatchObject({
      version: 1,
      selectedAt: oldSelectionTime,
      updatedAt: oldSelectionTime,
    });
    expect(state.selected[0]?.selectedAt).toEqual(oldSelectionTime);
    const [schedule] = await database.db
      .select({ status: productionTestSchema.scheduleRuns.status })
      .from(productionTestSchema.scheduleRuns)
      .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
    expect(schedule?.status).toBe('draft');
    expect(await liveRevision()).toBe(1);
  });

  it('replaces all ordered IDs, supersedes the current plan, commits, then signals once', async () => {
    await seedLocationShiftAndOrders();
    await seedSelection([ids.productionOrder1]);
    await seedCurrentSchedule();
    const trace: string[] = [];
    let committed = false;
    const observeUnitOfWork: ProductionResultUnitOfWorkObserver = (
      unitOfWork,
    ) => ({
      transaction: async (work) => {
        const outcome = await unitOfWork.transaction(work);
        committed = true;
        trace.push('commit');
        return outcome;
      },
    });
    const execute = makeExecute({
      eventId: ids.event1,
      observeUnitOfWork,
      signals: {
        planSuperseded: () => {
          expect(committed).toBe(true);
          trace.push('signal');
        },
      },
    });

    await expect(
      executeSerialized(
        execute,
        serializedCommand({
          selectedOrderIds: [ids.productionOrder3, ids.productionOrder2],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-supersede',
        }),
      ),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        selection: {
          productionShiftId: ids.shift,
          version: 2,
          selectedOrderIds: [ids.productionOrder2, ids.productionOrder3],
        },
        supersededScheduleRunId: ids.schedule,
        replayed: false,
      },
    });
    expect(trace).toEqual(['commit', 'signal']);
    const state = await loadSelectionState();
    expect(state.selection?.version).toBe(2);
    expect(
      state.selected.map(({ productionOrderId }) => productionOrderId),
    ).toEqual([ids.productionOrder2, ids.productionOrder3]);
    const [schedule] = await database.db
      .select({
        status: productionTestSchema.scheduleRuns.status,
        supersededAt: productionTestSchema.scheduleRuns.supersededAt,
      })
      .from(productionTestSchema.scheduleRuns)
      .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
    expect(schedule).toEqual({ status: 'superseded', supersededAt: now });
    expect(await liveRevision()).toBe(1);
  });

  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'uses the after-lock replay to collapse a concurrent identical command and signal once',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedLocationShiftAndOrders();
          await seedSelection([ids.productionOrder1]);
          await seedCurrentSchedule();
          const barrier = firstReadBarrier();
          let signals = 0;
          const transformRepository = gateFirstReplayRead(barrier);
          const first = makeExecute({
            eventId: ids.raceEvent1,
            transformRepository,
            signals: { planSuperseded: () => (signals += 1) },
          });
          const second = makeExecute({
            eventId: ids.raceEvent2,
            transformRepository,
            signals: { planSuperseded: () => (signals += 1) },
          });
          const request = serializedCommand({
            selectedOrderIds: [ids.productionOrder2],
            expectedVersion: 1,
            idempotencyKey: 'replace-selection-concurrent-replay',
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
          expect(signals).toBe(1);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect(await liveRevision()).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes different-key same-version races so one command conflicts without a receipt',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedLocationShiftAndOrders();
          await seedSelection([ids.productionOrder1]);
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
              serializedCommand({
                selectedOrderIds: [ids.productionOrder2],
                expectedVersion: 1,
                idempotencyKey: 'replace-selection-version-race-1',
              }),
            ),
            executeSerialized(
              second,
              serializedCommand({
                selectedOrderIds: [ids.productionOrder3],
                expectedVersion: 1,
                idempotencyKey: 'replace-selection-version-race-2',
              }),
            ),
          ]);
          expect(
            outcomes.filter(({ kind }) => kind === 'success'),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_shift_selection_version_conflict',
              }),
            }),
          );
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect((await loadSelectionState()).selection?.version).toBe(2);
          expect(await liveRevision()).toBe(1);
        },
      },
    ],
  });

  it('preserves the selection CAS when a locked version changes before update', async () => {
    await seedLocationShiftAndOrders();
    await seedSelection([ids.productionOrder1]);
    let signals = 0;
    const execute = makeExecute({
      eventId: ids.rollbackEvent,
      signals: { planSuperseded: () => (signals += 1) },
      transformRepository: (native) => ({
        transaction: (work) =>
          native.transaction((repo) =>
            work({
              ...repo,
              replaceSelection: (input) =>
                repo.replaceSelection({ ...input, currentVersion: 2 }),
            }),
          ),
      }),
    });

    await expect(
      executeSerialized(
        execute,
        serializedCommand({
          selectedOrderIds: [ids.productionOrder2],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-cas-conflict',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_shift_selection_version_conflict' },
    });
    const state = await loadSelectionState();
    expect(state.selection?.version).toBe(1);
    expect(
      state.selected.map(({ productionOrderId }) => productionOrderId),
    ).toEqual([ids.productionOrder1]);
    await expect(
      database.db.select().from(productionTestSchema.workEvents),
    ).resolves.toEqual([]);
    expect(await liveRevision()).toBe(0);
    expect(signals).toBe(0);
  });

  it('rolls back partial selection writes when the current-plan lifecycle CAS loses', async () => {
    await seedLocationShiftAndOrders();
    await seedSelection([ids.productionOrder1]);
    await seedCurrentSchedule();
    let signals = 0;
    const execute = makeExecute({
      eventId: ids.rollbackEvent,
      signals: { planSuperseded: () => (signals += 1) },
      transformRepository: (native) => ({
        transaction: (work) =>
          native.transaction((repo) =>
            work({
              ...repo,
              replaceSelection: (input) =>
                repo.replaceSelection({
                  ...input,
                  supersede:
                    input.supersede === null
                      ? null
                      : {
                          ...input.supersede,
                          lifecycle: {
                            ...input.supersede.lifecycle,
                            from: 'accepted',
                          },
                        },
                }),
            }),
          ),
      }),
    });

    await expect(
      executeSerialized(
        execute,
        serializedCommand({
          selectedOrderIds: [ids.productionOrder2],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-schedule-cas-rollback',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_shift_selection_schedule_version_conflict',
      },
    });
    const state = await loadSelectionState();
    expect(state.selection?.version).toBe(1);
    expect(
      state.selected.map(({ productionOrderId }) => productionOrderId),
    ).toEqual([ids.productionOrder1]);
    const [schedule] = await database.db
      .select({ status: productionTestSchema.scheduleRuns.status })
      .from(productionTestSchema.scheduleRuns)
      .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
    expect(schedule?.status).toBe('draft');
    await expect(
      database.db.select().from(productionTestSchema.workEvents),
    ).resolves.toEqual([]);
    expect(await liveRevision()).toBe(0);
    expect(signals).toBe(0);
  });

  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back selection and plan when the late work-event receipt fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedLocationShiftAndOrders();
          await seedSelection([ids.productionOrder1]);
          await seedCurrentSchedule();
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
          let signals = 0;
          const execute = makeExecute({
            eventId: ids.rollbackEvent,
            signals: { planSuperseded: () => (signals += 1) },
          });

          await expect(
            executeSerialized(
              execute,
              serializedCommand({
                selectedOrderIds: [ids.productionOrder2],
                expectedVersion: 1,
                idempotencyKey: 'replace-selection-receipt-rollback',
              }),
            ),
          ).rejects.toMatchObject({
            kind: 'DatabaseError',
            code: 'production_shift_selection_failed',
            status: 503,
          });
          const state = await loadSelectionState();
          expect(state.selection?.version).toBe(1);
          expect(
            state.selected.map(({ productionOrderId }) => productionOrderId),
          ).toEqual([ids.productionOrder1]);
          const [schedule] = await database.db
            .select({ status: productionTestSchema.scheduleRuns.status })
            .from(productionTestSchema.scheduleRuns)
            .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
          expect(schedule?.status).toBe('draft');
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          expect(await liveRevision()).toBe(1);
          expect(signals).toBe(0);
        },
      },
    ],
  });
});
