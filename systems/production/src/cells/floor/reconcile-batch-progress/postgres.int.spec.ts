import { proveOperation } from '@pressly/testkit/operation-proof';
import { reconcileBatchProgressCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteReconcileBatchProgress } from './execute.ts';
import { reconcileBatchProgressIdempotency } from './idempotency.ts';
import { makeReconcileBatchProgressPostgresRepository } from './postgres.ts';

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
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 4,
});
beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const ids = {
  actor: '13000000-0000-4000-8000-000000000001',
  shift: '13000000-0000-4000-8000-000000000002',
  config: '13000000-0000-4000-8000-000000000003',
  schedule: '13000000-0000-4000-8000-000000000004',
  run: '13000000-0000-4000-8000-000000000005',
  batch: '13000000-0000-4000-8000-000000000006',
  stations: [
    '13000000-0000-4000-8000-000000000011',
    '13000000-0000-4000-8000-000000000012',
    '13000000-0000-4000-8000-000000000013',
    '13000000-0000-4000-8000-000000000014',
  ],
  stages: [
    '13000000-0000-4000-8000-000000000021',
    '13000000-0000-4000-8000-000000000022',
    '13000000-0000-4000-8000-000000000023',
    '13000000-0000-4000-8000-000000000024',
  ],
} as const;
const kinds = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
const locationId = 'location-1';
const now = new Date('2026-08-21T15:00:00.000Z');
const makeIds = (): IdSource => {
  let next = 1;
  return {
    next: () => `23000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  };
};

const seed = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Reconciliation Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: new Date('2026-08-21T08:00:00.000Z'),
    endsAt: new Date('2026-08-21T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.stations).values(
    kinds.map((kind, index) => ({
      id: ids.stations[index]!,
      locationId,
      kind,
      label: kind,
      sortOrder: index + 1,
    })),
  );
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {},
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
    makespanMinutes: 56,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
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
    queueVersion: 1,
    plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 0,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 40,
    pulseMinutes: 56,
    plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
    version: 1,
  });
  await database.db.insert(productionTestSchema.stageRuns).values(
    kinds.map((stageKind, index) => ({
      id: ids.stages[index]!,
      locationId,
      productionBatchId: ids.batch,
      stationId: ids.stations[index]!,
      stageKind,
      status: 'planned',
      plannedStartAt: new Date(`2026-08-21T${14 + index}:00:00.000Z`),
      plannedEndAt: new Date(`2026-08-21T${15 + index}:00:00.000Z`),
      version: 1,
    })),
  );
};

const command = (key = 'reconcile-command-1') => ({
  locationId,
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  expectedStageVersions: ids.stages.map((stageRunId) => ({
    stageRunId,
    version: 1,
  })),
  target: 'sorting_started' as const,
  reason: 'updates_missed' as const,
  note: null,
  machineIds: [],
  confirmation: null,
  idempotencyKey: key,
  actorId: ids.actor,
});

describe('reconcile batch progress native Postgres cell', () => {
  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'previews without mutation, commits once, signals, and replays',
        proves: ['postgres-commit', 'same-payload-replay'],
        run: async () => {
          await seed();
          const progressReconciled = vi.fn();
          const execute = makeExecuteReconcileBatchProgress({
            repo: makeReconcileBatchProgressPostgresRepository(
              {
                db: database.db,
                ids: makeIds(),
              },
              productionTestSchema,
            ),
            idempotency: reconcileBatchProgressIdempotency,
            policy: productionRules,
            clock: { now: () => now },
            signals: { progressReconciled },
          });
          const preview = await execute(command());
          expect(preview).toMatchObject({
            kind: 'success',
            value: { status: 'confirmation_required' },
          });
          if (
            preview.kind !== 'success' ||
            preview.value.status !== 'confirmation_required'
          )
            return;
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(0);

          const confirmed = {
            ...command(),
            confirmation: preview.value.confirmation,
          };
          await expect(execute(confirmed)).resolves.toMatchObject({
            kind: 'success',
            value: {
              status: 'reconciled',
              milestone: 'sorting_started',
              queueVersion: 2,
              batchVersion: 2,
              replayed: false,
            },
          });
          await expect(execute(confirmed)).resolves.toMatchObject({
            kind: 'success',
            value: { status: 'reconciled', replayed: true },
          });

          const stages = await database.db
            .select({
              status: productionTestSchema.stageRuns.status,
              version: productionTestSchema.stageRuns.version,
            })
            .from(productionTestSchema.stageRuns)
            .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt));
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          const [location] = await database.db
            .select({
              revision: productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(stages).toEqual([
            { status: 'started', version: 2 },
            { status: 'planned', version: 1 },
            { status: 'planned', version: 1 },
            { status: 'planned', version: 1 },
          ]);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            eventType: 'batch_progress_reconciled',
          });
          expect(location?.revision).toBe(1);
          expect(progressReconciled).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes confirmed same-version progress so one signal commits',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const progressReconciled = vi.fn();
          const makeExecute = () =>
            makeExecuteReconcileBatchProgress({
              repo: makeReconcileBatchProgressPostgresRepository(
                {
                  db: database.db,
                  ids: makeIds(),
                },
                productionTestSchema,
              ),
              idempotency: reconcileBatchProgressIdempotency,
              policy: productionRules,
              clock: { now: () => now },
              signals: { progressReconciled },
            });
          const preview = await makeExecute()(command('reconcile-preview'));
          if (
            preview.kind !== 'success' ||
            preview.value.status !== 'confirmation_required'
          )
            return;
          const outcomes = await Promise.all([
            makeExecute()({
              ...command('reconcile-race-1'),
              confirmation: preview.value.confirmation,
            }),
            makeExecute()({
              ...command('reconcile-race-2'),
              confirmation: preview.value.confirmation,
            }),
          ]);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'success'),
          ).toHaveLength(1);
          expect(
            outcomes.filter((outcome) => outcome.kind === 'failure'),
          ).toHaveLength(1);
          expect(
            await database.db.select().from(productionTestSchema.workEvents),
          ).toHaveLength(1);
          expect(progressReconciled).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'returns typed not-found without changing the execution graph',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const execute = makeExecuteReconcileBatchProgress({
            repo: makeReconcileBatchProgressPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: reconcileBatchProgressIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          const stagesBefore = await database.db
            .select()
            .from(productionTestSchema.stageRuns)
            .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt));
          const [batchBefore] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          const [runBefore] = await database.db
            .select()
            .from(productionTestSchema.productionRuns)
            .where(eq(productionTestSchema.productionRuns.id, ids.run));

          await expect(
            execute({
              ...command('reconcile-missing-batch'),
              productionBatchId: ids.config,
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'not_found',
              code: 'production_batch_not_found',
            },
          });

          await expect(
            database.db
              .select()
              .from(productionTestSchema.stageRuns)
              .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt)),
          ).resolves.toEqual(stagesBefore);
          const [batchAfter] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          const [runAfter] = await database.db
            .select()
            .from(productionTestSchema.productionRuns)
            .where(eq(productionTestSchema.productionRuns.id, ids.run));
          expect(batchAfter).toEqual(batchBefore);
          expect(runAfter).toEqual(runBefore);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toEqual([]);
        },
      },
      {
        name: 'returns typed conflict without changing the execution graph',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const execute = makeExecuteReconcileBatchProgress({
            repo: makeReconcileBatchProgressPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: reconcileBatchProgressIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          const stagesBefore = await database.db
            .select()
            .from(productionTestSchema.stageRuns)
            .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt));
          const [batchBefore] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          const [runBefore] = await database.db
            .select()
            .from(productionTestSchema.productionRuns)
            .where(eq(productionTestSchema.productionRuns.id, ids.run));

          await expect(
            execute({
              ...command('reconcile-stale-queue'),
              expectedQueueVersion: 2,
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_queue_version_conflict',
            },
          });

          await expect(
            database.db
              .select()
              .from(productionTestSchema.stageRuns)
              .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt)),
          ).resolves.toEqual(stagesBefore);
          const [batchAfter] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          const [runAfter] = await database.db
            .select()
            .from(productionTestSchema.productionRuns)
            .where(eq(productionTestSchema.productionRuns.id, ids.run));
          expect(batchAfter).toEqual(batchBefore);
          expect(runAfter).toEqual(runBefore);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toEqual([]);
        },
      },
      {
        name: 'rejects divergent confirmed progress reuse without changing the milestone',
        proves: [
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const execute = makeExecuteReconcileBatchProgress({
            repo: makeReconcileBatchProgressPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: reconcileBatchProgressIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          const preview = await execute(command('reconcile-divergent-preview'));
          if (
            preview.kind !== 'success' ||
            preview.value.status !== 'confirmation_required'
          )
            return;
          const committed = {
            ...command('reconcile-divergent-key'),
            confirmation: preview.value.confirmation,
          };
          await expect(execute(committed)).resolves.toMatchObject({
            kind: 'success',
            value: { status: 'reconciled' },
          });
          const beforeStages = await database.db
            .select({
              id: productionTestSchema.stageRuns.id,
              status: productionTestSchema.stageRuns.status,
            })
            .from(productionTestSchema.stageRuns)
            .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt));

          await expect(
            execute({ ...committed, note: 'different replay payload' }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });
          await expect(
            database.db
              .select({
                id: productionTestSchema.stageRuns.id,
                status: productionTestSchema.stageRuns.status,
              })
              .from(productionTestSchema.stageRuns)
              .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt)),
          ).resolves.toEqual(beforeStages);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'collapses concurrent identical confirmed progress after context locking',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const makeExecute = () =>
            makeExecuteReconcileBatchProgress({
              repo: makeReconcileBatchProgressPostgresRepository(
                { db: database.db, ids: makeIds() },
                productionTestSchema,
              ),
              idempotency: reconcileBatchProgressIdempotency,
              policy: productionRules,
              clock: { now: () => now },
            });
          const preview = await makeExecute()(
            command('reconcile-same-key-preview'),
          );
          if (
            preview.kind !== 'success' ||
            preview.value.status !== 'confirmation_required'
          )
            return;
          const input = {
            ...command('reconcile-same-key-race'),
            confirmation: preview.value.confirmation,
          };

          const outcomes = await Promise.all([
            makeExecute()(input),
            makeExecute()(input),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          const [sorting] = await database.db
            .select({
              status: productionTestSchema.stageRuns.status,
              version: productionTestSchema.stageRuns.version,
            })
            .from(productionTestSchema.stageRuns)
            .where(eq(productionTestSchema.stageRuns.id, ids.stages[0]!));
          expect(sorting).toEqual({ status: 'started', version: 2 });
        },
      },
      {
        name: 'rolls back the reconciled stages when the late event insert fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          const collision = '23000000-0000-4000-8000-000000000001';
          await database.db.insert(productionTestSchema.workEvents).values({
            id: collision,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.batch,
            actorId: ids.actor,
            idempotencyKey: 'fixture-reconcile-event',
            payload: {},
          });
          const execute = makeExecuteReconcileBatchProgress({
            repo: makeReconcileBatchProgressPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: reconcileBatchProgressIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          const preview = await execute(command('reconcile-rollback-preview'));
          if (
            preview.kind !== 'success' ||
            preview.value.status !== 'confirmation_required'
          )
            return;

          await expect(
            execute({
              ...command('reconcile-late-event-failure'),
              confirmation: preview.value.confirmation,
            }),
          ).rejects.toMatchObject({ code: 'progress_reconciliation_failed' });
          const stages = await database.db
            .select({
              status: productionTestSchema.stageRuns.status,
              version: productionTestSchema.stageRuns.version,
            })
            .from(productionTestSchema.stageRuns)
            .orderBy(asc(productionTestSchema.stageRuns.plannedStartAt));
          expect(stages).toEqual([
            { status: 'planned', version: 1 },
            { status: 'planned', version: 1 },
            { status: 'planned', version: 1 },
            { status: 'planned', version: 1 },
          ]);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
    ],
  });
});
