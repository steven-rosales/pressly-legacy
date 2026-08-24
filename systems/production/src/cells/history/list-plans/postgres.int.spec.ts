import { eq, sql } from '@pressly/postgres/query';
import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeListHistoryPlansPostgresRepository } from './postgres.ts';
import type { ListHistoryPlansInput } from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 1,
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
  actor: '10000000-0000-4000-8000-000000000001',
  oldestShift: '10000000-0000-4000-8000-000000000002',
  middleShift: '10000000-0000-4000-8000-000000000003',
  newestShift: '10000000-0000-4000-8000-000000000004',
  siblingShift: '10000000-0000-4000-8000-000000000005',
  config: '10000000-0000-4000-8000-000000000006',
  siblingConfig: '10000000-0000-4000-8000-000000000007',
  oldestPlan: '10000000-0000-4000-8000-000000000008',
  middlePlan: '10000000-0000-4000-8000-000000000009',
  newestPlan: '10000000-0000-4000-8000-000000000010',
  siblingPlan: '10000000-0000-4000-8000-000000000011',
  run: '10000000-0000-4000-8000-000000000012',
} as const;

const asOf = new Date('2026-08-21T20:00:00.000Z');

const seed = async (): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'History Plans Facility',
      timezone: 'America/New_York',
    },
    {
      id: 'location-2',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Sibling Facility',
      timezone: 'America/Chicago',
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values([
    {
      id: ids.oldestShift,
      locationId: 'location-1',
      startsAt: new Date('2026-08-21T08:00:00.000Z'),
      endsAt: new Date('2026-08-21T16:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'closed',
      effectiveFolderCount: 2,
    },
    {
      id: ids.middleShift,
      locationId: 'location-1',
      startsAt: new Date('2026-08-22T08:00:00.000Z'),
      endsAt: new Date('2026-08-22T16:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'closed',
      effectiveFolderCount: 3,
    },
    {
      id: ids.newestShift,
      locationId: 'location-1',
      startsAt: new Date('2026-08-23T08:00:00.000Z'),
      endsAt: new Date('2026-08-23T16:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 4,
    },
    {
      id: ids.siblingShift,
      locationId: 'location-2',
      startsAt: new Date('2026-08-23T08:00:00.000Z'),
      endsAt: new Date('2026-08-23T16:00:00.000Z'),
      timezone: 'America/Chicago',
      status: 'open',
      effectiveFolderCount: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values([
    {
      id: ids.config,
      locationId: 'location-1',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: ids.actor,
    },
    {
      id: ids.siblingConfig,
      locationId: 'location-2',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: ids.actor,
    },
  ]);

  const schedule = (input: {
    id: string;
    locationId: string;
    shiftId: string;
    configId: string;
    status: 'accepted' | 'rejected' | 'superseded';
    algorithmVersion: string;
    warningCount: number;
  }) => ({
    id: input.id,
    locationId: input.locationId,
    productionShiftId: input.shiftId,
    schedulerConfigId: input.configId,
    status: input.status,
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: input.algorithmVersion,
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 112,
    plannedCompletionAt: new Date('2026-08-23T14:00:00.000Z'),
    warnings: Array.from({ length: input.warningCount }, (_, index) => ({
      code: `WARNING_${String(index)}`,
    })),
    acknowledgedWarningCodes: input.warningCount === 0 ? [] : ['WARNING_0'],
    createdAt: new Date('2026-08-21T19:45:00.000Z'),
    ...(input.status === 'accepted'
      ? {
          acceptedAt: new Date('2026-08-21T19:50:00.000Z'),
          acceptedBy: ids.actor,
        }
      : input.status === 'superseded'
        ? {
            acceptedAt: new Date('2026-08-21T19:40:00.000Z'),
            acceptedBy: ids.actor,
            supersededAt: new Date('2026-08-21T19:55:00.000Z'),
          }
        : {}),
  });

  await database.db.insert(productionTestSchema.scheduleRuns).values([
    schedule({
      id: ids.oldestPlan,
      locationId: 'location-1',
      shiftId: ids.oldestShift,
      configId: ids.config,
      status: 'rejected',
      algorithmVersion: 'precision-oldest',
      warningCount: 0,
    }),
    schedule({
      id: ids.middlePlan,
      locationId: 'location-1',
      shiftId: ids.middleShift,
      configId: ids.config,
      status: 'superseded',
      algorithmVersion: 'precision-middle',
      warningCount: 2,
    }),
    schedule({
      id: ids.newestPlan,
      locationId: 'location-1',
      shiftId: ids.newestShift,
      configId: ids.config,
      status: 'accepted',
      algorithmVersion: 'precision-newest',
      warningCount: 1,
    }),
    schedule({
      id: ids.siblingPlan,
      locationId: 'location-2',
      shiftId: ids.siblingShift,
      configId: ids.siblingConfig,
      status: 'accepted',
      algorithmVersion: 'sibling-only',
      warningCount: 0,
    }),
  ]);
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId: 'location-1',
    productionShiftId: ids.middleShift,
    scheduleRunId: ids.middlePlan,
    status: 'completed',
    startedAt: new Date('2026-08-22T08:00:00.000Z'),
    completedAt: new Date('2026-08-22T15:00:00.000Z'),
    queueVersion: 2,
    plannedCompletionAt: new Date('2026-08-22T14:00:00.000Z'),
    version: 2,
  });

  for (const [id, createdAt] of [
    [ids.oldestPlan, '2026-08-21T19:45:00.000100Z'],
    [ids.middlePlan, '2026-08-21T19:45:00.000500Z'],
    [ids.newestPlan, '2026-08-21T19:45:00.000900Z'],
  ] as const)
    await database.db
      .update(productionTestSchema.scheduleRuns)
      .set({ createdAt: sql<Date>`${createdAt}::timestamptz` })
      .where(eq(productionTestSchema.scheduleRuns.id, id));
};

describe('list-history-plans PostgreSQL read model', () => {
  it('paginates exact microsecond timestamps without gaps or duplicates', async () => {
    await seed();
    const repository = makeListHistoryPlansPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const collected: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await repository.list(
        {
          locationId: 'location-1',
          limit: 1,
          ...(cursor === undefined ? {} : { cursor }),
        },
        asOf,
      );
      expect(page.kind).toBe('found');
      if (page.kind !== 'found') break;
      collected.push(...page.page.items.map((plan) => plan.scheduleRunId));
      expect(page.page.asOf).toBe(asOf);
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(collected).toEqual([ids.newestPlan, ids.middlePlan, ids.oldestPlan]);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('preserves location, run, status, and case-insensitive search filters', async () => {
    await seed();
    const repository = makeListHistoryPlansPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const listIds = async (
      input: ListHistoryPlansInput,
    ): Promise<readonly string[]> => {
      const loaded = await repository.list(input, asOf);
      expect(loaded.kind).toBe('found');
      return loaded.kind === 'found'
        ? loaded.page.items.map((plan) => plan.scheduleRunId)
        : [];
    };

    expect(
      await listIds({ locationId: 'location-1', runId: ids.run, limit: 50 }),
    ).toEqual([ids.middlePlan]);
    expect(
      await listIds({
        locationId: 'location-1',
        status: 'accepted',
        limit: 50,
      }),
    ).toEqual([ids.newestPlan]);
    expect(
      await listIds({
        locationId: 'location-1',
        search: 'PRECISION-MIDDLE',
        limit: 50,
      }),
    ).toEqual([ids.middlePlan]);
  });

  it('rejects scope-mismatched cursors and distinguishes a missing location', async () => {
    await seed();
    const repository = makeListHistoryPlansPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const first = await repository.list(
      { locationId: 'location-1', limit: 1 },
      asOf,
    );
    expect(first.kind).toBe('found');
    if (first.kind !== 'found' || first.page.nextCursor === null) return;

    await expect(
      repository.list(
        {
          locationId: 'location-1',
          status: 'accepted',
          cursor: first.page.nextCursor,
          limit: 1,
        },
        asOf,
      ),
    ).resolves.toEqual({ kind: 'invalid_cursor' });
    await expect(
      repository.list(
        { locationId: 'missing', cursor: 'invalid', limit: 50 },
        asOf,
      ),
    ).resolves.toEqual({ kind: 'invalid_cursor' });
    await expect(
      repository.list({ locationId: 'missing', limit: 50 }, asOf),
    ).resolves.toEqual({ kind: 'location_not_found' });
  });
});
