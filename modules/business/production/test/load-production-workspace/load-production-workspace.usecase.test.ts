import {
  productionWorkspaceSchema,
  type ProductionWorkspace,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  mapWorkspaceBoard,
  mapWorkspaceRun,
  mapWorkspaceShift,
  selectCurrentWorkspaceShift,
} from '../../src/load-production-workspace/load-production-workspace.mapper.ts';
import type { LoadProductionWorkspaceRepository } from '../../src/load-production-workspace/load-production-workspace.port.ts';
import { makeLoadProductionWorkspace } from '../../src/load-production-workspace/load-production-workspace.usecase.ts';

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
  status: 'planned',
  version: 1,
} as const;

const emptyWorkspace: ProductionWorkspace = {
  location,
  currentShift: null,
  currentSchedulerConfig: null,
  latestScheduleProposal: null,
  activeRun: null,
  board: null,
  stations: [],
  machines: [],
  asOf: fixedNow.toISOString(),
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
  version: 1,
});

const resumedWorkspace = () => {
  const board = mapWorkspaceBoard({
    shift,
    run,
    orders: [
      {
        id: ids.order,
        orderDemandId: ids.crm,
        externalOrderId: 'C-1001',
        dueAt: new Date('2026-07-12T20:00:00.000Z'),
        priority: false,
        status: 'scheduled',
        derivedWeightLbs: 74,
        bagCount: 2,
        version: 3,
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
        version: 1,
      },
    ],
    batchOrders: [
      { productionBatchId: ids.batch, productionOrderId: ids.order },
    ],
    stages: [
      stage(ids.sorting, 'sorting', 0),
      stage(ids.washing, 'washing', 1),
      stage(ids.drying, 'drying', 2),
      stage(ids.folding, 'folding_packaging', 3),
    ],
    assignments: [
      { stageRunId: ids.washing, machineId: ids.washer },
      { stageRunId: ids.drying, machineId: ids.dryer },
    ],
    now: fixedNow,
  });

  return {
    ...emptyWorkspace,
    currentShift: mapWorkspaceShift(shift),
    activeRun: mapWorkspaceRun(run),
    board,
  };
};

const setup = (repo: LoadProductionWorkspaceRepository) =>
  makeLoadProductionWorkspace({ repo, clock: { now: () => fixedNow } });

describe('load production workspace', () => {
  it('returns not-found for unknown, inactive, or cross-location scope', async () => {
    const loadWorkspace = vi.fn(async (locationId: string) =>
      locationId === location.id ? emptyWorkspace : null,
    );
    const load = setup({ loadWorkspace });

    await expect(load({ locationId: 'location-b' })).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_not_found', status: 404 },
    });
    expect(loadWorkspace).toHaveBeenCalledWith('location-b', fixedNow);
  });

  it('returns an active location with an empty resumable state', async () => {
    const load = setup({ loadWorkspace: async () => emptyWorkspace });

    await expect(load({ locationId: location.id })).resolves.toEqual({
      tag: 'ok',
      value: emptyWorkspace,
    });
    expect(productionWorkspaceSchema.safeParse(emptyWorkspace).success).toBe(
      true,
    );
  });

  it('resumes an active run and board without calling sibling use cases', async () => {
    const workspace = resumedWorkspace();
    const loadWorkspace = vi.fn(async () => workspace);
    const load = setup({ loadWorkspace });

    await expect(load({ locationId: location.id })).resolves.toMatchObject({
      tag: 'ok',
      value: {
        activeRun: { id: ids.run, status: 'planned' },
        board: {
          productionRun: { allowedActions: ['start'] },
          batches: [
            {
              orders: [{ externalOrderId: 'C-1001', bagCount: 2 }],
              stages: [
                { stage: 'sorting', machineIds: [] },
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
    expect(productionWorkspaceSchema.safeParse(workspace).success).toBe(true);
  });
});

describe('workspace shift selection', () => {
  it('prefers the current open shift over a newer draft', () => {
    const newerDraft = {
      ...shift,
      id: '00000000-0000-4000-8000-000000000012',
      status: 'draft',
      startsAt: new Date('2026-07-13T14:00:00.000Z'),
      endsAt: new Date('2026-07-13T20:00:00.000Z'),
    };

    expect(selectCurrentWorkspaceShift([newerDraft, shift], fixedNow)?.id).toBe(
      shift.id,
    );
  });

  it('uses the nearest viable draft when no shift is open', () => {
    const first = {
      ...shift,
      id: '00000000-0000-4000-8000-000000000012',
      status: 'draft',
      startsAt: new Date('2026-07-13T14:00:00.000Z'),
      endsAt: new Date('2026-07-13T20:00:00.000Z'),
    };
    const later = {
      ...first,
      id: '00000000-0000-4000-8000-000000000013',
      startsAt: new Date('2026-07-14T14:00:00.000Z'),
      endsAt: new Date('2026-07-14T20:00:00.000Z'),
    };

    expect(selectCurrentWorkspaceShift([later, first], fixedNow)?.id).toBe(
      first.id,
    );
  });

  it('returns null when only expired drafts exist', () => {
    expect(
      selectCurrentWorkspaceShift(
        [
          {
            ...shift,
            status: 'draft',
            startsAt: new Date('2026-07-11T14:00:00.000Z'),
            endsAt: new Date('2026-07-11T20:00:00.000Z'),
          },
        ],
        fixedNow,
      ),
    ).toBeNull();
  });
});
