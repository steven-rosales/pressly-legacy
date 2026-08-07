import { describe, expect, it, vi } from 'vitest';
import { makeProductionApplication } from '../../../src/composition/production.composition.ts';
import { makeMemoryProductionRepositories } from '../../support/memory-production-repositories.ts';
import { makeClock, makeIds } from '../../support/production.fake.ts';
import { nullProductionSignals } from '../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';

const orderDemand = {
  fulfillmentId: 'fulfillment:test:order-1',
  fulfillmentVersion: 1,
  displayReference: 'order-1',
  locationId: 'location-1',
  observedAt: '2026-07-10T13:59:00.000Z',
  projectionHash: '2'.repeat(64),
  admissionState: 'released' as const,
  commercialState: 'open' as const,
  dueAt: '2026-07-10T20:00:00.000Z',
  estimatedWeightLbs: 74,
  estimatedWeightSource: 'external_estimate' as const,
  bagCount: null,
  idempotencyKey: 'order-demand-1',
};

describe('production happy path', () => {
  it('moves durable demand through acceptance and all four pulse stages', async () => {
    const ids = makeIds();
    const locationId = 'location-1';
    const time = makeClock('2026-07-10T14:00:00.000Z');
    const memory = makeMemoryProductionRepositories({ ids });
    memory.seedMachines([
      {
        id: ids.next(),
        stationKind: 'washing',
        label: 'Washer 1',
        effectiveCapacityLbs: 100,
        active: true,
      },
      {
        id: ids.next(),
        stationKind: 'drying',
        label: 'Dryer 1',
        effectiveCapacityLbs: 100,
        active: true,
      },
    ]);
    const runStarted = vi.fn();
    const app = makeProductionApplication({
      repositories: memory.repositories,
      clock: time.clock,
      ids,
      signals: { ...nullProductionSignals, runStarted },
    });

    const appliedDemand = await app.applyFulfillmentDemand(orderDemand);
    expect(appliedDemand).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied' },
    });
    const intakePendingOrder = [...memory.inspect().orders.values()][0]!;
    const intake = await app.recordOrderIntake({
      locationId,
      orderId: intakePendingOrder.id,
      bagCount: 2,
      expectedVersion: intakePendingOrder.version,
      idempotencyKey: 'intake-command-1',
      actorId: '11111111-1111-4111-8111-111111111111',
    });
    expect(intake).toMatchObject({ tag: 'ok' });
    if (intake.tag === 'err') return;

    const priorityCommand = {
      locationId,
      productionOrderId: intake.value.orderId,
      priority: true,
      expectedVersion: intake.value.version,
      actorId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'priority-command-1',
    } as const;
    const priority = await app.setProductionOrderPriority(priorityCommand);
    expect(priority).toMatchObject({
      tag: 'ok',
      value: { version: intake.value.version + 1, replayed: false },
    });
    await expect(
      app.setProductionOrderPriority(priorityCommand),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
    await expect(
      app.setProductionOrderPriority({
        ...priorityCommand,
        priority: false,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
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
      actorId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'config-command-1',
    } as const;
    const config = await app.publishSchedulerConfig(configCommand);
    await expect(app.publishSchedulerConfig(configCommand)).resolves.toEqual(
      config,
    );
    await expect(
      app.publishSchedulerConfig({ ...configCommand, pulseMinutes: 42 }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });

    const shiftCommand = {
      locationId,
      startsAt: '2026-07-10T14:00:00.000Z',
      endsAt: '2026-07-10T22:00:00.000Z',
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      actorId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'shift-command-1',
    } as const;
    await expect(
      app.createProductionShift({
        ...shiftCommand,
        idempotencyKey: configCommand.idempotencyKey,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });
    const shift = await app.createProductionShift(shiftCommand);
    await expect(app.createProductionShift(shiftCommand)).resolves.toEqual(
      shift,
    );
    await expect(
      app.createProductionShift({
        ...shiftCommand,
        effectiveFolderCount: 3,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });
    expect(config.tag).toBe('ok');
    expect(shift.tag).toBe('ok');
    if (config.tag === 'err' || shift.tag === 'err') return;

    const selection = await app.replaceShiftOrderSelection({
      locationId,
      productionShiftId: shift.value.id,
      selectedOrderIds: [intake.value.orderId],
      expectedVersion: 0,
      actorId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'shift-selection-command-1',
    });
    expect(selection).toMatchObject({
      tag: 'ok',
      value: {
        selection: { version: 1, selectedOrderIds: [intake.value.orderId] },
      },
    });

    const schedule = await app.createSchedule({
      locationId,
      productionShiftId: shift.value.id,
      schedulerConfigId: config.value.id,
      idempotencyKey: 'schedule-command-1',
      actorId: '11111111-1111-4111-8111-111111111111',
    });
    expect(schedule.tag).toBe('ok');
    if (schedule.tag === 'err') return;

    const acceptCommand = {
      locationId,
      scheduleRunId: schedule.value.scheduleRunId,
      expectedOutputPlanHash: schedule.value.outputPlanHash,
      acknowledgedWarningCodes: [],
      idempotencyKey: 'accept-command-1',
      actorId: '11111111-1111-4111-8111-111111111111',
    };
    const accepted = await app.acceptSchedule(acceptCommand);
    expect(accepted.tag).toBe('ok');
    if (accepted.tag === 'err') return;
    await expect(app.acceptSchedule(acceptCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        scheduleRunId: accepted.value.scheduleRunId,
        productionShiftId: accepted.value.productionShiftId,
        replayed: true,
      },
    });
    await expect(
      app.acceptSchedule({
        ...acceptCommand,
        expectedOutputPlanHash: 'different-plan-hash',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });
    expect(memory.inspect().runs.size).toBe(0);

    const startCommand = {
      locationId,
      scheduleRunId: schedule.value.scheduleRunId,
      expectedOutputPlanHash: schedule.value.outputPlanHash,
      idempotencyKey: 'start-schedule-command-1',
      actorId: '11111111-1111-4111-8111-111111111111',
    } as const;
    const started = await app.startSchedule(startCommand);
    expect(started.tag).toBe('ok');
    if (started.tag === 'err') return;
    await expect(app.startSchedule(startCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        productionRunId: started.value.productionRunId,
        productionBatchIds: started.value.productionBatchIds,
        replayed: true,
      },
    });
    expect(runStarted).toHaveBeenCalledOnce();
    await expect(
      app.startSchedule({
        ...startCommand,
        expectedOutputPlanHash: 'different-plan-hash',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });

    await expect(
      app.applyFulfillmentDemand({
        ...orderDemand,
        fulfillmentVersion: 2,
        observedAt: '2026-07-10T14:10:00.000Z',
        projectionHash: '3'.repeat(64),
        commercialState: 'completed',
        idempotencyKey: 'order-demand-source-ahead',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied' },
    });
    expect(
      memory.inspect().demands.get(orderDemand.fulfillmentId),
    ).toMatchObject({
      admissionState: 'released',
      commercialState: 'completed',
    });
    expect(memory.inspect().orders.get(intake.value.orderId)).toMatchObject({
      status: 'scheduled',
    });

    const plannedBoard = await app.loadProductionBoard({
      locationId,
      productionRunId: started.value.productionRunId,
    });
    if (plannedBoard.tag === 'err') return;
    const washingStage = plannedBoard.value.batches[0]?.stages.find(
      (stage) => stage.stage === 'washing',
    );
    const washer = [...memory.inspect().machines.values()].find(
      (machine) => machine.stationKind === 'washing',
    );
    if (washingStage === undefined || washer === undefined) return;
    const assignmentCommand = {
      locationId,
      stageRunId: washingStage.id,
      machineIds: [washer.id],
      expectedVersion: washingStage.version,
      idempotencyKey: 'machine-assignment-1',
      actorId: '11111111-1111-4111-8111-111111111111',
    };
    await expect(
      app.assignStageMachines(assignmentCommand),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: false } });
    await expect(
      app.assignStageMachines(assignmentCommand),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
    await expect(
      app.assignStageMachines({ ...assignmentCommand, machineIds: [] }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });

    let board = await app.loadProductionBoard({
      locationId,
      productionRunId: started.value.productionRunId,
    });
    expect(board.tag).toBe('ok');
    if (board.tag === 'err') return;

    for (const [index, stage] of board.value.batches[0]!.stages.entries()) {
      time.set(stage.plannedStartAt.toISOString());
      const stageStarted = await app.advanceProductionStage({
        locationId,
        stageRunId: stage.id,
        expectedVersion: stage.version,
        idempotencyKey: `stage-start-${index}`,
        transition: 'start',
        actorId: '11111111-1111-4111-8111-111111111111',
      });
      expect(stageStarted.tag).toBe('ok');
      if (stageStarted.tag === 'err') return;
      if (!('version' in stageStarted.value))
        throw new Error('Stage start unexpectedly required confirmation.');
      await expect(
        app.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          expectedVersion: stage.version,
          idempotencyKey: `stage-start-${index}`,
          transition: 'start',
          actorId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
      await expect(
        app.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          expectedVersion: stage.version,
          idempotencyKey: `stage-start-${index}`,
          transition: 'complete',
          actorId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toMatchObject({
        tag: 'err',
        error: { code: 'production_idempotency_conflict', kind: 'conflict' },
      });

      time.set(new Date(stage.plannedEndAt.getTime() - 1).toISOString());
      await expect(
        app.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          expectedVersion: stageStarted.value.version,
          idempotencyKey: `stage-early-${index}`,
          transition: 'complete',
          actorId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toMatchObject({
        tag: 'ok',
        value: {
          status: 'confirmation_required',
          code: 'PULSE_BOUNDARY_NOT_REACHED',
          replayed: false,
        },
      });

      time.set(stage.plannedEndAt.toISOString());
      await expect(
        app.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          expectedVersion: stageStarted.value.version,
          idempotencyKey: `stage-complete-${index}`,
          transition: 'complete',
          actorId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toMatchObject({ tag: 'ok' });

      board = await app.loadProductionBoard({
        locationId,
        productionRunId: started.value.productionRunId,
      });
      if (board.tag === 'err') return;
    }

    expect(board.value.productionRun?.status).toBe('completed');
    expect(board.value.batches[0]?.status).toBe('finished');
    expect(board.value.batches[0]?.stages.map((stage) => stage.status)).toEqual(
      ['completed', 'completed', 'completed', 'completed'],
    );
    expect(
      board.value.batches[0]?.stages.every(
        (stage) => stage.actualStartAt !== null && stage.actualEndAt !== null,
      ),
    ).toBe(true);
    const terminal = memory.inspect();
    expect(terminal.orders.get(intake.value.orderId)).toMatchObject({
      status: 'finished',
      finishedAt: expect.any(String),
    });
    expect(terminal.bagStatuses.get(intake.value.orderId)).toEqual([
      'finished',
      'finished',
    ]);
    expect(
      terminal.activeBatchOrderIds.get(started.value.productionBatchIds[0]!)
        ?.size,
    ).toBe(0);
    expect(
      [...terminal.stageMachineStatuses.values()].every(
        (status) => status === 'completed',
      ),
    ).toBe(true);
    expect(
      terminal.batches.get(started.value.productionBatchIds[0]!),
    ).toMatchObject({
      status: 'finished',
      finishedAt: expect.any(String),
    });
    expect(terminal.runs.get(started.value.productionRunId)).toMatchObject({
      status: 'completed',
      completedAt: expect.any(String),
    });
    expect(terminal.shifts.get(shift.value.id)).toMatchObject({
      status: 'closed',
    });
  });
});
