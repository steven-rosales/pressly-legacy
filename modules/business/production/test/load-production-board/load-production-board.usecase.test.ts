import { productionBoardSchema } from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import { makeLoadProductionBoard } from '../../src/load-production-board/load-production-board.usecase.ts';
import { projectProductionBoard } from '../../src/persistence/production-board-projection.ts';
import { allowPolicy } from '../support/production.fake.ts';

const ids = {
  shift: '00000000-0000-4000-8000-000000000001',
  run: '00000000-0000-4000-8000-000000000002',
  batch: '00000000-0000-4000-8000-000000000003',
  order: '00000000-0000-4000-8000-000000000004',
  demand: '00000000-0000-4000-8000-000000000005',
  sorting: '00000000-0000-4000-8000-000000000006',
  washing: '00000000-0000-4000-8000-000000000007',
  drying: '00000000-0000-4000-8000-000000000008',
  folding: '00000000-0000-4000-8000-000000000009',
  washer: '00000000-0000-4000-8000-000000000010',
  dryer: '00000000-0000-4000-8000-000000000011',
} as const;

const now = new Date('2026-07-12T14:00:00.000Z');
const pulseMs = 56 * 60_000;

const projection = (stageStarted = false) => {
  const evaluationTime = stageStarted
    ? new Date('2026-07-12T14:18:00.000Z')
    : now;
  const stages = (
    [
      ['sorting', ids.sorting],
      ['washing', ids.washing],
      ['drying', ids.drying],
      ['folding_packaging', ids.folding],
    ] as const
  ).map(([stageKind, id], index) => ({
    id,
    productionBatchId: ids.batch,
    stageKind,
    status: stageStarted && index === 0 ? 'started' : 'planned',
    plannedStartAt: new Date(now.getTime() + index * pulseMs),
    plannedEndAt: new Date(now.getTime() + (index + 1) * pulseMs),
    actualStartAt: stageStarted && index === 0 ? now : null,
    actualEndAt: null,
    version: 1,
  }));
  return projectProductionBoard({
    shift: {
      id: ids.shift,
      locationId: 'location-a',
      startsAt: now,
      endsAt: new Date('2026-07-12T20:00:00.000Z'),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      status: 'open',
      version: 1,
    },
    run: {
      id: ids.run,
      productionShiftId: ids.shift,
      status: 'started',
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-07-12T18:00:00.000Z'),
      overtimeProposalHash: null,
      overtimeQueueVersion: null,
      overtimeAcknowledgedBy: null,
      overtimeAcknowledgedAt: null,
      version: 1,
    },
    orders: [
      {
        id: ids.order,
        locationId: 'location-a',
        orderDemandId: ids.demand,
        externalOrderId: 'C-1001',
        dueAt: new Date('2026-07-12T20:00:00.000Z'),
        priority: false,
        status: 'scheduled',
        derivedWeightLbs: 74,
        bagCount: 2,
        bagCountSource: 'operator_intake',
        intakeVersion: 1,
        pendingPlacement: null,
        version: 1,
      },
    ],
    batches: [
      {
        id: ids.batch,
        sequenceIndex: 0,
        status: 'queued',
        derivedWeightLbs: 74,
        pulseCapacityLbs: 224,
        pulseMinutes: 56,
        membershipFrozenAt: null,
        membershipFrozenBy: null,
        version: 1,
      },
    ],
    batchOrders: [
      {
        productionBatchId: ids.batch,
        productionOrderId: ids.order,
        active: true,
        placementProvenance: 'initial_schedule',
        pinnedAt: null,
        pinnedBy: null,
      },
    ],
    stages,
    assignments: [
      {
        stageRunId: ids.washing,
        machineId: ids.washer,
        plannedStartAt: stages[1]!.plannedStartAt,
        plannedEndAt: stages[1]!.plannedEndAt,
      },
      {
        stageRunId: ids.drying,
        machineId: ids.dryer,
        plannedStartAt: stages[2]!.plannedStartAt,
        plannedEndAt: stages[2]!.plannedEndAt,
      },
    ],
    activeStages: stageStarted
      ? [{ id: ids.sorting, stageKind: 'sorting' }]
      : [],
    activeProductionRunIds: [ids.run],
    now: evaluationTime,
  });
};

describe('load production board', () => {
  it('evaluates every stage from one read projection', async () => {
    const loadBoardProjection = vi.fn(async () => projection());
    const loadBoard = makeLoadProductionBoard({
      repo: { loadBoardProjection },
      policy: allowPolicy,
      clock: { now: () => now },
    });

    const result = await loadBoard({
      locationId: 'location-a',
      productionRunId: ids.run,
    });

    expect(result.tag).toBe('ok');
    if (result.tag !== 'ok') return;
    expect(loadBoardProjection).toHaveBeenCalledOnce();
    expect(result.value.batches[0]?.stages[0]).toMatchObject({
      nextAction: { state: 'available', action: 'start' },
      allowedActions: ['start'],
    });
    expect(result.value.batches[0]?.stages[1]).toMatchObject({
      nextAction: {
        state: 'blocked',
        action: 'start',
        code: 'STAGE_BOUNDARY_NOT_REACHED',
        availableAt: '2026-07-12T14:56:00.000Z',
      },
      allowedActions: [],
    });
    expect(productionBoardSchema.safeParse(result.value).success).toBe(true);
  });

  it('returns not found without attempting a fallback stage read', async () => {
    const loadBoardProjection = vi.fn(async () => null);
    const loadBoard = makeLoadProductionBoard({
      repo: { loadBoardProjection },
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(
      loadBoard({ locationId: 'location-a', productionRunId: ids.run }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_board_not_found', status: 404 },
    });
    expect(loadBoardProjection).toHaveBeenCalledOnce();
  });

  it('keeps early completion actionable while requiring confirmation', async () => {
    const loadBoard = makeLoadProductionBoard({
      repo: { loadBoardProjection: vi.fn(async () => projection(true)) },
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-12T14:18:00.000Z') },
    });

    const result = await loadBoard({
      locationId: 'location-a',
      productionRunId: ids.run,
    });

    expect(result.tag).toBe('ok');
    if (result.tag !== 'ok') return;
    expect(result.value.batches[0]?.stages[0]).toMatchObject({
      nextAction: {
        state: 'confirmation_required',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        timing: {
          elapsedMilliseconds: 18 * 60_000,
          remainingMilliseconds: 38 * 60_000,
        },
      },
      allowedActions: ['complete'],
    });
    expect(productionBoardSchema.safeParse(result.value).success).toBe(true);
  });
});
