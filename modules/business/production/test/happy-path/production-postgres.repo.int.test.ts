import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, laundryProduction } from '@pressly/db';
import { makePostgresProductionApplication } from '../../src/main.ts';
import { createProductionTestDatabase } from '../support/database.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('production Postgres repositories', () => {
  it('compose the durable happy path without a module-wide store', async () => {
    const ids = makeIds();
    const clock = makeClock('2026-07-10T14:00:00.000Z');
    const actorId = '11111111-1111-4111-8111-111111111111';
    const locationId = 'location-1';
    const sortingStationId = ids.next();
    const washingStationId = ids.next();
    const dryingStationId = ids.next();
    const foldingStationId = ids.next();
    const washerId = ids.next();
    const dryerId = ids.next();

    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: locationId,
      name: 'Synthetic Facility',
      timezone: 'America/New_York',
    });
    await testDb.db.insert(laundryProduction.stations).values([
      {
        id: sortingStationId,
        locationId,
        kind: 'sorting',
        label: 'Sorting',
        sortOrder: 1,
      },
      {
        id: washingStationId,
        locationId,
        kind: 'washing',
        label: 'Washing',
        sortOrder: 2,
      },
      {
        id: dryingStationId,
        locationId,
        kind: 'drying',
        label: 'Drying',
        sortOrder: 3,
      },
      {
        id: foldingStationId,
        locationId,
        kind: 'folding_packaging',
        label: 'Folding',
        sortOrder: 4,
      },
    ]);
    await testDb.db.insert(laundryProduction.machines).values([
      {
        id: washerId,
        locationId,
        stationId: washingStationId,
        label: 'Washer 1',
        effectiveCapacityLbs: 100,
      },
      {
        id: dryerId,
        locationId,
        stationId: dryingStationId,
        label: 'Dryer 1',
        effectiveCapacityLbs: 100,
      },
    ]);

    const application = makePostgresProductionApplication({
      db: testDb.db,
      policy: allowPolicy,
      scheduler: simpleScheduler,
      clock: clock.clock,
      ids,
    });

    const projected = await application.applyOrderDemand({
      demandKey: 'test:order:order-1',
      displayReference: 'order-1',
      locationId,
      revisionAt: '2026-07-10T13:59:00.000Z',
      revisionHash: '2'.repeat(64),
      state: 'ready_for_production',
      dueAt: '2026-07-10T20:00:00.000Z',
      estimatedWeightLbs: 74,
      bagCount: null,
      idempotencyKey: 'order-demand-1',
    });
    expect(projected).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied' },
    });
    if (projected.tag === 'err' || projected.value.productionOrderId === null)
      return;
    const intakeCommand = {
      locationId,
      orderId: projected.value.productionOrderId,
      bagCount: 2,
      expectedVersion: 1,
      actorId,
      idempotencyKey: 'intake-1',
    } as const;
    const intake = await application.recordOrderIntake(intakeCommand);
    expect(intake).toMatchObject({ tag: 'ok', value: { bagCount: 2 } });
    await expect(
      application.recordOrderIntake(intakeCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { bagCount: 2, version: 2, replayed: true },
    });
    await expect(
      application.recordOrderIntake({ ...intakeCommand, bagCount: 3 }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    const configCommand = {
      locationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      actorId,
      idempotencyKey: 'config-1',
    } as const;
    const config = await application.publishSchedulerConfig(configCommand);
    await expect(
      application.publishSchedulerConfig(configCommand),
    ).resolves.toEqual(config);
    await expect(
      application.publishSchedulerConfig({
        ...configCommand,
        foldLbsPerFolderMinute: 3,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
    await expect(
      application.publishSchedulerConfig({
        ...configCommand,
        locationId: 'location-2',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    const shiftCommand = {
      locationId,
      startsAt: '2026-07-10T14:00:00.000Z',
      endsAt: '2026-07-10T22:00:00.000Z',
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      actorId,
      idempotencyKey: 'shift-1',
    } as const;
    await expect(
      application.createProductionShift({
        ...shiftCommand,
        idempotencyKey: configCommand.idempotencyKey,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
    const shift = await application.createProductionShift(shiftCommand);
    await expect(
      application.createProductionShift(shiftCommand),
    ).resolves.toEqual(shift);
    expect(config.tag).toBe('ok');
    expect(shift.tag).toBe('ok');
    if (config.tag === 'err' || shift.tag === 'err') return;

    const schedule = await application.createSchedule({
      locationId,
      productionShiftId: shift.value.id,
      schedulerConfigId: config.value.id,
      horizonEnd: '2026-07-11T03:59:59.999Z',
    });
    expect(schedule.tag).toBe('ok');
    if (schedule.tag === 'err') return;

    await expect(
      application.loadSchedule({
        locationId,
        scheduleRunId: schedule.value.scheduleRunId,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { scheduleRunId: schedule.value.scheduleRunId },
    });

    const acceptCommand = {
      locationId,
      scheduleRunId: schedule.value.scheduleRunId,
      expectedOutputPlanHash: schedule.value.outputPlanHash,
      acknowledgedWarningCodes: [],
      actorId,
      idempotencyKey: 'accept-1',
    };
    const accepted = await application.acceptSchedule(acceptCommand);
    expect(accepted.tag).toBe('ok');
    if (accepted.tag === 'err') return;
    await expect(
      application.acceptSchedule(acceptCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        productionRunId: accepted.value.productionRunId,
        productionBatchIds: accepted.value.productionBatchIds,
        replayed: true,
      },
    });
    await expect(
      application.acceptSchedule({
        ...acceptCommand,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    const board = await application.loadProductionBoard({
      locationId,
      productionShiftId: shift.value.id,
    });
    expect(board).toMatchObject({
      tag: 'ok',
      value: {
        productionRun: { id: accepted.value.productionRunId },
        batches: [{ orders: [{ externalOrderId: 'order-1' }] }],
      },
    });

    const startCommand = {
      locationId,
      productionRunId: accepted.value.productionRunId,
      expectedVersion: 1,
      actorId,
      idempotencyKey: 'start-1',
    } as const;
    await expect(
      application.startProductionRun(startCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { replayed: false, version: 2 },
    });
    await expect(
      application.startProductionRun(startCommand),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { replayed: true, version: 2 },
    });
    await expect(
      application.startProductionRun({ ...startCommand, expectedVersion: 2 }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    if (board.tag === 'err') return;
    const [scheduledOrder] = await testDb.db
      .select()
      .from(laundryProduction.productionOrders)
      .where(
        eq(
          laundryProduction.productionOrders.id,
          projected.value.productionOrderId,
        ),
      );
    if (scheduledOrder === undefined)
      throw new Error('Scheduled production order not found.');
    expect(scheduledOrder.status).toBe('scheduled');

    const stages = board.value.batches[0]!.stages;
    let previousCompletionAt = 0;
    for (const [index, stage] of stages.entries()) {
      const plannedStartAt = Date.parse(stage.plannedStartAt);
      const plannedEndAt = Date.parse(stage.plannedEndAt);
      const pulseDurationMs = plannedEndAt - plannedStartAt;
      const actualStartAt =
        index === 0
          ? plannedStartAt + 10 * 60_000
          : Math.max(plannedStartAt, previousCompletionAt);
      clock.set(new Date(actualStartAt).toISOString());
      const started = await application.advanceProductionStage({
        locationId,
        stageRunId: stage.id,
        expectedVersion: stage.version,
        transition: 'start',
        actorId,
        idempotencyKey: `stage-start-${index}`,
      });
      expect(started).toMatchObject({
        tag: 'ok',
        value: { replayed: false },
      });
      if (started.tag === 'err') return;

      if (index === 0) {
        clock.set(stage.plannedEndAt);
        await expect(
          application.advanceProductionStage({
            locationId,
            stageRunId: stage.id,
            expectedVersion: started.value.version,
            transition: 'complete',
            actorId,
            idempotencyKey: 'late-stage-too-early',
          }),
        ).resolves.toMatchObject({
          tag: 'err',
          error: { code: 'pulse_boundary_not_reached', status: 409 },
        });
      }

      const completionAt = Math.max(
        plannedEndAt,
        actualStartAt + pulseDurationMs,
      );
      clock.set(new Date(completionAt).toISOString());
      const completionCommand = {
        locationId,
        stageRunId: stage.id,
        expectedVersion: started.value.version,
        transition: 'complete' as const,
        actorId,
        idempotencyKey: `stage-complete-${index}`,
      };

      if (index === stages.length - 1) {
        const [removedBag] = await testDb.db
          .select()
          .from(laundryProduction.bags)
          .where(
            eq(
              laundryProduction.bags.productionOrderId,
              projected.value.productionOrderId,
            ),
          )
          .limit(1);
        if (removedBag === undefined)
          throw new Error('Production bag not found.');
        await testDb.db
          .delete(laundryProduction.bags)
          .where(eq(laundryProduction.bags.id, removedBag.id));

        await expect(
          application.advanceProductionStage(completionCommand),
        ).resolves.toMatchObject({
          tag: 'err',
          error: { code: 'stage_transition_failed', status: 500 },
        });
        const [rolledBackStage] = await testDb.db
          .select()
          .from(laundryProduction.stageRuns)
          .where(eq(laundryProduction.stageRuns.id, stage.id));
        const [rolledBackOrder] = await testDb.db
          .select()
          .from(laundryProduction.productionOrders)
          .where(
            eq(
              laundryProduction.productionOrders.id,
              projected.value.productionOrderId,
            ),
          );
        const [rolledBackLink] = await testDb.db
          .select()
          .from(laundryProduction.productionBatchOrders)
          .where(
            eq(
              laundryProduction.productionBatchOrders.productionOrderId,
              projected.value.productionOrderId,
            ),
          );
        expect(rolledBackStage).toMatchObject({
          status: 'started',
          version: started.value.version,
          actualEndAt: null,
        });
        expect(rolledBackOrder).toMatchObject({
          status: 'scheduled',
          finishedAt: null,
          version: scheduledOrder.version,
        });
        expect(rolledBackLink?.active).toBe(true);

        await testDb.db.insert(laundryProduction.bags).values(removedBag);
      }

      await expect(
        application.advanceProductionStage(completionCommand),
      ).resolves.toMatchObject({
        tag: 'ok',
        value: { replayed: false },
      });
      previousCompletionAt = completionAt;
    }

    const [finishedOrder] = await testDb.db
      .select()
      .from(laundryProduction.productionOrders)
      .where(
        eq(
          laundryProduction.productionOrders.id,
          projected.value.productionOrderId,
        ),
      );
    const finishedBags = await testDb.db
      .select()
      .from(laundryProduction.bags)
      .where(
        eq(
          laundryProduction.bags.productionOrderId,
          projected.value.productionOrderId,
        ),
      );
    const [inactiveOrderLink] = await testDb.db
      .select()
      .from(laundryProduction.productionBatchOrders)
      .where(
        eq(
          laundryProduction.productionBatchOrders.productionOrderId,
          projected.value.productionOrderId,
        ),
      );
    const [finishedBatch] = await testDb.db
      .select()
      .from(laundryProduction.productionBatches)
      .where(
        eq(
          laundryProduction.productionBatches.id,
          accepted.value.productionBatchIds[0]!,
        ),
      );
    const [completedRun] = await testDb.db
      .select()
      .from(laundryProduction.productionRuns)
      .where(
        eq(laundryProduction.productionRuns.id, accepted.value.productionRunId),
      );
    const [closedShift] = await testDb.db
      .select()
      .from(laundryProduction.productionShifts)
      .where(eq(laundryProduction.productionShifts.id, shift.value.id));
    const completedStages = await testDb.db
      .select()
      .from(laundryProduction.stageRuns)
      .where(
        eq(
          laundryProduction.stageRuns.productionBatchId,
          accepted.value.productionBatchIds[0]!,
        ),
      );
    const completedAssignments = await testDb.db
      .select()
      .from(laundryProduction.stageMachineAssignments);

    expect(finishedOrder).toMatchObject({
      status: 'finished',
      finishedAt: expect.any(Date),
      version: scheduledOrder.version + 1,
    });
    expect(finishedBags).toHaveLength(2);
    expect(finishedBags.every((bag) => bag.status === 'finished')).toBe(true);
    expect(inactiveOrderLink?.active).toBe(false);
    expect(finishedBatch).toMatchObject({
      status: 'finished',
      finishedAt: expect.any(Date),
      version: 9,
    });
    expect(completedRun).toMatchObject({
      status: 'completed',
      completedAt: expect.any(Date),
      version: 3,
    });
    expect(closedShift).toMatchObject({ status: 'closed', version: 2 });
    expect(completedStages).toHaveLength(4);
    expect(
      completedStages.every(
        (stage) =>
          stage.status === 'completed' &&
          stage.actualStartAt !== null &&
          stage.actualEndAt !== null &&
          stage.version === 3,
      ),
    ).toBe(true);
    expect(completedAssignments).toHaveLength(2);
    expect(
      completedAssignments.every(
        (assignment) =>
          assignment.status === 'completed' &&
          assignment.actualStartAt !== null &&
          assignment.actualEndAt !== null,
      ),
    ).toBe(true);
  });
});
