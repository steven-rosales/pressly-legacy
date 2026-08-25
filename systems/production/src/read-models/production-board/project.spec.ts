import { productionBoardSchema } from './contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../model/public.ts';
import {
  evaluateBoardProjection,
  projectBoardSnapshot,
  serializeBoard,
} from './project.ts';
import type { BoardProjectionInput } from './model.ts';

const id = (suffix: number): string =>
  `32000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const ids = {
  shift: id(1),
  run: id(2),
  queuedBatch: id(3),
  finishedBatch: id(4),
  scheduledOrder: id(5),
  finishedOrder: id(6),
  eligibleOrder: id(7),
  placedEligibleOrder: id(8),
  actor: id(9),
  washer: id(10),
  dryer: id(11),
  externalStage: id(12),
} as const;

const now = new Date('2026-08-21T16:00:00.000Z');
const pulse = 60 * 60_000;

const order = (input: {
  id: string;
  status: 'scheduled' | 'finished' | 'eligible';
  dueAt: string;
  pendingPlacement?: unknown;
}) => ({
  id: input.id,
  locationId: 'location-1',
  orderDemandId: id(100 + Number(input.id.slice(-2))),
  externalOrderId: `ORDER-${input.id.slice(-2)}`,
  dueAt: new Date(input.dueAt),
  priority: input.status === 'eligible',
  status: input.status,
  derivedWeightLbs: 20,
  bagCount: 1,
  bagCountSource: 'operator_intake',
  intakeVersion: 1,
  pendingPlacement: input.pendingPlacement ?? null,
  version: 1,
});

const stages = (batchId: string, firstId: number, completed = false) =>
  (
    [
      ['sorting', 0],
      ['washing', 1],
      ['drying', 2],
      ['folding_packaging', 3],
    ] as const
  ).map(([stageKind, index]) => ({
    id: id(firstId + index),
    productionBatchId: batchId,
    stageKind,
    status:
      completed || (batchId === ids.queuedBatch && index === 0)
        ? ('completed' as const)
        : ('planned' as const),
    plannedStartAt: new Date(now.getTime() - pulse + index * pulse),
    plannedEndAt: new Date(now.getTime() + index * pulse),
    actualStartAt: null,
    actualEndAt: null,
    actualStartProvenance: 'not_recorded' as const,
    actualEndProvenance: 'not_recorded' as const,
    version: 1,
  }));

const fullInput = (): BoardProjectionInput => {
  const queuedStages = stages(ids.queuedBatch, 20);
  const finishedStages = stages(ids.finishedBatch, 30, true);
  return {
    shift: {
      id: ids.shift,
      locationId: 'location-1',
      startsAt: new Date('2026-08-21T12:00:00.000Z'),
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      status: 'open',
      version: 1,
    },
    run: {
      id: ids.run,
      productionShiftId: ids.shift,
      status: 'started',
      queueVersion: 3,
      plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
      overtimeProposalHash: null,
      overtimeQueueVersion: null,
      overtimeAcknowledgedBy: null,
      overtimeAcknowledgedAt: null,
      version: 2,
    },
    orders: [
      order({
        id: ids.scheduledOrder,
        status: 'scheduled',
        dueAt: '2026-08-21T20:00:00.000Z',
      }),
      order({
        id: ids.finishedOrder,
        status: 'finished',
        dueAt: '2026-08-20T20:00:00.000Z',
      }),
      order({
        id: ids.eligibleOrder,
        status: 'eligible',
        dueAt: '2026-08-22T20:00:00.000Z',
      }),
      order({
        id: ids.placedEligibleOrder,
        status: 'eligible',
        dueAt: '2026-08-24T20:00:00.000Z',
        pendingPlacement: {
          status: 'confirmation_required',
          mode: 'automatic',
          productionRunId: ids.run,
          target: {
            kind: 'existing_batch',
            productionBatchId: ids.queuedBatch,
            sequence: 0,
          },
          affectedBatchIds: [ids.queuedBatch],
          queueVersion: 3,
          proposalHash: 'a'.repeat(64),
          projectedCompletionAt: '2026-08-21T21:00:00.000Z',
          overtimeMinutes: 60,
        },
      }),
    ],
    batches: [
      {
        id: ids.queuedBatch,
        sequenceIndex: 0,
        status: 'queued',
        derivedWeightLbs: 20,
        pulseCapacityLbs: 100,
        pulseMinutes: 60,
        membershipFrozenAt: null,
        membershipFrozenBy: null,
        version: 1,
      },
      {
        id: ids.finishedBatch,
        sequenceIndex: 1,
        status: 'finished',
        derivedWeightLbs: 20,
        pulseCapacityLbs: 100,
        pulseMinutes: 60,
        membershipFrozenAt: new Date('2026-08-21T12:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        version: 4,
      },
    ],
    batchOrders: [
      {
        productionBatchId: ids.queuedBatch,
        productionOrderId: ids.finishedOrder,
        active: false,
        placementProvenance: 'initial_schedule',
        pinnedAt: null,
        pinnedBy: null,
      },
      {
        productionBatchId: ids.queuedBatch,
        productionOrderId: ids.scheduledOrder,
        active: true,
        placementProvenance: 'initial_schedule',
        pinnedAt: null,
        pinnedBy: null,
      },
      {
        productionBatchId: ids.finishedBatch,
        productionOrderId: ids.finishedOrder,
        active: false,
        placementProvenance: 'exception_route',
        pinnedAt: null,
        pinnedBy: null,
      },
    ],
    // Deliberately scramble the selected rows; the pure projector restores
    // planned-time/stage-rank order within each SQL-ordered batch.
    stages: [
      queuedStages[2]!,
      queuedStages[0]!,
      finishedStages[3]!,
      queuedStages[3]!,
      finishedStages[1]!,
      queuedStages[1]!,
      finishedStages[0]!,
      finishedStages[2]!,
    ],
    assignments: [
      {
        stageRunId: queuedStages[1]!.id,
        machineId: ids.washer,
        plannedStartAt: queuedStages[1]!.plannedStartAt,
        plannedEndAt: queuedStages[1]!.plannedEndAt,
      },
      {
        stageRunId: queuedStages[2]!.id,
        machineId: ids.dryer,
        plannedStartAt: queuedStages[2]!.plannedStartAt,
        plannedEndAt: queuedStages[2]!.plannedEndAt,
      },
    ],
    activeStages: [],
    activeProductionRunIds: [ids.run],
    now,
  };
};

describe('Production board read-model projection', () => {
  it('projects the complete board, local due buckets, membership history, stage order, and canonical next actions', () => {
    const projection = projectBoardSnapshot(fullInput());
    const board = evaluateBoardProjection(projection, productionRules);
    const serialized = serializeBoard(board);

    expect(board.batches.map(({ id: batchId }) => batchId)).toEqual([
      ids.queuedBatch,
      ids.finishedBatch,
    ]);
    expect(board.batches[0]?.orders.map(({ id: orderId }) => orderId)).toEqual([
      ids.scheduledOrder,
    ]);
    expect(board.batches[1]?.orders.map(({ id: orderId }) => orderId)).toEqual([
      ids.finishedOrder,
    ]);
    expect(board.batches[0]?.stages.map(({ stage }) => stage)).toEqual([
      'sorting',
      'washing',
      'drying',
      'folding_packaging',
    ]);
    expect(board.batches[0]?.stages[0]?.nextAction).toEqual({
      state: 'terminal',
      reason: 'stage_completed',
    });
    expect(board.batches[0]?.stages[1]?.nextAction).toEqual({
      state: 'available',
      action: 'start',
    });
    expect(board.batches[0]?.stages[2]?.nextAction).toMatchObject({
      state: 'blocked',
      code: 'PREVIOUS_STAGE_INCOMPLETE',
    });
    expect(board.batches[0]?.orders[0]?.dueBucket).toBe('today');
    expect(board.batches[1]?.orders[0]?.dueBucket).toBe('overdue');
    expect(board.eligibleOrders.map(({ dueBucket }) => dueBucket)).toEqual([
      'tomorrow',
      'later',
    ]);
    expect(board.eligibleOrders[0]?.placement).toMatchObject({
      status: 'awaiting_run',
      reason: 'automatic_placement_not_attempted',
    });
    expect(board.eligibleOrders[1]?.placement).toMatchObject({
      status: 'confirmation_required',
      projectedCompletionAt: new Date('2026-08-21T21:00:00.000Z'),
    });
    expect(projection.orders).toHaveLength(4);
    expect(productionBoardSchema.safeParse(serialized).success).toBe(true);
    expect(JSON.stringify(serialized)).not.toContain('identity');
  });

  it('sorts ambiguous active-run defaults while preserving committed pending placement', () => {
    const input = fullInput();
    const projection = projectBoardSnapshot({
      ...input,
      activeProductionRunIds: [id(99), ids.run],
    });

    expect(projection.board.eligibleOrders[0]?.placement).toEqual({
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: [ids.run, id(99)].sort(),
    });
    expect(projection.board.eligibleOrders[1]?.placement.status).toBe(
      'confirmation_required',
    );
  });

  it('builds active-stage and bounded assignment conflict context explicitly', () => {
    const input = fullInput();
    const washing = input.stages.find(
      (stage) =>
        stage.productionBatchId === ids.queuedBatch &&
        stage.stageKind === 'washing',
    )!;
    const projection = projectBoardSnapshot({
      ...input,
      activeStages: [{ id: ids.externalStage, stageKind: 'washing' }],
      assignments: [
        ...input.assignments,
        {
          stageRunId: ids.externalStage,
          machineId: ids.washer,
          plannedStartAt: washing.plannedStartAt,
          plannedEndAt: washing.plannedEndAt,
        },
      ],
    });
    const context = projection.stageNextActionContexts.find(
      ({ stageRunId }) => stageRunId === washing.id,
    );

    expect(context?.context).toMatchObject({
      sameKindAlreadyActive: true,
      machinesRequired: true,
      assignedMachineIds: [ids.washer],
      overlappingMachineIds: [ids.washer],
    });
  });

  it('preserves early-completion confirmation timing from productionRules', () => {
    const input = fullInput();
    const queuedStages = input.stages.filter(
      (stage) => stage.productionBatchId === ids.queuedBatch,
    );
    const sorting = queuedStages.find(
      (stage) => stage.stageKind === 'sorting',
    )!;
    const observedAt = new Date(sorting.plannedStartAt.getTime() + 18 * 60_000);
    const projection = projectBoardSnapshot({
      ...input,
      now: observedAt,
      stages: input.stages.map((stage) =>
        stage.id === sorting.id
          ? {
              ...stage,
              status: 'started',
              actualStartAt: sorting.plannedStartAt,
              actualStartProvenance: 'live_observed',
            }
          : stage,
      ),
    });
    const board = evaluateBoardProjection(projection, productionRules);

    expect(board.batches[0]?.stages[0]?.nextAction).toMatchObject({
      state: 'confirmation_required',
      action: 'complete',
      code: 'PULSE_BOUNDARY_NOT_REACHED',
      timing: {
        elapsedMilliseconds: 18 * 60_000,
        remainingMilliseconds: 42 * 60_000,
      },
    });
  });

  it('fails closed on malformed placement, missing membership order, and missing stage policy context', () => {
    const malformed = fullInput();
    expect(() =>
      projectBoardSnapshot({
        ...malformed,
        orders: malformed.orders.map((row) =>
          row.id === ids.eligibleOrder
            ? { ...row, pendingPlacement: { status: 'awaiting_run' } }
            : row,
        ),
      }),
    ).toThrow('An eligible order has invalid pending placement state.');

    expect(() =>
      projectBoardSnapshot({
        ...fullInput(),
        orders: fullInput().orders.filter(
          (row) => row.id !== ids.scheduledOrder,
        ),
      }),
    ).toThrow('A production batch references a missing order.');

    const projection = projectBoardSnapshot(fullInput());
    try {
      evaluateBoardProjection(
        { ...projection, stageNextActionContexts: [] },
        productionRules,
      );
      expect.unreachable('missing context should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error.code).toBe('production_board_stage_context_missing');
    }
  });
});
