import {
  productionBoardSchema,
  productionWorkspaceSchema,
} from '@pressly/contracts/production';
import { describe, expect, it, vi } from 'vitest';
import {
  mapWorkspaceRun,
  mapWorkspaceShift,
  toProductionWorkspaceResult,
  toWorkspaceProductionBoardResult,
} from '../../../../src/features/queries/load-workspace/load-production-workspace.contract.mapper.ts';
import type { ProductionWorkspaceModel } from '../../../../src/features/queries/load-workspace/load-production-workspace.model.ts';
import { isActionableWorkspaceSchedule } from '../../../../src/features/queries/load-workspace/workspace-schedule-actionability.policy.ts';
import type {
  LoadProductionWorkspaceRepository,
  ProductionWorkspaceReadModel,
} from '../../../../src/features/queries/load-workspace/load-production-workspace.port.ts';
import { makeLoadProductionWorkspace } from '../../../../src/features/queries/load-workspace/load-production-workspace.usecase.ts';
import { projectProductionBoard } from '../../../../src/foundations/language/board/production-board.projection.ts';
import { evaluateProductionBoardProjection } from '../../../../src/foundations/language/board/production-board-read.policy.ts';
import {
  allowPolicy,
  simpleScheduler,
} from '../../../support/production.fake.ts';

const ids = {
  shift: '00000000-0000-4000-8000-000000000001',
  run: '00000000-0000-4000-8000-000000000002',
  batch: '00000000-0000-4000-8000-000000000003',
  order: '00000000-0000-4000-8000-000000000004',
  crm: '00000000-0000-4000-8000-000000000005',
  sorting: '00000000-0000-4000-8000-000000000006',
  washing: '00000000-0000-4000-8000-000000000007',
  drying: '00000000-0000-4000-8000-000000000008',
  folding: '00000000-0000-4000-8000-000000000009',
  washer: '00000000-0000-4000-8000-000000000010',
  dryer: '00000000-0000-4000-8000-000000000011',
  wrongRun: '00000000-0000-4000-8000-000000000012',
} as const;

const location = {
  id: 'location-a',
  name: 'Alpha Facility',
  timezone: 'America/New_York',
  isActive: true,
} as const;
const fixedNow = new Date('2026-07-12T14:30:00.000Z');
const shift = {
  id: ids.shift,
  locationId: location.id,
  startsAt: new Date('2026-07-12T14:00:00.000Z'),
  endsAt: new Date('2026-07-12T20:00:00.000Z'),
  timezone: location.timezone,
  effectiveFolderCount: 2,
  status: 'open',
  version: 2,
} as const;
const run = {
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
} as const;

const emptyWorkspace: ProductionWorkspaceModel = {
  location,
  currentShift: null,
  shiftSelection: null,
  candidateShifts: [],
  currentSchedulerConfig: null,
  currentScheduleProposal: null,
  activeRuns: [],
  orders: [],
  pendingEligibleOrders: [],
  liveRunChanges: null,
  demandOutlook: null,
  board: null,
  stations: [],
  machines: [],
  asOf: fixedNow,
};

const stage = (
  id: string,
  stageKind: 'sorting' | 'washing' | 'drying' | 'folding_packaging',
  offset: number,
) => ({
  id,
  productionBatchId: ids.batch,
  stageKind,
  status: 'planned',
  plannedStartAt: new Date(shift.startsAt.getTime() + offset * 56 * 60_000),
  plannedEndAt: new Date(shift.startsAt.getTime() + (offset + 1) * 56 * 60_000),
  actualStartAt: null,
  actualEndAt: null,
  actualStartProvenance: 'not_recorded' as const,
  actualEndProvenance: 'not_recorded' as const,
  version: 1,
});

const evaluateBoard = (input: Parameters<typeof projectProductionBoard>[0]) =>
  evaluateProductionBoardProjection(projectProductionBoard(input), allowPolicy);

const resumedWorkspace = (): ProductionWorkspaceReadModel => {
  const order = {
    id: ids.order,
    locationId: location.id,
    orderDemandId: ids.crm,
    externalOrderId: 'C-1001',
    dueAt: new Date('2026-07-12T20:00:00.000Z'),
    priority: false,
    status: 'scheduled',
    derivedWeightLbs: 74,
    bagCount: 2,
    bagCountSource: 'operator_intake',
    intakeVersion: 1,
    pendingPlacement: null,
    version: 3,
  };
  const stages = [
    stage(ids.sorting, 'sorting', 0),
    stage(ids.washing, 'washing', 1),
    stage(ids.drying, 'drying', 2),
    stage(ids.folding, 'folding_packaging', 3),
  ];
  const assignments = [
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
  ];
  const projection = projectProductionBoard({
    shift,
    run,
    orders: [order],
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
    assignments,
    activeStages: [],
    activeProductionRunIds: [ids.run],
    now: fixedNow,
  });

  return {
    workspace: {
      ...emptyWorkspace,
      currentShift: mapWorkspaceShift(shift),
      activeRuns: [mapWorkspaceRun(run)],
      orders: projection.orders,
      board: null,
    },
    boardProjection: projection,
    demandOutlookRows: [],
    livePlacement: null,
  };
};

const setup = (repo: LoadProductionWorkspaceRepository) =>
  makeLoadProductionWorkspace({
    repo,
    clock: { now: () => fixedNow },
    policy: allowPolicy,
    scheduler: simpleScheduler,
  });

const emptyReadModel: ProductionWorkspaceReadModel = {
  workspace: { ...emptyWorkspace, board: null },
  boardProjection: null,
  demandOutlookRows: [],
  livePlacement: null,
};

describe('load production workspace', () => {
  it('returns not-found for unknown, inactive, or cross-location scope', async () => {
    const loadWorkspace = vi.fn(async (locationId: string) =>
      locationId === location.id ? emptyReadModel : null,
    );
    const load = setup({ loadWorkspace });

    await expect(load({ locationId: 'location-b' })).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_not_found', kind: 'not_found' },
    });
    expect(loadWorkspace).toHaveBeenCalledWith(
      'location-b',
      undefined,
      fixedNow,
    );
  });

  it('returns an active location with an empty resumable state', async () => {
    const load = setup({ loadWorkspace: async () => emptyReadModel });

    await expect(load({ locationId: location.id })).resolves.toEqual({
      tag: 'ok',
      value: emptyWorkspace,
    });
    expect(
      productionWorkspaceSchema.safeParse(
        toProductionWorkspaceResult(emptyWorkspace),
      ).success,
    ).toBe(true);
  });

  it('returns no live placement projection when the selected workspace has no started run', async () => {
    const load = setup({ loadWorkspace: async () => emptyReadModel });

    await expect(load({ locationId: location.id })).resolves.toMatchObject({
      tag: 'ok',
      value: { activeRuns: [], liveRunChanges: null },
    });
  });

  it('rejects a live placement projection for a different run identity', async () => {
    const readModel: ProductionWorkspaceReadModel = {
      ...resumedWorkspace(),
      livePlacement: {
        runContext: {
          input: {
            run: {
              id: ids.wrongRun,
              queueVersion: 1,
              startsAt: shift.startsAt.toISOString(),
              shiftEndsAt: shift.endsAt.toISOString(),
              pulseMinutes: 56,
              pulseCapacityLbs: 224,
            },
            machines: [],
            batches: [],
          },
          runStatus: 'started',
          batchVersions: {},
          assignedOrderIds: [],
        },
        orders: [],
      },
    };
    const load = setup({ loadWorkspace: async () => readModel });

    await expect(load({ locationId: location.id })).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_live_placement_run_mismatch',
        kind: 'conflict',
      },
    });
  });

  it('returns not-found when an explicit shift is outside the location', async () => {
    const unknownShiftId = '00000000-0000-4000-8000-000000000099';
    const loadWorkspace = vi.fn(
      async (_locationId: string, requestedShiftId?: string) =>
        requestedShiftId === unknownShiftId
          ? ('shift_not_found' as const)
          : emptyReadModel,
    );
    const load = setup({ loadWorkspace });

    await expect(
      load({ locationId: location.id, shiftId: unknownShiftId }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_not_found', kind: 'not_found' },
    });
    expect(loadWorkspace).toHaveBeenCalledWith(
      location.id,
      unknownShiftId,
      fixedNow,
    );
  });

  it('resumes an active run and board without calling sibling use cases', async () => {
    const readModel = resumedWorkspace();
    const loadWorkspace = vi.fn(async () => readModel);
    const load = setup({ loadWorkspace });

    const output = await load({ locationId: location.id });
    expect(output).toMatchObject({
      tag: 'ok',
      value: {
        activeRuns: [{ id: ids.run, status: 'started', queueVersion: 1 }],
        orders: [{ id: ids.order, status: 'scheduled', intakeVersion: 1 }],
        board: {
          productionRun: { id: ids.run, status: 'started', queueVersion: 1 },
          batches: [
            {
              orders: [{ externalOrderId: 'C-1001', bagCount: 2 }],
              stages: [
                {
                  stage: 'sorting',
                  machineIds: [],
                  nextAction: { state: 'available', action: 'start' },
                  allowedActions: ['start'],
                },
                { stage: 'washing', machineIds: [ids.washer] },
                { stage: 'drying', machineIds: [ids.dryer] },
                { stage: 'folding_packaging', machineIds: [] },
              ],
            },
          ],
        },
      },
    });
    expect(loadWorkspace).toHaveBeenCalledOnce();
    expect(output.tag).toBe('ok');
    if (output.tag === 'ok') {
      const parsed = productionWorkspaceSchema.safeParse(
        toProductionWorkspaceResult(output.value),
      );
      expect(parsed.success, parsed.error?.message).toBe(true);
    }
  });

  it('retains inactive historical membership after a batch finishes', () => {
    const board = evaluateBoard({
      shift,
      run: { ...run, status: 'completed' },
      orders: [
        {
          id: ids.order,
          locationId: location.id,
          orderDemandId: ids.crm,
          externalOrderId: 'C-1001',
          dueAt: new Date('2026-07-12T20:00:00.000Z'),
          priority: false,
          status: 'finished',
          derivedWeightLbs: 74,
          bagCount: 2,
          bagCountSource: 'operator_intake',
          intakeVersion: 1,
          pendingPlacement: null,
          version: 4,
        },
      ],
      batches: [
        {
          id: ids.batch,
          sequenceIndex: 0,
          status: 'finished',
          derivedWeightLbs: 74,
          pulseCapacityLbs: 224,
          pulseMinutes: 56,
          membershipFrozenAt: fixedNow,
          membershipFrozenBy: ids.crm,
          version: 5,
        },
      ],
      batchOrders: [
        {
          productionBatchId: ids.batch,
          productionOrderId: ids.order,
          active: false,
          placementProvenance: 'initial_schedule',
          pinnedAt: null,
          pinnedBy: null,
        },
      ],
      stages: [
        stage(ids.sorting, 'sorting', 0),
        stage(ids.washing, 'washing', 1),
        stage(ids.drying, 'drying', 2),
        stage(ids.folding, 'folding_packaging', 3),
      ],
      assignments: [],
      activeStages: [],
      activeProductionRunIds: [],
      now: fixedNow,
    });

    expect(board.batches[0]?.orders).toHaveLength(1);
    expect(board.batches[0]?.orders[0]?.externalOrderId).toBe('C-1001');
    expect(
      productionBoardSchema.safeParse(toWorkspaceProductionBoardResult(board))
        .success,
    ).toBe(true);
  });

  it('maps the persisted overtime preview into eligible board orders', () => {
    const board = evaluateBoard({
      shift,
      run,
      orders: [
        {
          id: ids.order,
          locationId: location.id,
          orderDemandId: ids.crm,
          externalOrderId: 'C-1001',
          dueAt: new Date('2026-07-12T20:00:00.000Z'),
          priority: true,
          status: 'eligible',
          derivedWeightLbs: 74,
          bagCount: 2,
          bagCountSource: 'operator_intake',
          intakeVersion: 1,
          pendingPlacement: {
            status: 'confirmation_required',
            mode: 'automatic',
            productionRunId: ids.run,
            target: { kind: 'new_batch', sequence: 1 },
            affectedBatchIds: [],
            queueVersion: 1,
            proposalHash: 'a'.repeat(64),
            projectedCompletionAt: '2026-07-12T21:00:00.000Z',
            overtimeMinutes: 60,
          },
          version: 3,
        },
      ],
      batches: [],
      batchOrders: [],
      stages: [],
      assignments: [],
      activeStages: [],
      activeProductionRunIds: [ids.run],
      now: fixedNow,
    });

    expect(board.eligibleOrders[0]?.placement).toMatchObject({
      status: 'confirmation_required',
      proposalHash: 'a'.repeat(64),
      queueVersion: 1,
    });
    expect(
      productionBoardSchema.safeParse(toWorkspaceProductionBoardResult(board))
        .success,
    ).toBe(true);
  });
});

describe('workspace schedule actionability', () => {
  const schedule = { id: ids.run, status: 'accepted' } as const;

  it('keeps an accepted plan actionable only before execution starts', () => {
    expect(
      isActionableWorkspaceSchedule({
        schedule,
        shift,
        committedScheduleRunIds: new Set(),
        now: fixedNow,
      }),
    ).toBe(true);
    expect(
      isActionableWorkspaceSchedule({
        schedule,
        shift,
        committedScheduleRunIds: new Set([schedule.id]),
        now: fixedNow,
      }),
    ).toBe(false);
  });

  it('rejects closed and expired shifts from the actionable plan set', () => {
    for (const unavailableShift of [
      { ...shift, status: 'closed' },
      { ...shift, endsAt: fixedNow },
    ])
      expect(
        isActionableWorkspaceSchedule({
          schedule,
          shift: unavailableShift,
          committedScheduleRunIds: new Set(),
          now: fixedNow,
        }),
      ).toBe(false);
  });
});
