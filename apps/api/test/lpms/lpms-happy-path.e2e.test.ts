import { describe, expect, it } from 'vitest';
import { makeProductionApplication } from '@pressly/production';
import { makeMemoryProductionRepositories } from '@pressly/production/testing';
import { makeProductionPolicy } from '@pressly/production-policy';
import { makeProductionScheduler } from '@pressly/production-scheduling';

const actorId = '11111111-1111-4111-8111-111111111111';
const locationId = 'location-1';

const makeIds = () => {
  let value = 1;
  return {
    next: () => `00000000-0000-4000-8000-${String(value++).padStart(12, '0')}`,
  };
};

const orders = [
  { externalOrderId: 'C-1082', weight: 150, bags: 3 },
  { externalOrderId: 'C-1094', weight: 74, bags: 2 },
  { externalOrderId: 'C-1101', weight: 140, bags: 4 },
  { externalOrderId: 'C-1106', weight: 84, bags: 2 },
  { externalOrderId: 'C-1112', weight: 130, bags: 3 },
  { externalOrderId: 'C-1118', weight: 94, bags: 2 },
  { externalOrderId: 'C-1124', weight: 128, bags: 3 },
] as const;

const demandCommand = (
  order: Readonly<{ externalOrderId: string; weight: number; bags: number }>,
  index: number,
  input: { revisionAt?: string; locationId?: string } = {},
) => {
  const revisionAt = input.revisionAt ?? '2026-07-10T13:59:00.000Z';
  return {
    demandKey: `test:order:${order.externalOrderId}`,
    displayReference: order.externalOrderId,
    locationId: input.locationId ?? locationId,
    revisionAt,
    revisionHash: (index + 101).toString(16).padStart(64, '0'),
    state: 'ready_for_production' as const,
    dueAt: '2026-07-10T21:00:00.000Z',
    estimatedWeightLbs: order.weight,
    bagCount: null,
    idempotencyKey: `demand-${index + 1}`,
  };
};

describe('LPMS v1 app-composed happy path', () => {
  it('moves 800 lb from canonical demand through a finished fixed-pulse run', async () => {
    const ids = makeIds();
    let now = new Date('2026-07-10T14:00:00.000Z');
    const clock = { now: () => new Date(now) };
    const memory = makeMemoryProductionRepositories({ ids });
    memory.seedMachines([
      ...Array.from({ length: 4 }, (_, index) => ({
        id: ids.next(),
        stationKind: 'washing' as const,
        label: `Washer ${index + 1}`,
        effectiveCapacityLbs: 60,
        active: true,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: ids.next(),
        stationKind: 'drying' as const,
        label: `Dryer ${index + 1}`,
        effectiveCapacityLbs: 60,
        active: true,
      })),
    ]);
    const application = makeProductionApplication({
      repositories: memory.repositories,
      policy: makeProductionPolicy(),
      scheduler: makeProductionScheduler(),
      clock,
      ids,
    });

    for (const [index, order] of orders.entries()) {
      const demand = demandCommand(order, index);
      const projected = await application.applyOrderDemand(demand);
      if (index === 0)
        await expect(
          application.applyOrderDemand(demand),
        ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
      expect(projected).toMatchObject({
        tag: 'ok',
        value: { outcome: 'applied' },
      });
      if (projected.tag === 'err' || projected.value.productionOrderId === null)
        return;
      if (index === 0)
        await expect(
          application.listProductionOrders({
            locationId,
            status: 'intake_pending',
            limit: 50,
          }),
        ).resolves.toMatchObject({
          tag: 'ok',
          value: { items: [{ bagCount: null, intakeVersion: null }] },
        });
      await expect(
        application.recordOrderIntake({
          locationId,
          orderId: projected.value.productionOrderId,
          bagCount: order.bags,
          expectedVersion: 1,
          actorId,
          idempotencyKey: `intake-${index + 1}`,
        }),
      ).resolves.toMatchObject({
        tag: 'ok',
        value: { bagCount: order.bags, bagCountProvenance: 'operator_intake' },
      });
    }

    await expect(
      application.applyOrderDemand(
        demandCommand(orders[0], 20, {
          revisionAt: '2026-07-10T13:58:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'ignored_older' },
    });

    await expect(
      application.applyOrderDemand(
        demandCommand(
          { externalOrderId: 'unmapped-order', weight: 10, bags: 1 },
          21,
          { locationId: 'unmapped-location' },
        ),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_unavailable' },
    });

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
      idempotencyKey: 'publish-config-v1',
    });
    const shift = await application.createProductionShift({
      locationId,
      startsAt: '2026-07-10T14:00:00.000Z',
      endsAt: '2026-07-10T20:00:00.000Z',
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      actorId,
      idempotencyKey: 'create-shift-v1',
    });
    expect(config.tag).toBe('ok');
    expect(shift.tag).toBe('ok');
    if (config.tag === 'err' || shift.tag === 'err') return;

    const schedule = await application.createSchedule({
      locationId,
      productionShiftId: shift.value.id,
      schedulerConfigId: config.value.id,
      horizonEnd: '2026-07-10T23:59:59.999Z',
    });
    expect(schedule.tag).toBe('ok');
    if (schedule.tag === 'err') return;
    expect(
      schedule.value.batches.map((batch) => batch.derivedWeightLbs),
    ).toEqual([224, 224, 224, 128]);
    expect(schedule.value.batches.map((batch) => batch.bagCount)).toEqual([
      5, 6, 5, 3,
    ]);
    expect(schedule.value).toMatchObject({
      pulseCapacityLbs: 224,
      makespanMinutes: 392,
      plannedCompletionAt: '2026-07-10T20:32:00.000Z',
    });
    expect(schedule.value.warnings).toContainEqual(
      expect.objectContaining({ code: 'SHIFT_OVERFLOW', blocking: true }),
    );

    await expect(
      application.acceptSchedule({
        locationId,
        scheduleRunId: schedule.value.scheduleRunId,
        expectedOutputPlanHash: schedule.value.outputPlanHash,
        acknowledgedWarningCodes: [],
        actorId,
        idempotencyKey: 'accept-schedule-v1',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'schedule_warning_not_acknowledged' },
    });

    const accepted = await application.acceptSchedule({
      locationId,
      scheduleRunId: schedule.value.scheduleRunId,
      expectedOutputPlanHash: schedule.value.outputPlanHash,
      acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
      actorId,
      idempotencyKey: 'accept-schedule-v1',
    });
    expect(accepted.tag).toBe('ok');
    if (accepted.tag === 'err') return;
    await expect(
      application.acceptSchedule({
        locationId,
        scheduleRunId: schedule.value.scheduleRunId,
        expectedOutputPlanHash: schedule.value.outputPlanHash,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
        actorId,
        idempotencyKey: 'accept-schedule-v1',
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });

    let board = await application.loadProductionBoard({
      locationId,
      productionShiftId: shift.value.id,
    });
    expect(board.tag).toBe('ok');
    if (board.tag === 'err' || board.value.productionRun === null) return;
    expect(
      board.value.batches
        .flatMap((batch) => batch.stages)
        .flatMap((stage) => stage.allowedActions),
    ).toEqual([]);

    await application.startProductionRun({
      locationId,
      productionRunId: board.value.productionRun.id,
      expectedVersion: board.value.productionRun.version,
      actorId,
      idempotencyKey: 'start-run-v1',
    });

    const boundaries = [
      ...new Set(
        schedule.value.batches.flatMap((batch) =>
          batch.stages.flatMap((stage) => [stage.startsAt, stage.endsAt]),
        ),
      ),
    ].sort((left, right) => Date.parse(left) - Date.parse(right));
    let provedEarlyBoundary = false;

    for (const boundary of boundaries) {
      now = new Date(boundary);
      board = await application.loadProductionBoard({
        locationId,
        productionShiftId: shift.value.id,
      });
      if (board.tag === 'err') return;

      for (const stage of board.value.batches
        .flatMap((batch) => batch.stages)
        .filter(
          (stage) =>
            stage.status === 'started' && stage.plannedEndAt === boundary,
        )) {
        if (!provedEarlyBoundary) {
          now = new Date(Date.parse(boundary) - 1);
          await expect(
            application.advanceProductionStage({
              locationId,
              stageRunId: stage.id,
              transition: 'complete',
              expectedVersion: stage.version,
              actorId,
              idempotencyKey: 'early-completion-proof',
            }),
          ).resolves.toMatchObject({
            tag: 'err',
            error: { code: 'pulse_boundary_not_reached' },
          });
          now = new Date(boundary);
          provedEarlyBoundary = true;
        }
        const completed = await application.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          transition: 'complete',
          expectedVersion: stage.version,
          actorId,
          idempotencyKey: `complete-${stage.id}`,
        });
        expect(completed).toMatchObject({ tag: 'ok' });
      }

      board = await application.loadProductionBoard({
        locationId,
        productionShiftId: shift.value.id,
      });
      if (board.tag === 'err') return;
      if (boundary === '2026-07-10T14:56:00.000Z')
        expect(
          [...memory.inspect().stages.values()]
            .filter((stage) => stage.stage === 'sorting')
            .map((stage) => stage.status),
        ).toEqual(['completed', 'planned', 'planned', 'planned']);
      const stagesStartingNow = board.value.batches
        .flatMap((batch) => batch.stages)
        .filter(
          (stage) =>
            stage.status === 'planned' && stage.plannedStartAt === boundary,
        );
      if (boundary === '2026-07-10T14:56:00.000Z') {
        const sorting = stagesStartingNow.find(
          (stage) => stage.stage === 'sorting',
        )!;
        const context = await memory.inspectStageTransitionContext(
          sorting.id,
          now,
        );
        expect(context).toMatchObject({
          productionRunStarted: true,
          previousStageCompleted: true,
          sameKindAlreadyActive: false,
        });
      }
      expect(
        stagesStartingNow.map((stage) => stage.allowedActions),
        `start actions at ${boundary}`,
      ).toEqual(stagesStartingNow.map(() => ['start']));
      for (const stage of stagesStartingNow) {
        const started = await application.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          transition: 'start',
          expectedVersion: stage.version,
          actorId,
          idempotencyKey: `start-${stage.id}`,
        });
        expect(started).toMatchObject({ tag: 'ok' });
      }
    }

    board = await application.loadProductionBoard({
      locationId,
      productionShiftId: shift.value.id,
    });
    if (board.tag === 'ok')
      expect(
        board.value.batches.map((batch) =>
          batch.stages.map((stage) => ({
            stage: stage.stage,
            status: stage.status,
            start: stage.plannedStartAt,
            end: stage.plannedEndAt,
            actions: stage.allowedActions,
          })),
        ),
      ).toEqual(
        board.value.batches.map((batch) =>
          batch.stages.map((stage) => ({
            stage: stage.stage,
            status: 'completed',
            start: stage.plannedStartAt,
            end: stage.plannedEndAt,
            actions: [],
          })),
        ),
      );
    expect(board).toMatchObject({
      tag: 'ok',
      value: {
        productionRun: { status: 'completed' },
        batches: [
          { status: 'finished' },
          { status: 'finished' },
          { status: 'finished' },
          { status: 'finished' },
        ],
      },
    });
  });
});
