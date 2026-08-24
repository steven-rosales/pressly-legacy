import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { listHistoryPlansContract } from '@pressly/production-system/operations/history/list-plans/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  listHistoryPlansAsOf,
  listHistoryPlansFixtureIds,
  listHistoryPlansLocationId,
  listHistoryPlansScenarios,
  listHistoryPlansSiblingLocationId,
  runListHistoryPlansScenario,
  type CanonicalListHistoryPlansOutcome,
  type ListHistoryPlansObservation,
  type ListHistoryPlansReadState,
  type ListHistoryPlansScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from './support/production-location-conformance.postgres.ts';

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
    'access_production_locations',
    'business_accounts',
  ],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
afterAll(database.close);

const businessId = '00000000-0000-4000-8000-000000000300';
const createdAt = new Date('2026-08-21T19:45:00.000Z');

const seed = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: businessId,
      slug: 'history-plan-conformance',
      displayName: 'History Plan Conformance',
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values([
      {
        id: listHistoryPlansLocationId,
        businessId,
        name: 'History Plan Conformance Facility',
        timezone: 'America/New_York',
      },
      {
        id: listHistoryPlansSiblingLocationId,
        businessId,
        name: 'History Plan Conformance Sibling',
        timezone: 'America/Chicago',
      },
    ]);
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: listHistoryPlansLocationId,
      businessId,
      name: 'History Plan Conformance Facility',
      timezone: 'America/New_York',
    },
    {
      id: listHistoryPlansSiblingLocationId,
      businessId,
      name: 'History Plan Conformance Sibling',
      timezone: 'America/Chicago',
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values([
      {
        id: listHistoryPlansFixtureIds.oldestShift,
        locationId: listHistoryPlansLocationId,
        startsAt: new Date('2026-08-21T08:00:00.000Z'),
        endsAt: new Date('2026-08-21T16:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'closed',
        effectiveFolderCount: 2,
      },
      {
        id: listHistoryPlansFixtureIds.middleShift,
        locationId: listHistoryPlansLocationId,
        startsAt: new Date('2026-08-22T08:00:00.000Z'),
        endsAt: new Date('2026-08-22T16:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'closed',
        effectiveFolderCount: 3,
      },
      {
        id: listHistoryPlansFixtureIds.newestShift,
        locationId: listHistoryPlansLocationId,
        startsAt: new Date('2026-08-23T08:00:00.000Z'),
        endsAt: new Date('2026-08-23T16:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 4,
      },
      {
        id: listHistoryPlansFixtureIds.siblingShift,
        locationId: listHistoryPlansSiblingLocationId,
        startsAt: new Date('2026-08-23T08:00:00.000Z'),
        endsAt: new Date('2026-08-23T16:00:00.000Z'),
        timezone: 'America/Chicago',
        status: 'open',
        effectiveFolderCount: 2,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values([
      {
        id: listHistoryPlansFixtureIds.config,
        locationId: listHistoryPlansLocationId,
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
        assertedBy: listHistoryPlansFixtureIds.actor,
      },
      {
        id: listHistoryPlansFixtureIds.siblingConfig,
        locationId: listHistoryPlansSiblingLocationId,
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
        assertedBy: listHistoryPlansFixtureIds.actor,
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
    createdAt,
    ...(input.status === 'accepted'
      ? {
          acceptedAt: new Date('2026-08-21T19:50:00.000Z'),
          acceptedBy: listHistoryPlansFixtureIds.actor,
        }
      : input.status === 'superseded'
        ? {
            acceptedAt: new Date('2026-08-21T19:40:00.000Z'),
            acceptedBy: listHistoryPlansFixtureIds.actor,
            supersededAt: new Date('2026-08-21T19:55:00.000Z'),
          }
        : {}),
  });

  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values([
      schedule({
        id: listHistoryPlansFixtureIds.oldestPlan,
        locationId: listHistoryPlansLocationId,
        shiftId: listHistoryPlansFixtureIds.oldestShift,
        configId: listHistoryPlansFixtureIds.config,
        status: 'rejected',
        algorithmVersion: 'precision-oldest',
        warningCount: 0,
      }),
      schedule({
        id: listHistoryPlansFixtureIds.middlePlan,
        locationId: listHistoryPlansLocationId,
        shiftId: listHistoryPlansFixtureIds.middleShift,
        configId: listHistoryPlansFixtureIds.config,
        status: 'superseded',
        algorithmVersion: 'precision-middle',
        warningCount: 2,
      }),
      schedule({
        id: listHistoryPlansFixtureIds.newestPlan,
        locationId: listHistoryPlansLocationId,
        shiftId: listHistoryPlansFixtureIds.newestShift,
        configId: listHistoryPlansFixtureIds.config,
        status: 'accepted',
        algorithmVersion: 'precision-newest',
        warningCount: 1,
      }),
      schedule({
        id: listHistoryPlansFixtureIds.siblingPlan,
        locationId: listHistoryPlansSiblingLocationId,
        shiftId: listHistoryPlansFixtureIds.siblingShift,
        configId: listHistoryPlansFixtureIds.siblingConfig,
        status: 'accepted',
        algorithmVersion: 'sibling-only',
        warningCount: 0,
      }),
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: listHistoryPlansFixtureIds.run,
      locationId: listHistoryPlansLocationId,
      productionShiftId: listHistoryPlansFixtureIds.middleShift,
      scheduleRunId: listHistoryPlansFixtureIds.middlePlan,
      status: 'completed',
      startedAt: new Date('2026-08-22T08:00:00.000Z'),
      completedAt: new Date('2026-08-22T15:00:00.000Z'),
      queueVersion: 2,
      plannedCompletionAt: new Date('2026-08-22T14:00:00.000Z'),
      version: 2,
    });

  for (const [id, exactCreatedAt] of [
    [listHistoryPlansFixtureIds.oldestPlan, '2026-08-21T19:44:59.999900Z'],
    [listHistoryPlansFixtureIds.middlePlan, '2026-08-21T19:45:00.000500Z'],
    [listHistoryPlansFixtureIds.newestPlan, '2026-08-21T19:45:00.000900Z'],
  ] as const)
    await database.db
      .update(presslyPostgresOwnerSchemas.production.scheduleRuns)
      .set({ createdAt: sql<Date>`${exactCreatedAt}::timestamptz` })
      .where(eq(presslyPostgresOwnerSchemas.production.scheduleRuns.id, id));
};

const makeIds = (): IdSource => ({
  next: () => '40000000-0000-4000-8000-000000000001',
});

const readState = async (
  db: PostgresDatabase,
): Promise<ListHistoryPlansReadState> => {
  const schedules = await db
    .select({ id: presslyPostgresOwnerSchemas.production.scheduleRuns.id })
    .from(presslyPostgresOwnerSchemas.production.scheduleRuns);
  const runs = await db
    .select({ id: presslyPostgresOwnerSchemas.production.productionRuns.id })
    .from(presslyPostgresOwnerSchemas.production.productionRuns);
  const [location] = await db
    .select({
      liveRevision:
        presslyPostgresOwnerSchemas.production.productionLocations.liveRevision,
    })
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionLocations.id,
        listHistoryPlansLocationId,
      ),
    );
  if (location === undefined)
    throw new Error('List-history-plans fixture location is missing.');
  return {
    scheduleRunCount: schedules.length,
    productionRunCount: runs.length,
    locationLiveRevision: location.liveRevision,
  };
};

const observe = async (
  scenario: ListHistoryPlansScenario,
): Promise<ListHistoryPlansObservation> => {
  await database.reset();
  await seed();
  const before = await readState(database.db);
  const ids = makeIds();
  const clock = { now: () => new Date(listHistoryPlansAsOf) };
  const execute = makeProductionSystem({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: makeProductionActorReadV1Capability(
      database.db,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        database.db,
        presslyPostgresOwnerSchemas.access,
      ),
    db: database.db,
    ids,
    clock,
  }).cells.listHistoryPlans.execute;

  return {
    outcome: await runListHistoryPlansScenario(execute, scenario),
    stateDelta: { before, after: await readState(database.db) },
  };
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const successValue = (
  outcome: CanonicalListHistoryPlansOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  const value = outcome?.kind === 'success' ? record(outcome.value) : null;
  expect(value).not.toBeNull();
  return value ?? {};
};

const itemIds = (outcome: CanonicalListHistoryPlansOutcome | undefined) => {
  const items = successValue(outcome)['items'];
  return Array.isArray(items)
    ? items.map((item) => record(item)?.['scheduleRunId'])
    : [];
};

const cursorEnvelope = (
  outcome: CanonicalListHistoryPlansOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  const cursor = successValue(outcome)['nextCursor'];
  expect(typeof cursor).toBe('string');
  if (typeof cursor !== 'string') return {};
  return (
    record(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) ?? {}
  );
};

describe('production.list-history-plans.v1 behavioral conformance', () => {
  it('keeps the serialized boundary defaults and normalization', () => {
    expect(
      listHistoryPlansContract.input.decode({
        params: { locationId: listHistoryPlansLocationId },
        query: {},
      }),
    ).toEqual({
      kind: 'valid',
      value: { locationId: listHistoryPlansLocationId, limit: 50 },
    });
    expect(
      listHistoryPlansContract.input.decode({
        params: { locationId: listHistoryPlansLocationId },
        query: {
          limit: '25',
          search: '  PRECISION-MIDDLE  ',
          createdAfter: '2026-08-21T19:45:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: listHistoryPlansLocationId,
        limit: 25,
        search: 'PRECISION-MIDDLE',
        createdAfter: new Date('2026-08-21T19:45:00.000Z'),
      },
    });
  });

  it.each(listHistoryPlansScenarios)('$name', async (scenario) => {
    const observation = await observe(scenario);

    expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);

    if (scenario.name.startsWith('defaults')) {
      expect(itemIds(observation.outcome[0])).toEqual([
        listHistoryPlansFixtureIds.newestPlan,
        listHistoryPlansFixtureIds.middlePlan,
        listHistoryPlansFixtureIds.oldestPlan,
      ]);
      const value = successValue(observation.outcome[0]);
      expect(value).toMatchObject({
        asOf: listHistoryPlansAsOf.toISOString(),
        nextCursor: null,
      });
      const items = value['items'];
      expect(Array.isArray(items) ? items[0] : null).toEqual({
        scheduleRunId: listHistoryPlansFixtureIds.newestPlan,
        productionShiftId: listHistoryPlansFixtureIds.newestShift,
        linkedProductionRunId: null,
        status: 'accepted',
        shiftStartsAt: '2026-08-23T08:00:00.000Z',
        shiftEndsAt: '2026-08-23T16:00:00.000Z',
        algorithmVersion: 'precision-newest',
        schedulerConfigId: listHistoryPlansFixtureIds.config,
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
        pulseCapacityLbs: 100,
        batchCount: 2,
        makespanMinutes: 112,
        plannedCompletionAt: '2026-08-23T14:00:00.000Z',
        warningCount: 1,
        acknowledgedWarningCount: 1,
        createdAt: '2026-08-21T19:45:00.000Z',
        acceptedAt: '2026-08-21T19:50:00.000Z',
        acceptedBy: listHistoryPlansFixtureIds.actor,
        supersededAt: null,
      });
      return;
    }

    if (scenario.name.startsWith('run search')) {
      expect(itemIds(observation.outcome[0])).toEqual([
        listHistoryPlansFixtureIds.middlePlan,
      ]);
      expect(itemIds(observation.outcome[1])).toEqual([
        listHistoryPlansFixtureIds.middlePlan,
      ]);
      expect(itemIds(observation.outcome[2])).toEqual([
        listHistoryPlansFixtureIds.newestPlan,
      ]);
      expect(itemIds(observation.outcome[3])).toEqual([
        listHistoryPlansFixtureIds.newestPlan,
        listHistoryPlansFixtureIds.middlePlan,
      ]);
      return;
    }

    if (scenario.name.startsWith('cursor bytes')) {
      expect(observation.outcome).toHaveLength(3);
      expect(
        observation.outcome.flatMap((outcome) => itemIds(outcome)),
      ).toEqual([
        listHistoryPlansFixtureIds.newestPlan,
        listHistoryPlansFixtureIds.middlePlan,
        listHistoryPlansFixtureIds.oldestPlan,
      ]);
      expect(cursorEnvelope(observation.outcome[0])).toMatchObject({
        version: 2,
        kind: 'plans',
        createdAtKey: '2026-08-21T19:45:00.000900Z',
        id: listHistoryPlansFixtureIds.newestPlan,
      });
      expect(cursorEnvelope(observation.outcome[1])).toMatchObject({
        version: 2,
        kind: 'plans',
        createdAtKey: '2026-08-21T19:45:00.000500Z',
        id: listHistoryPlansFixtureIds.middlePlan,
      });
      return;
    }

    if (scenario.name.startsWith('cursor remains')) {
      expect(observation.outcome[1]).toMatchObject({
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'validation',
          classification: 'malformed',
          code: 'production_history_cursor_invalid',
        },
      });
      return;
    }

    expect(observation.outcome).toMatchObject([
      {
        kind: 'failure',
        failure: {
          code: 'production_history_cursor_invalid',
          kind: 'validation',
        },
      },
      {
        kind: 'failure',
        failure: {
          code: 'production_location_not_found',
          kind: 'not_found',
        },
      },
    ]);
  });
});
