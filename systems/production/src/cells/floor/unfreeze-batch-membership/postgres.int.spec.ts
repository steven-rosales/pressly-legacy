import { proveOperation } from '@pressly/testkit/operation-proof';
import { unfreezeBatchMembershipCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteUnfreezeBatchMembership } from './execute.ts';
import { unfreezeBatchMembershipIdempotency } from './idempotency.ts';
import { makeUnfreezeBatchMembershipPostgresRepository } from './postgres.ts';

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
    'production_batches',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 4,
});
beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const ids = {
  actor: '12000000-0000-4000-8000-000000000001',
  shift: '12000000-0000-4000-8000-000000000002',
  config: '12000000-0000-4000-8000-000000000003',
  schedule: '12000000-0000-4000-8000-000000000004',
  run: '12000000-0000-4000-8000-000000000005',
  batch: '12000000-0000-4000-8000-000000000006',
} as const;
const locationId = 'location-1';
const now = new Date('2026-08-21T15:00:00.000Z');
const makeIds = (): IdSource => {
  let next = 1;
  return {
    next: () => `22000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  };
};

const seed = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Unfreeze Facility',
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
    membershipFrozenAt: new Date('2026-08-21T14:00:00.000Z'),
    membershipFrozenBy: ids.actor,
    version: 1,
  });
};

const command = (key = 'unfreeze-command-1') => ({
  locationId,
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  idempotencyKey: key,
  actorId: ids.actor,
});

describe('unfreeze batch membership native Postgres cell', () => {
  proveOperation({
    operationId: 'production.unfreeze-batch-membership.v1',
    declaration: unfreezeBatchMembershipCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits one mutable projection, advances revision, and replays',
        proves: ['postgres-commit', 'same-payload-replay'],
        run: async () => {
          await seed();
          const execute = makeExecuteUnfreezeBatchMembership({
            repo: makeUnfreezeBatchMembershipPostgresRepository(
              {
                db: database.db,
                ids: makeIds(),
              },
              productionTestSchema,
            ),
            idempotency: unfreezeBatchMembershipIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
            value: {
              queueVersion: 2,
              batchVersion: 2,
              membership: { state: 'mutable' },
              replayed: false,
            },
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
            value: { replayed: true },
          });
          const [batch] = await database.db
            .select({
              frozenAt:
                productionTestSchema.productionBatches.membershipFrozenAt,
              frozenBy:
                productionTestSchema.productionBatches.membershipFrozenBy,
            })
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          const [location] = await database.db
            .select({
              revision: productionTestSchema.productionLocations.liveRevision,
            })
            .from(productionTestSchema.productionLocations)
            .where(eq(productionTestSchema.productionLocations.id, locationId));
          expect(batch).toEqual({ frozenAt: null, frozenBy: null });
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            eventType: 'batch_membership_unfrozen',
          });
          expect(location?.revision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.unfreeze-batch-membership.v1',
    declaration: unfreezeBatchMembershipCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes same-version unfreezes so one work event commits',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const queueConflict = vi.fn();
          const makeExecute = () =>
            makeExecuteUnfreezeBatchMembership({
              repo: makeUnfreezeBatchMembershipPostgresRepository(
                {
                  db: database.db,
                  ids: makeIds(),
                },
                productionTestSchema,
              ),
              idempotency: unfreezeBatchMembershipIdempotency,
              policy: productionRules,
              clock: { now: () => now },
              signals: { queueConflict },
            });
          const outcomes = await Promise.all([
            makeExecute()(command('unfreeze-race-1')),
            makeExecute()(command('unfreeze-race-2')),
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
          expect(queueConflict).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.unfreeze-batch-membership.v1',
    declaration: unfreezeBatchMembershipCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'returns typed not-found without changing batch or queue state',
        proves: ['expected-rejection-no-partial-write'],
        run: async () => {
          await seed();
          const execute = makeExecuteUnfreezeBatchMembership({
            repo: makeUnfreezeBatchMembershipPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: unfreezeBatchMembershipIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
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
              ...command('unfreeze-missing-batch'),
              productionBatchId: ids.config,
            }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'not_found',
              code: 'production_batch_not_found',
            },
          });

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
        name: 'rejects divergent unfreeze reuse without changing the mutable result',
        proves: [
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const execute = makeExecuteUnfreezeBatchMembership({
            repo: makeUnfreezeBatchMembershipPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: unfreezeBatchMembershipIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });
          await expect(execute(command())).resolves.toMatchObject({
            kind: 'success',
          });
          const [before] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));

          await expect(
            execute({ ...command(), expectedBatchVersion: 2 }),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });
          const [after] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          expect(after).toEqual(before);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'collapses concurrent identical unfreeze commands after the locked batch',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const makeExecute = () =>
            makeExecuteUnfreezeBatchMembership({
              repo: makeUnfreezeBatchMembershipPostgresRepository(
                { db: database.db, ids: makeIds() },
                productionTestSchema,
              ),
              idempotency: unfreezeBatchMembershipIdempotency,
              policy: productionRules,
              clock: { now: () => now },
            });
          const input = command('unfreeze-same-key-race');

          const outcomes = await Promise.all([
            makeExecute()(input),
            makeExecute()(input),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
          const [batch] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          expect(batch?.membershipFrozenAt).toBeNull();
        },
      },
      {
        name: 'rolls back batch and queue versions when the unfreeze event insert fails',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          const collision = '22000000-0000-4000-8000-000000000001';
          await database.db.insert(productionTestSchema.workEvents).values({
            id: collision,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.batch,
            actorId: ids.actor,
            idempotencyKey: 'fixture-unfreeze-event',
            payload: {},
          });
          const execute = makeExecuteUnfreezeBatchMembership({
            repo: makeUnfreezeBatchMembershipPostgresRepository(
              { db: database.db, ids: makeIds() },
              productionTestSchema,
            ),
            idempotency: unfreezeBatchMembershipIdempotency,
            policy: productionRules,
            clock: { now: () => now },
          });

          await expect(
            execute(command('unfreeze-late-event-failure')),
          ).rejects.toMatchObject({ code: 'batch_membership_change_failed' });
          const [batch] = await database.db
            .select()
            .from(productionTestSchema.productionBatches)
            .where(eq(productionTestSchema.productionBatches.id, ids.batch));
          const [run] = await database.db
            .select({
              queueVersion: productionTestSchema.productionRuns.queueVersion,
            })
            .from(productionTestSchema.productionRuns)
            .where(eq(productionTestSchema.productionRuns.id, ids.run));
          expect(batch).toMatchObject({
            membershipFrozenAt: expect.any(Date),
            membershipFrozenBy: ids.actor,
            version: 1,
          });
          expect(run?.queueVersion).toBe(1);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
    ],
  });
});
