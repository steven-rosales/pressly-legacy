import { describe, expect, it } from 'vitest';
import { makeProductionApplication } from '../../src/main.ts';
import { makeMemoryProductionRepositories } from '../support/memory-production-repositories.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';

const orderDemand = {
  demandKey: 'test:order:order-1',
  displayReference: 'order-1',
  locationId: 'location-1',
  revisionAt: '2026-07-10T13:59:00.000Z',
  revisionHash: '2'.repeat(64),
  state: 'ready_for_production' as const,
  dueAt: '2026-07-10T20:00:00.000Z',
  estimatedWeightLbs: 74,
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
    const app = makeProductionApplication({
      repositories: memory.repositories,
      policy: allowPolicy,
      scheduler: simpleScheduler,
      clock: time.clock,
      ids,
    });

    const appliedDemand = await app.applyOrderDemand(orderDemand);
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
      error: { code: 'production_idempotency_conflict', status: 409 },
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
      error: { code: 'production_idempotency_conflict', status: 409 },
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
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
    expect(config.tag).toBe('ok');
    expect(shift.tag).toBe('ok');
    if (config.tag === 'err' || shift.tag === 'err') return;

    const schedule = await app.createSchedule({
      locationId,
      productionShiftId: shift.value.id,
      schedulerConfigId: config.value.id,
      horizonEnd: '2026-07-11T03:59:59.999Z',
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
        productionRunId: accepted.value.productionRunId,
        productionBatchIds: accepted.value.productionBatchIds,
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
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    const plannedBoard = await app.loadProductionBoard({
      locationId,
      productionShiftId: shift.value.id,
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
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    const startRunCommand = {
      locationId,
      productionRunId: accepted.value.productionRunId,
      expectedVersion: 1,
      idempotencyKey: 'start-run-command-1',
      actorId: '11111111-1111-4111-8111-111111111111',
    } as const;
    await expect(
      app.startProductionRun(startRunCommand),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: false } });
    await expect(
      app.startProductionRun(startRunCommand),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
    await expect(
      app.startProductionRun({
        ...startRunCommand,
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });

    let board = await app.loadProductionBoard({
      locationId,
      productionShiftId: shift.value.id,
    });
    expect(board.tag).toBe('ok');
    if (board.tag === 'err') return;

    for (const [index, stage] of board.value.batches[0]!.stages.entries()) {
      time.set(stage.plannedStartAt);
      const started = await app.advanceProductionStage({
        locationId,
        stageRunId: stage.id,
        expectedVersion: stage.version,
        idempotencyKey: `stage-start-${index}`,
        transition: 'start',
        actorId: '11111111-1111-4111-8111-111111111111',
      });
      expect(started.tag).toBe('ok');
      if (started.tag === 'err') return;
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
        error: { code: 'production_idempotency_conflict', status: 409 },
      });

      time.set(new Date(Date.parse(stage.plannedEndAt) - 1).toISOString());
      await expect(
        app.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          expectedVersion: started.value.version,
          idempotencyKey: `stage-early-${index}`,
          transition: 'complete',
          actorId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toMatchObject({
        tag: 'err',
        error: { code: 'pulse_boundary_not_reached' },
      });

      time.set(stage.plannedEndAt);
      await expect(
        app.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          expectedVersion: started.value.version,
          idempotencyKey: `stage-complete-${index}`,
          transition: 'complete',
          actorId: '11111111-1111-4111-8111-111111111111',
        }),
      ).resolves.toMatchObject({ tag: 'ok' });

      board = await app.loadProductionBoard({
        locationId,
        productionShiftId: shift.value.id,
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
      terminal.activeBatchOrderIds.get(accepted.value.productionBatchIds[0]!)
        ?.size,
    ).toBe(0);
    expect(
      [...terminal.stageMachineStatuses.values()].every(
        (status) => status === 'completed',
      ),
    ).toBe(true);
    expect(
      terminal.batches.get(accepted.value.productionBatchIds[0]!),
    ).toMatchObject({
      status: 'finished',
      finishedAt: expect.any(String),
    });
    expect(terminal.runs.get(accepted.value.productionRunId)).toMatchObject({
      status: 'completed',
      completedAt: expect.any(String),
    });
    expect(terminal.shifts.get(shift.value.id)).toMatchObject({
      status: 'closed',
    });
  });
});
