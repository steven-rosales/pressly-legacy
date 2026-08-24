import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadScheduleContract } from './contract.ts';
import {
  makeExecuteLoadSchedule,
  type ExecuteLoadSchedule,
} from './execute.ts';
import { makeLoadSchedulePostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
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
  actor: '23000000-0000-4000-8000-000000000001',
  shift: '23000000-0000-4000-8000-000000000002',
  config: '23000000-0000-4000-8000-000000000003',
  schedule: '23000000-0000-4000-8000-000000000004',
  order: '23000000-0000-4000-8000-000000000005',
  washer: '23000000-0000-4000-8000-000000000006',
  dryer: '23000000-0000-4000-8000-000000000007',
} as const;

const locationId = 'location-load-schedule';
const siblingLocationId = 'location-load-schedule-sibling';
const businessId = '00000000-0000-4000-8000-000000000100';
const plannedCompletionAt = new Date('2026-08-22T20:00:00.000Z');
const createdAt = new Date('2026-08-22T15:00:00.000Z');

const outputPlan = {
  algorithmVersion: 'fixed-pulse-ffd-v2',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  canonicalOutput: '{"plan":"canonical"}',
  pulseMinutes: 56,
  pulseCapacityLbs: 80,
  batchCount: 1,
  makespanMinutes: 224,
  plannedCompletionAt: plannedCompletionAt.toISOString(),
  batches: [
    {
      sequence: 0,
      orderIds: [ids.order],
      derivedWeightLbs: 32,
      bagCount: 2,
      stages: [
        {
          stage: 'sorting',
          startsAt: '2026-08-22T16:00:00.000Z',
          endsAt: '2026-08-22T16:56:00.000Z',
          machineIds: [],
        },
        {
          stage: 'washing',
          startsAt: '2026-08-22T16:56:00.000Z',
          endsAt: '2026-08-22T17:52:00.000Z',
          machineIds: [ids.washer],
        },
        {
          stage: 'drying',
          startsAt: '2026-08-22T17:52:00.000Z',
          endsAt: '2026-08-22T18:48:00.000Z',
          machineIds: [ids.dryer],
        },
        {
          stage: 'folding_packaging',
          startsAt: '2026-08-22T18:48:00.000Z',
          endsAt: '2026-08-22T19:44:00.000Z',
          machineIds: [],
        },
      ],
    },
  ],
  unplacedOrderIds: [],
  warnings: [
    {
      code: 'SHIFT_OVERFLOW',
      message: 'The plan ends after the shift.',
      blocking: true,
      orderIds: [ids.order],
    },
  ],
};

const expectedProposal = {
  scheduleRunId: ids.schedule,
  productionShiftId: ids.shift,
  schedulerConfigId: ids.config,
  status: 'draft',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 80,
  batchCount: 1,
  makespanMinutes: 224,
  plannedCompletionAt: plannedCompletionAt.toISOString(),
  batches: outputPlan.batches,
  unplacedOrderIds: [],
  warnings: outputPlan.warnings,
  createdAt: createdAt.toISOString(),
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
} as const;

const seed = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values([
    {
      id: locationId,
      businessId,
      name: 'Load Schedule Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId,
      name: 'Sibling Facility',
      timezone: 'America/Chicago',
    },
  ]);
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
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan,
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 80,
    batchCount: 1,
    makespanMinutes: 224,
    plannedCompletionAt,
    warnings: outputPlan.warnings,
    acknowledgedWarningCodes: [],
    createdAt,
  });
};

const executeSerialized = async (
  execute: ExecuteLoadSchedule,
  params: Readonly<{ locationId: string; scheduleRunId: string }>,
) => {
  const decoded = loadScheduleContract.input.decode({ params });
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success' as const,
        value: loadScheduleContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure' as const,
        failure: loadScheduleContract.failure.encode(outcome.failure),
      };
};

describe('load schedule serialized native Postgres query', () => {
  it('maps the canonical proposal and scopes the UUID read by location', async () => {
    await seed();
    const execute = makeExecuteLoadSchedule(
      makeLoadSchedulePostgresRepository(database.db, productionTestSchema),
    );

    await expect(
      executeSerialized(execute, { locationId, scheduleRunId: ids.schedule }),
    ).resolves.toEqual({ kind: 'success', value: expectedProposal });
    await expect(
      executeSerialized(execute, {
        locationId: siblingLocationId,
        scheduleRunId: ids.schedule,
      }),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        tag: 'ProductionFailure',
        kind: 'not_found',
        code: 'schedule_not_found',
        message: 'The schedule proposal was not found.',
        safeMessage: 'The schedule proposal was not found.',
      },
    });
    await expect(
      executeSerialized(execute, {
        locationId,
        scheduleRunId: '33000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'schedule_not_found' },
    });

    await expect(
      database.db.select().from(productionTestSchema.scheduleRuns),
    ).resolves.toHaveLength(1);
  });

  it('preserves the owned stored-output invariant instead of misclassifying it', async () => {
    await seed();
    await database.db
      .update(productionTestSchema.scheduleRuns)
      .set({ outputPlan: {} })
      .where(eq(productionTestSchema.scheduleRuns.id, ids.schedule));
    const execute = makeExecuteLoadSchedule(
      makeLoadSchedulePostgresRepository(database.db, productionTestSchema),
    );

    await expect(
      execute({ locationId, scheduleRunId: ids.schedule }),
    ).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'InvariantViolationError',
      code: 'production_schedule_output_plan_invalid',
      safeMessage: 'Stored production scheduling state is inconsistent.',
    });
  });
});
