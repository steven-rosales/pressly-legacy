import { describe, expect, it, vi } from 'vitest';
import { makeProductionApplication } from '../../../../src/composition/production.composition.ts';
import { nullProductionSignals } from '../../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';
import { makeMemoryProductionRepositories } from '../../../support/memory-production-repositories.ts';
import { makeClock, makeIds } from '../../../support/production.fake.ts';

const locationId = 'location-1';
const actorId = '11111111-1111-4111-8111-111111111111';

const setup = () => {
  const ids = makeIds();
  const memory = makeMemoryProductionRepositories({ ids });
  const planSuperseded = vi.fn();
  const application = makeProductionApplication({
    repositories: memory.repositories,
    clock: makeClock('2026-07-19T14:00:00.000Z').clock,
    ids,
    signals: { ...nullProductionSignals, planSuperseded },
  });
  return { application, planSuperseded };
};

const createShift = async (
  application: ReturnType<typeof setup>['application'],
) => {
  const shift = await application.createProductionShift({
    locationId,
    startsAt: '2026-07-19T14:00:00.000Z',
    endsAt: '2026-07-19T22:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    actorId,
    idempotencyKey: 'selection-test-shift',
  });
  if (shift.tag === 'err') throw shift.error;
  return shift.value;
};

const createOrder = async (
  application: ReturnType<typeof setup>['application'],
  reference: string,
  admissionState: 'unreleased' | 'released',
) => {
  const demand = await application.applyFulfillmentDemand({
    fulfillmentId: `fulfillment:selection:${reference}`,
    fulfillmentVersion: 1,
    displayReference: reference,
    locationId,
    observedAt: '2026-07-19T13:59:00.000Z',
    projectionHash: 'a'.repeat(64),
    admissionState,
    commercialState: 'open',
    dueAt: '2026-07-19T20:00:00.000Z',
    estimatedWeightLbs: 40,
    estimatedWeightSource: 'external_estimate',
    bagCount: 1,
    idempotencyKey: `selection-demand-${reference}`,
  });
  if (demand.tag === 'err' || demand.value.productionOrderId === null)
    throw demand.tag === 'err'
      ? demand.error
      : new Error('Production order was not created.');
  if (admissionState === 'released') {
    const intake = await application.recordOrderIntake({
      locationId,
      orderId: demand.value.productionOrderId,
      bagCount: 1,
      expectedVersion: 1,
      actorId,
      idempotencyKey: `selection-intake-${reference}`,
    });
    if (intake.tag === 'err') throw intake.error;
  }
  return demand.value.productionOrderId;
};

describe('replace shift order selection', () => {
  it('starts empty, accepts only ready orders, versions changes, and supersedes the plan', async () => {
    const { application, planSuperseded } = setup();
    const shift = await createShift(application);
    const firstOrderId = await createOrder(
      application,
      'ready-order-1',
      'released',
    );
    const secondOrderId = await createOrder(
      application,
      'ready-order-2',
      'released',
    );
    const unreleasedOrderId = await createOrder(
      application,
      'expected-order',
      'unreleased',
    );
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
      idempotencyKey: 'selection-test-config',
    });
    if (config.tag === 'err') throw config.error;

    await expect(
      application.createSchedule({
        locationId,
        productionShiftId: shift.id,
        schedulerConfigId: config.value.id,
        actorId,
        idempotencyKey: 'selection-empty-schedule',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'schedule_selection_empty' },
    });

    await expect(
      application.replaceShiftOrderSelection({
        locationId,
        productionShiftId: shift.id,
        selectedOrderIds: [unreleasedOrderId],
        expectedVersion: 0,
        actorId,
        idempotencyKey: 'selection-unready-command',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_selection_not_ready' },
    });

    const firstSelectionCommand = {
      locationId,
      productionShiftId: shift.id,
      selectedOrderIds: [firstOrderId],
      expectedVersion: 0,
      actorId,
      idempotencyKey: 'selection-first-command',
    };
    await expect(
      application.replaceShiftOrderSelection(firstSelectionCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        selection: { version: 1, selectedOrderIds: [firstOrderId] },
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
    await expect(
      application.replaceShiftOrderSelection(firstSelectionCommand),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });

    const schedule = await application.createSchedule({
      locationId,
      productionShiftId: shift.id,
      schedulerConfigId: config.value.id,
      actorId,
      idempotencyKey: 'selection-current-schedule',
    });
    if (schedule.tag === 'err') throw schedule.error;

    await expect(
      application.replaceShiftOrderSelection({
        locationId,
        productionShiftId: shift.id,
        selectedOrderIds: [secondOrderId],
        expectedVersion: 1,
        actorId,
        idempotencyKey: 'selection-second-command',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        selection: { version: 2, selectedOrderIds: [secondOrderId] },
        supersededScheduleRunId: schedule.value.scheduleRunId,
      },
    });
    expect(planSuperseded).toHaveBeenCalledOnce();
  });
});
