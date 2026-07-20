import { describe, expect, it } from 'vitest';
import { makeProductionApplication } from '../../src/main.ts';
import { makeMemoryProductionRepositories } from '../support/memory-production-repositories.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';

const locationId = 'location-1';
const actorId = '11111111-1111-4111-8111-111111111111';

const setup = () => {
  const ids = makeIds();
  const memory = makeMemoryProductionRepositories({ ids });
  const { clock } = makeClock('2026-07-15T12:00:00.000Z');
  const application = makeProductionApplication({
    repositories: memory.repositories,
    policy: allowPolicy,
    scheduler: simpleScheduler,
    clock,
    ids,
  });

  return { application, inspect: memory.inspect };
};

const createShift = async (
  application: ReturnType<typeof setup>['application'],
) => {
  const outcome = await application.createProductionShift({
    locationId,
    startsAt: '2026-07-15T13:00:00.000Z',
    endsAt: '2026-07-15T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    actorId,
    idempotencyKey: 'create-shift-for-update',
  });
  if (outcome.tag === 'err') throw outcome.error;
  return outcome.value;
};

const createAcceptedSchedule = async (
  application: ReturnType<typeof setup>['application'],
  productionShiftId: string,
) => {
  const demand = await application.applyOrderDemand({
    demandKey: `test:shift-update:${productionShiftId}`,
    displayReference: 'shift-update-order',
    locationId,
    revisionAt: '2026-07-15T11:59:00.000Z',
    revisionHash: 'a'.repeat(64),
    phase: 'production_released',
    sourceStatusCode: 'IN_PROGRESS',
    dueAt: '2026-07-15T20:00:00.000Z',
    estimatedWeightLbs: 40,
    estimatedWeightSource: 'external_estimate',
    bagCount: 1,
    idempotencyKey: 'demand-for-shift-update',
  });
  if (demand.tag === 'err' || demand.value.productionOrderId === null)
    throw demand.tag === 'err'
      ? demand.error
      : new Error('Production order was not created.');
  const selection = await application.replaceShiftOrderSelection({
    locationId,
    productionShiftId,
    selectedOrderIds: [demand.value.productionOrderId],
    expectedVersion: 0,
    actorId,
    idempotencyKey: 'selection-for-shift-update',
  });
  if (selection.tag === 'err') throw selection.error;

  const config = await application.publishSchedulerConfig({
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    actorId,
    idempotencyKey: 'config-for-shift-update',
  });
  if (config.tag === 'err') throw config.error;

  const schedule = await application.createSchedule({
    locationId,
    productionShiftId,
    schedulerConfigId: config.value.id,
    actorId,
    idempotencyKey: 'schedule-for-shift-update',
  });
  if (schedule.tag === 'err') throw schedule.error;

  const accepted = await application.acceptSchedule({
    locationId,
    scheduleRunId: schedule.value.scheduleRunId,
    expectedOutputPlanHash: schedule.value.outputPlanHash,
    acknowledgedWarningCodes: [],
    actorId,
    idempotencyKey: 'accept-for-shift-update',
  });
  if (accepted.tag === 'err') throw accepted.error;
  return schedule.value;
};

describe('update production shift', () => {
  it('preserves shift identity, versions the edit, and revokes the current plan', async () => {
    const { application, inspect } = setup();
    const shift = await createShift(application);
    const schedule = await createAcceptedSchedule(application, shift.id);
    const command = {
      locationId,
      productionShiftId: shift.id,
      startsAt: '2026-07-15T12:30:00.000Z',
      endsAt: '2026-07-15T21:30:00.000Z',
      effectiveFolderCount: 4,
      expectedVersion: 1,
      actorId,
      idempotencyKey: 'update-shift-1',
    } as const;

    await expect(application.updateProductionShift(command)).resolves.toEqual({
      tag: 'ok',
      value: {
        productionShift: {
          ...shift,
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          effectiveFolderCount: 4,
          version: 2,
        },
        supersededScheduleRunId: schedule.scheduleRunId,
        replayed: false,
      },
    });
    expect(inspect().schedules.get(schedule.scheduleRunId)).toMatchObject({
      status: 'superseded',
      acceptedBy: actorId,
      supersededAt: '2026-07-15T12:00:00.000Z',
    });

    await expect(
      application.updateProductionShift(command),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        replayed: true,
        supersededScheduleRunId: schedule.scheduleRunId,
      },
    });
    await expect(
      application.updateProductionShift({
        ...command,
        effectiveFolderCount: 5,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
  });

  it('does not version or revoke a plan when the requested values are unchanged', async () => {
    const { application, inspect } = setup();
    const shift = await createShift(application);
    const schedule = await createAcceptedSchedule(application, shift.id);

    await expect(
      application.updateProductionShift({
        locationId,
        productionShiftId: shift.id,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        effectiveFolderCount: shift.effectiveFolderCount,
        expectedVersion: shift.version,
        actorId,
        idempotencyKey: 'noop-shift-update',
      }),
    ).resolves.toEqual({
      tag: 'ok',
      value: {
        productionShift: shift,
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
    expect(inspect().schedules.get(schedule.scheduleRunId)?.status).toBe(
      'accepted',
    );
  });

  it('rejects stale versions, invalid windows, and shifts outside the location', async () => {
    const { application } = setup();
    const shift = await createShift(application);
    const base = {
      locationId,
      productionShiftId: shift.id,
      startsAt: shift.startsAt,
      endsAt: '2026-07-15T22:00:00.000Z',
      effectiveFolderCount: 3,
      actorId,
    } as const;

    await expect(
      application.updateProductionShift({
        ...base,
        expectedVersion: 9,
        idempotencyKey: 'stale-shift-update',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_version_conflict', status: 409 },
    });
    await expect(
      application.updateProductionShift({
        ...base,
        startsAt: '2026-07-15T23:00:00.000Z',
        expectedVersion: 1,
        idempotencyKey: 'invalid-shift-update',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_window_invalid', status: 422 },
    });
    await expect(
      application.updateProductionShift({
        ...base,
        locationId: 'location-2',
        expectedVersion: 1,
        idempotencyKey: 'wrong-location-shift-update',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_not_found', status: 404 },
    });
  });

  it('rejects edits after execution exists for the shift', async () => {
    const { application } = setup();
    const shift = await createShift(application);
    const schedule = await createAcceptedSchedule(application, shift.id);
    const started = await application.startSchedule({
      locationId,
      scheduleRunId: schedule.scheduleRunId,
      expectedOutputPlanHash: schedule.outputPlanHash,
      actorId,
      idempotencyKey: 'start-before-shift-update',
    });
    if (started.tag === 'err') throw started.error;

    await expect(
      application.updateProductionShift({
        locationId,
        productionShiftId: shift.id,
        startsAt: shift.startsAt,
        endsAt: '2026-07-15T22:00:00.000Z',
        effectiveFolderCount: 3,
        expectedVersion: shift.version,
        actorId,
        idempotencyKey: 'update-started-shift',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_already_started', status: 409 },
    });
  });
});
