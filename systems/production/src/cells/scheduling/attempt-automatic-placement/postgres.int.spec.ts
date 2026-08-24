import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresTransaction } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { proveOperation } from '@pressly/testkit/operation-proof';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { makeExecuteAttemptAutomaticPlacement } from './execute.ts';
import { attemptAutomaticPlacementCellDeclaration } from './cell.ts';
import {
  makeAttemptAutomaticPlacementPostgresRepository,
  type ExecuteAutomaticPlacementWithDatabase,
} from './postgres.ts';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ATTEMPT_PLACEMENT_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const suffix = `${process.pid}_${Date.now().toString(36)}`;
const databaseName = `pressly_attempt_placement_${suffix}_test`;
const databaseUrl = (() => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.search = '';
  return url.toString();
})();
const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });
const dropDatabase = (): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    databaseName,
  ]);
};
const databaseExists = (): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${databaseName}'`,
  ]).trim() === databaseName;

const tableNames = [
  'work_events',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_shifts',
  'production_orders',
  'order_demands',
  'production_locations',
] as const;

type Runtime = TestDatabaseRuntime & Readonly<{ setup: () => Promise<void> }>;
const database: Runtime = Object.freeze({
  ...createTestDatabaseRuntime({
    databaseUrl,
    tableNames,
    maxConnections: 6,
  }),
  setup: async () => {
    dropDatabase();
    run('createdb', [
      '--maintenance-db',
      adminDatabaseUrl,
      '--template',
      'template0',
      databaseName,
    ]);
    run('pnpm', ['exec', 'tsx', 'tooling/postgres/migrate.ts'], {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
    });
    await database.check();
  },
});

const ids = {
  business: '65000000-0000-4000-8000-000000000001',
  actor: '65000000-0000-4000-8000-000000000002',
  sourceOrder: '65000000-0000-4000-8000-000000000003',
  fulfillment: '65000000-0000-4000-8000-000000000004',
  demand: '65000000-0000-4000-8000-000000000005',
  productionOrder: '65000000-0000-4000-8000-000000000006',
  shiftA: '65000000-0000-4000-8000-000000000007',
  configA: '65000000-0000-4000-8000-000000000008',
  scheduleA: '65000000-0000-4000-8000-000000000009',
  runA: '65000000-0000-4000-8000-000000000010',
  shiftB: '65000000-0000-4000-8000-000000000011',
  configB: '65000000-0000-4000-8000-000000000012',
  scheduleB: '65000000-0000-4000-8000-000000000013',
  runB: '65000000-0000-4000-8000-000000000014',
} as const;
const locationId = 'attempt-placement-location';
const now = new Date('2026-08-22T15:00:00.000Z');
const startsAt = new Date('2026-08-22T13:00:00.000Z');
const endsAt = new Date('2026-08-22T22:00:00.000Z');

const sequenceIds = (): IdSource => {
  let value = 100;
  return {
    next: () => {
      value += 1;
      return `65000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
    },
  };
};

const seedOrder = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId: ids.business,
    name: 'Attempt Placement Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'ATTEMPT-1',
    locationId,
    revisionAt: startsAt,
    phase: 'production_released',
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'test_estimate',
    dueAt: endsAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt: endsAt,
    operationalStatus: 'eligible',
    executionStatus: 'unassigned',
    resolutionState: 'open',
    derivedWeightLbs: 20,
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeVersion: 1,
    eligibleAt: startsAt,
  });
};

const seedRun = async (which: 'A' | 'B'): Promise<void> => {
  const suffixIds =
    which === 'A'
      ? {
          shift: ids.shiftA,
          config: ids.configA,
          schedule: ids.scheduleA,
          run: ids.runA,
        }
      : {
          shift: ids.shiftB,
          config: ids.configB,
          schedule: ids.scheduleB,
          run: ids.runB,
        };
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: suffixIds.shift,
    locationId,
    startsAt,
    endsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: suffixIds.config,
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: which === 'A' ? 1 : 2,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: suffixIds.schedule,
    locationId,
    productionShiftId: suffixIds.shift,
    schedulerConfigId: suffixIds.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: endsAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: startsAt,
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: suffixIds.run,
    locationId,
    productionShiftId: suffixIds.shift,
    scheduleRunId: suffixIds.schedule,
    status: 'started',
    startedAt: startsAt,
    queueVersion: which === 'A' ? 4 : 7,
    plannedCompletionAt: endsAt,
    version: 1,
  });
};

const makeExecutor = (
  input: {
    placeAutomatically?: Parameters<
      typeof makeAttemptAutomaticPlacementPostgresRepository
    >[0]['placeAutomatically'];
    clock?: Readonly<{ now: () => Date }>;
    observations?: string[];
  } = {},
) => {
  const placeAutomatically =
    input.placeAutomatically ??
    vi.fn(async ({ command }) => ({
      kind: 'success' as const,
      value: {
        status: 'placed' as const,
        mode: 'automatic' as const,
        productionRunId: command.productionRunId,
        productionOrderId: command.productionOrderId,
        productionBatchId: '65000000-0000-4000-8000-000000000099',
        createdBatch: false,
        affectedBatchIds: ['65000000-0000-4000-8000-000000000099'],
        queueVersion: command.expectedQueueVersion + 1,
        proposalHash: 'c'.repeat(64),
        plannedCompletionAt: endsAt.toISOString(),
        overtimeMinutes: 0,
        replayed: false,
      },
    }));
  const repo = makeAttemptAutomaticPlacementPostgresRepository(
    {
      db: database.db,
      ids: sequenceIds(),
      placeAutomatically,
      ...(input.observations === undefined
        ? {}
        : {
            observeUnitOfWork: (unitOfWork) => ({
              transaction: async (work) => {
                try {
                  const outcome = await unitOfWork.transaction(work);
                  input.observations?.push(outcome.tag);
                  return outcome;
                } catch (error) {
                  input.observations?.push('threw');
                  throw error;
                }
              },
            }),
          }),
    },
    productionTestSchema,
  );
  return {
    execute: makeExecuteAttemptAutomaticPlacement({
      repo,
      clock: input.clock ?? { now: () => new Date(now) },
    }),
    placeAutomatically,
  };
};

const command = {
  locationId,
  productionOrderId: ids.productionOrder,
  actorId: ids.actor,
  authorizedAction: 'production:queue' as const,
  idempotencyKey: 'attempt-placement-1',
};

const placementDurableState = async () => {
  const [ordersState, runs, batches, memberships, attempts, events] =
    await Promise.all([
      database.db.select().from(productionTestSchema.productionOrders),
      database.db.select().from(productionTestSchema.productionRuns),
      database.db.select().from(productionTestSchema.productionBatches),
      database.db.select().from(productionTestSchema.productionBatchOrders),
      database.db
        .select()
        .from(productionTestSchema.productionOrderStageAttempts),
      database.db.select().from(productionTestSchema.workEvents),
    ]);
  return {
    orders: ordersState,
    runs,
    batches,
    memberships,
    attempts,
    events,
  };
};

const expectDelegatedFailureWithoutPartialState = async (
  code:
    | 'production_order_execution_event_not_allowed'
    | 'production_order_execution_state_invalid'
    | 'production_order_execution_transition_invalid'
    | 'production_placement_context_not_found'
    | 'production_placement_order_version_conflict'
    | 'production_placement_queue_version_conflict'
    | 'production_placement_stage_version_conflict',
): Promise<void> => {
  await seedOrder();
  await seedRun('A');
  const before = await placementDurableState();
  const executor = makeExecutor({
    placeAutomatically: async () => ({
      kind: 'failure',
      failure: {
        kind:
          code === 'production_placement_context_not_found'
            ? ('not_found' as const)
            : ('conflict' as const),
        code,
        message: `Fixture ${code}.`,
        safeMessage: `Fixture ${code}.`,
      },
    }),
  });
  await expect(executor.execute(command)).resolves.toMatchObject({
    kind: 'failure',
    failure: {
      kind:
        code === 'production_placement_context_not_found'
          ? 'not_found'
          : 'conflict',
      code,
    },
  });
  expect(await placementDurableState()).toEqual(before);
};

beforeAll(database.setup, 180_000);
beforeEach(database.reset);
afterAll(async () => {
  await database.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
}, 30_000);

describe('attempt-automatic-placement native PostgreSQL cell', () => {
  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'persists awaiting-run once, replays, and rejects divergence without partial state',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedOrder();
          const nowReads = vi.fn(() => new Date(now));
          const observations: string[] = [];
          const executor = makeExecutor({
            clock: { now: nowReads },
            observations,
          });

          await expect(executor.execute(command)).resolves.toEqual({
            kind: 'success',
            value: null,
          });
          await expect(executor.execute(command)).resolves.toEqual({
            kind: 'success',
            value: null,
          });
          await expect(
            executor.execute({ ...command, actorId: 'different-actor' }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          expect(nowReads).toHaveBeenCalledTimes(3);
          expect(observations).toEqual(['ok', 'ok', 'err']);
          const [order] = await database.db
            .select({
              pendingPlacement:
                productionTestSchema.productionOrders.pendingPlacement,
            })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(order?.pendingPlacement).toEqual({
            status: 'awaiting_run',
            reason: 'no_started_run',
            message: 'This order is waiting for a production run to start.',
          });
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents)
            .orderBy(asc(productionTestSchema.workEvents.id));
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            eventType: 'production_order_placement_pending',
            idempotencyKey: command.idempotencyKey,
            payload: {
              placement: { status: 'awaiting_run' },
              _idempotency: {
                version: 1,
                command: {
                  operation: 'production_order_automatic_placement_pending',
                  expectedVersion: null,
                },
                result: { status: 'awaiting_run' },
              },
            },
          });
          const [location] = await database.db
            .select({
              liveRevision:
                productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  it('persists sorted ambiguous run identity without delegating', async () => {
    await seedOrder();
    await seedRun('B');
    await seedRun('A');
    const executor = makeExecutor();

    await expect(executor.execute(command)).resolves.toEqual({
      kind: 'success',
      value: null,
    });
    expect(executor.placeAutomatically).not.toHaveBeenCalled();
    const [order] = await database.db
      .select({
        pendingPlacement:
          productionTestSchema.productionOrders.pendingPlacement,
      })
      .from(productionTestSchema.productionOrders)
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    expect(order?.pendingPlacement).toEqual({
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: [ids.runA, ids.runB],
    });
  });

  it('holds the location scheduling lock through one-run delegation', async () => {
    await seedOrder();
    await seedRun('A');
    let delegated = false;
    const delegate: ExecuteAutomaticPlacementWithDatabase = async ({
      database: transaction,
      command: delegatedCommand,
    }) => {
      delegated = true;
      const [row] = await transaction.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_locks where pid = pg_backend_pid() and locktype = 'advisory' and granted = true`,
      );
      expect((row?.count ?? 0) > 0).toBe(true);
      return {
        kind: 'success' as const,
        value: {
          status: 'not_placed' as const,
          mode: 'automatic' as const,
          productionRunId: delegatedCommand.productionRunId,
          productionOrderId: delegatedCommand.productionOrderId,
          reason: 'no_mutable_position' as const,
          message: 'No mutable position.',
          queueVersion: delegatedCommand.expectedQueueVersion,
          replayed: false,
        },
      };
    };
    const placeAutomatically = vi.fn(delegate);
    const executor = makeExecutor({ placeAutomatically });

    const result = await executor.execute(command);
    expect(delegated).toBe(true);
    expect(result).toEqual({
      kind: 'success',
      value: {
        status: 'not_placed',
        mode: 'automatic',
        productionRunId: ids.runA,
        productionOrderId: ids.productionOrder,
        reason: 'no_mutable_position',
        message: 'No mutable position.',
        queueVersion: 4,
        replayed: false,
      },
    });
    expect(placeAutomatically).toHaveBeenCalledWith({
      database: expect.anything(),
      command: {
        ...command,
        productionRunId: ids.runA,
        expectedQueueVersion: 4,
      },
    });
  });

  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'propagates production_order_execution_event_not_allowed without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_order_execution_event_not_allowed',
          ),
      },
      {
        name: 'propagates production_order_execution_state_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_order_execution_state_invalid',
          ),
      },
      {
        name: 'propagates production_order_execution_transition_invalid without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_order_execution_transition_invalid',
          ),
      },
      {
        name: 'propagates production_placement_context_not_found without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_placement_context_not_found',
          ),
      },
      {
        name: 'propagates production_placement_order_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_placement_order_version_conflict',
          ),
      },
      {
        name: 'propagates production_placement_queue_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_placement_queue_version_conflict',
          ),
      },
      {
        name: 'propagates production_placement_stage_version_conflict without partial durable state',
        proves: ['expected-rejection-no-partial-write'],
        run: () =>
          expectDelegatedFailureWithoutPartialState(
            'production_placement_stage_version_conflict',
          ),
      },
    ],
  });

  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'waits on the scheduling advisory lock before discovering the run',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seedOrder();
          await seedRun('A');
          let release: () => void = () => undefined;
          let ready: () => void = () => undefined;
          const released = new Promise<void>((resolve) => {
            release = resolve;
          });
          const acquired = new Promise<void>((resolve) => {
            ready = resolve;
          });
          const blocker = database.db.transaction(
            async (transaction: PostgresTransaction) => {
              await transaction.execute(
                sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
              );
              ready();
              await released;
            },
          );
          await acquired;
          const executor = makeExecutor();
          const outcome = executor.execute(command);
          await new Promise<void>((resolve) => setTimeout(resolve, 30));
          expect(executor.placeAutomatically).not.toHaveBeenCalled();
          release();
          await blocker;
          await expect(outcome).resolves.toMatchObject({ kind: 'success' });
          expect(executor.placeAutomatically).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent same-key pending attempts to one durable effect',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedOrder();
          const outcomes = await Promise.all([
            makeExecutor().execute(command),
            makeExecutor().execute(command),
          ]);
          expect(outcomes).toEqual([
            { kind: 'success', value: null },
            { kind: 'success', value: null },
          ]);
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents)
            .where(
              eq(
                productionTestSchema.workEvents.idempotencyKey,
                command.idempotencyKey,
              ),
            );
          expect(events).toHaveLength(1);
          const [location] = await database.db
            .select({
              liveRevision:
                productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(location?.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back a delegated write when the placement mechanism throws',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedOrder();
          await seedRun('A');
          const executor = makeExecutor({
            placeAutomatically: async ({ database: transaction }) => {
              await transaction
                .update(productionTestSchema.productionOrders)
                .set({
                  pendingPlacement: {
                    status: 'awaiting_run',
                    reason: 'no_started_run',
                    message: 'Must roll back.',
                  },
                })
                .where(
                  eq(
                    productionTestSchema.productionOrders.id,
                    ids.productionOrder,
                  ),
                );
              throw { fault: 'after-write' };
            },
          });

          await expect(executor.execute(command)).rejects.toMatchObject({
            code: 'production_order_placement_failed',
            status: 503,
          });
          const [order] = await database.db
            .select({
              pendingPlacement:
                productionTestSchema.productionOrders.pendingPlacement,
            })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(order?.pendingPlacement).toBeNull();
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toEqual([]);
        },
      },
    ],
  });
});
