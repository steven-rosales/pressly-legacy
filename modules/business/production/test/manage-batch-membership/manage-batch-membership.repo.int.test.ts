import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, laundryProduction } from '@pressly/db';
import { makeAdvanceProductionStageRepository } from '../../src/advance-production-stage/advance-production-stage.repo.ts';
import { makeAdvanceProductionStage } from '../../src/advance-production-stage/advance-production-stage.usecase.ts';
import { makeManageBatchMembershipRepository } from '../../src/manage-batch-membership/manage-batch-membership.repo.ts';
import { makeManageBatchMembership } from '../../src/manage-batch-membership/manage-batch-membership.usecase.ts';
import type { ProductionPolicyPort } from '../../src/production.port.ts';
import { createProductionTestDatabase } from '../support/database.ts';
import { makeIds } from '../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const fixed = {
  actor: '11111111-1111-4111-8111-111111111111',
  shift: '22222222-2222-4222-8222-222222222222',
  station: '33333333-3333-4333-8333-333333333333',
  config: '44444444-4444-4444-8444-444444444444',
  schedule: '55555555-5555-4555-8555-555555555555',
  run: '66666666-6666-4666-8666-666666666666',
  batch: '77777777-7777-4777-8777-777777777777',
  stage: '88888888-8888-4888-8888-888888888888',
} as const;

const policy = {
  evaluateBatchMembershipTransition: (
    input: Parameters<
      ProductionPolicyPort['evaluateBatchMembershipTransition']
    >[0],
  ) => {
    if (input.batchStatus !== 'queued')
      return {
        tag: 'err' as const,
        error: {
          code: 'BATCH_MEMBERSHIP_IMMUTABLE',
          message: 'Membership cannot change after a batch leaves the queue.',
        },
      };
    return {
      tag: 'ok' as const,
      value: { membershipFrozen: input.action === 'freeze' },
    };
  },
  evaluateStageTransition: () => ({
    tag: 'ok' as const,
    value: { status: 'allowed' as const, state: 'started' as const },
  }),
} as unknown as ProductionPolicyPort;

const seedQueuedBatch = async () => {
  const now = new Date('2026-07-14T14:00:00.000Z');
  const plannedCompletionAt = new Date('2026-07-14T18:00:00.000Z');

  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: 'location-1',
    name: 'Membership Test Facility',
    timezone: 'America/New_York',
  });
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: fixed.shift,
    locationId: 'location-1',
    startsAt: now,
    endsAt: new Date('2026-07-14T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await testDb.db.insert(laundryProduction.stations).values({
    id: fixed.station,
    locationId: 'location-1',
    kind: 'sorting',
    label: 'Sorting',
    sortOrder: 1,
  });
  await testDb.db.insert(laundryProduction.schedulerConfigs).values({
    id: fixed.config,
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
    assertedBy: fixed.actor,
  });
  await testDb.db.insert(laundryProduction.scheduleRuns).values({
    id: fixed.schedule,
    locationId: 'location-1',
    productionShiftId: fixed.shift,
    schedulerConfigId: fixed.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 56,
    plannedCompletionAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: now,
    acceptedBy: fixed.actor,
  });
  await testDb.db.insert(laundryProduction.productionRuns).values({
    id: fixed.run,
    locationId: 'location-1',
    productionShiftId: fixed.shift,
    scheduleRunId: fixed.schedule,
    status: 'started',
    startedAt: now,
    queueVersion: 1,
    plannedCompletionAt,
    version: 1,
  });
  await testDb.db.insert(laundryProduction.productionBatches).values({
    id: fixed.batch,
    locationId: 'location-1',
    productionRunId: fixed.run,
    sequenceIndex: 0,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 75,
    pulseMinutes: 56,
    plannedDoneAt: plannedCompletionAt,
    version: 1,
  });
  await testDb.db.insert(laundryProduction.stageRuns).values({
    id: fixed.stage,
    locationId: 'location-1',
    productionBatchId: fixed.batch,
    stationId: fixed.station,
    stageKind: 'sorting',
    status: 'planned',
    plannedStartAt: now,
    plannedEndAt: new Date('2026-07-14T14:56:00.000Z'),
    version: 1,
  });
};

describe('batch membership Postgres workflows', () => {
  it('versions manual changes and permanently freezes a batch when work starts', async () => {
    await seedQueuedBatch();
    const ids = makeIds();
    const clock = { now: () => new Date('2026-07-14T15:00:00.000Z') };
    const manage = makeManageBatchMembership({
      repo: makeManageBatchMembershipRepository({ db: testDb.db, ids }),
      policy,
      clock,
    });

    await expect(
      manage({
        action: 'freeze',
        locationId: 'location-1',
        productionRunId: fixed.run,
        productionBatchId: fixed.batch,
        expectedQueueVersion: 1,
        expectedBatchVersion: 1,
        actorId: fixed.actor,
        actorRole: 'operator',
        idempotencyKey: 'membership-freeze-1',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { queueVersion: 2, batchVersion: 2 },
    });
    await expect(
      manage({
        action: 'unfreeze',
        locationId: 'location-1',
        productionRunId: fixed.run,
        productionBatchId: fixed.batch,
        expectedQueueVersion: 2,
        expectedBatchVersion: 2,
        actorId: fixed.actor,
        actorRole: 'owner',
        idempotencyKey: 'membership-unfreeze-1',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        queueVersion: 3,
        batchVersion: 3,
        membership: { state: 'mutable' },
      },
    });

    await testDb.db
      .update(laundryProduction.productionRuns)
      .set({
        overtimeProposalHash: 'c'.repeat(64),
        overtimeQueueVersion: 3,
        overtimeAcknowledgedBy: fixed.actor,
        overtimeAcknowledgedAt: clock.now(),
      })
      .where(eq(laundryProduction.productionRuns.id, fixed.run));

    const advance = makeAdvanceProductionStage({
      repo: makeAdvanceProductionStageRepository({ db: testDb.db, ids }),
      policy,
      clock,
    });
    const stageCommand = {
      locationId: 'location-1',
      stageRunId: fixed.stage,
      expectedVersion: 1,
      actorId: fixed.actor,
      transition: 'start' as const,
      idempotencyKey: 'stage-start-freezes-batch',
    };
    await expect(advance(stageCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: fixed.stage, version: 2, replayed: false },
    });
    await expect(advance(stageCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: fixed.stage, version: 2, replayed: true },
    });

    const [stored] = await testDb.db
      .select({
        batchStatus: laundryProduction.productionBatches.status,
        batchVersion: laundryProduction.productionBatches.version,
        frozenAt: laundryProduction.productionBatches.membershipFrozenAt,
        frozenBy: laundryProduction.productionBatches.membershipFrozenBy,
        queueVersion: laundryProduction.productionRuns.queueVersion,
        overtimeProposalHash:
          laundryProduction.productionRuns.overtimeProposalHash,
      })
      .from(laundryProduction.productionBatches)
      .innerJoin(
        laundryProduction.productionRuns,
        eq(
          laundryProduction.productionRuns.id,
          laundryProduction.productionBatches.productionRunId,
        ),
      )
      .where(
        and(
          eq(laundryProduction.productionBatches.id, fixed.batch),
          eq(laundryProduction.productionRuns.id, fixed.run),
        ),
      );
    expect(stored).toMatchObject({
      batchStatus: 'sorting',
      batchVersion: 4,
      frozenBy: fixed.actor,
      queueVersion: 4,
      overtimeProposalHash: null,
    });
    expect(stored?.frozenAt?.toISOString()).toBe(clock.now().toISOString());

    await expect(
      manage({
        action: 'unfreeze',
        locationId: 'location-1',
        productionRunId: fixed.run,
        productionBatchId: fixed.batch,
        expectedQueueVersion: 4,
        expectedBatchVersion: 4,
        actorId: fixed.actor,
        actorRole: 'owner',
        idempotencyKey: 'membership-unfreeze-after-start',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'batch_membership_immutable', status: 409 },
    });
  });
});
