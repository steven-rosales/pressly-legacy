import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { makeUpdateProductionShiftRepository } from '../../../../src/features/resources/update-production-shift/update-production-shift.repo.ts';
import { makeUpdateProductionShift } from '../../../../src/features/resources/update-production-shift/update-production-shift.usecase.ts';
import { createProductionTestDatabase } from '../../../support/database.ts';
import { allowPolicy, makeIds } from '../../../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const fixed = {
  actor: '11111111-1111-4111-8111-111111111111',
  shift: '22222222-2222-4222-8222-222222222222',
  config: '33333333-3333-4333-8333-333333333333',
  schedule: '44444444-4444-4444-8444-444444444444',
} as const;

const originalStart = new Date('2026-07-15T13:00:00.000Z');
const originalEnd = new Date('2026-07-15T21:00:00.000Z');
const now = new Date('2026-07-15T12:00:00.000Z');

const seedShift = async (withAcceptedSchedule: boolean) => {
  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: 'location-1',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Shift Update Facility',
    timezone: 'America/New_York',
  });
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: fixed.shift,
    locationId: 'location-1',
    startsAt: originalStart,
    endsAt: originalEnd,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
    version: 1,
  });
  if (!withAcceptedSchedule) return;

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
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: originalStart,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: now,
    acceptedBy: fixed.actor,
  });
};

const makeUpdate = () =>
  makeUpdateProductionShift({
    repo: makeUpdateProductionShiftRepository({
      db: testDb.db,
      ids: makeIds(),
    }),
    clock: { now: () => new Date(now) },
    policy: allowPolicy,
  });

describe('update production shift Postgres workflow', () => {
  it('atomically updates the shift, supersedes the plan, and records the audit event', async () => {
    await seedShift(true);
    const update = makeUpdate();
    const command = {
      locationId: 'location-1',
      productionShiftId: fixed.shift,
      startsAt: '2026-07-15T12:30:00.000Z',
      endsAt: '2026-07-15T22:00:00.000Z',
      effectiveFolderCount: 4,
      expectedVersion: 1,
      actorId: fixed.actor,
      idempotencyKey: 'postgres-shift-update-1',
    } as const;

    await expect(update(command)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        productionShift: {
          id: fixed.shift,
          locationId: 'location-1',
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          effectiveFolderCount: 4,
          version: 2,
        },
        supersededScheduleRunId: fixed.schedule,
        replayed: false,
      },
    });
    await expect(update(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { replayed: true },
    });

    const [shift] = await testDb.db
      .select()
      .from(laundryProduction.productionShifts)
      .where(eq(laundryProduction.productionShifts.id, fixed.shift));
    const [schedule] = await testDb.db
      .select()
      .from(laundryProduction.scheduleRuns)
      .where(eq(laundryProduction.scheduleRuns.id, fixed.schedule));
    const events = await testDb.db
      .select()
      .from(laundryProduction.workEvents)
      .where(
        eq(laundryProduction.workEvents.idempotencyKey, command.idempotencyKey),
      );

    expect(shift).toMatchObject({
      id: fixed.shift,
      effectiveFolderCount: 4,
      version: 2,
    });
    expect(schedule).toMatchObject({
      id: fixed.schedule,
      status: 'superseded',
      acceptedBy: fixed.actor,
    });
    expect(schedule?.supersededAt?.toISOString()).toBe(now.toISOString());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'production_shift_updated',
      entityType: 'production_shift',
      entityId: fixed.shift,
      actorId: fixed.actor,
      expectedVersion: 1,
    });
    expect(events[0]?.payload).toMatchObject({
      changedFields: ['startsAt', 'endsAt', 'effectiveFolderCount'],
      previous: { effectiveFolderCount: 2, version: 1 },
      current: { effectiveFolderCount: 4, version: 2 },
      supersededScheduleRunId: fixed.schedule,
    });
  });

  it('serializes competing edits so exactly one expected version commits', async () => {
    await seedShift(false);
    const update = makeUpdate();
    const base = {
      locationId: 'location-1',
      productionShiftId: fixed.shift,
      startsAt: originalStart.toISOString(),
      expectedVersion: 1,
      actorId: fixed.actor,
    } as const;

    const outcomes = await Promise.all([
      update({
        ...base,
        endsAt: '2026-07-15T22:00:00.000Z',
        effectiveFolderCount: 3,
        idempotencyKey: 'competing-shift-update-a',
      }),
      update({
        ...base,
        endsAt: '2026-07-15T23:00:00.000Z',
        effectiveFolderCount: 4,
        idempotencyKey: 'competing-shift-update-b',
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.tag === 'ok')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.tag === 'err')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.tag === 'err')).toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_version_conflict', kind: 'conflict' },
    });

    const [shift] = await testDb.db
      .select()
      .from(laundryProduction.productionShifts)
      .where(eq(laundryProduction.productionShifts.id, fixed.shift));
    expect(shift?.version).toBe(2);
    expect([3, 4]).toContain(shift?.effectiveFolderCount);
  });
});
