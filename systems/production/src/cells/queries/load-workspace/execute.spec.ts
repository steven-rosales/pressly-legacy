import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadWorkspaceCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { BoardProjection } from '../../../read-models/production-board/model.ts';
import {
  makeExecuteLoadWorkspace,
  type LoadWorkspaceRepository,
  type WorkspaceReadModel,
} from './execute.ts';
import type {
  LoadWorkspaceExpectedFailure,
  OnlinePlacementResult,
  WorkspaceBaseModel,
  WorkspaceScheduler,
} from './types.ts';

const id = (suffix: number): string =>
  `35000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const asOf = new Date('2026-08-21T16:00:00.000Z');

const scheduler: WorkspaceScheduler = {
  forecastDemand: () => ({
    algorithmVersion: 'fixed-pulse-demand-outlook-v1',
    startsAt: asOf.toISOString(),
    completesAt: asOf.toISOString(),
    pulseMinutes: 60,
    pulseCapacityLbs: 0,
    batchCount: 0,
    makespanMinutes: 0,
    batches: [],
    unplacedDemandIds: [],
  }),
  proposeOnlinePlacement: (input): OnlinePlacementResult => ({
    kind: 'rejected',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'a'.repeat(64),
    reason: { code: 'NO_MUTABLE_POSITION', message: input.order.id },
  }),
};

const baseWorkspace = (): WorkspaceBaseModel => ({
  location: {
    id: 'location-1',
    name: 'Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  currentShift: null,
  shiftSelection: null,
  candidateShifts: [],
  currentSchedulerConfig: null,
  currentScheduleProposal: null,
  activeRuns: [],
  orders: [2, 1].map((suffix) => ({
    id: id(suffix),
    locationId: 'location-1',
    externalOrderId: `ORDER-${suffix}`,
    dueAt: new Date(`2026-08-2${suffix}T20:00:00.000Z`),
    dueBucket: suffix === 1 ? ('today' as const) : ('tomorrow' as const),
    priority: false,
    status: 'eligible' as const,
    derivedWeightLbs: 20,
    bagCount: 1,
    bagCountProvenance: 'operator_intake' as const,
    intakeVersion: 1,
    version: 1,
  })),
  pendingEligibleOrders: [2, 1].map((suffix) => ({
    id: id(suffix),
    externalOrderId: `ORDER-${suffix}`,
    dueAt: `2026-08-2${suffix}T20:00:00.000Z`,
    dueBucket: suffix === 1 ? ('today' as const) : ('tomorrow' as const),
    priority: false,
    derivedWeightLbs: 20,
    bagCount: 1,
    version: 1,
    placement: {
      status: 'awaiting_run' as const,
      reason: 'no_started_run' as const,
      message: 'Waiting.',
    },
  })),
  liveRunChanges: null,
  demandOutlook: null,
  board: null,
  stations: [],
  machines: [],
  asOf,
});

const readModel = (): WorkspaceReadModel => ({
  workspace: baseWorkspace(),
  boardProjection: null,
  demandOutlookRows: [],
  livePlacement: null,
});

const make = (repo: LoadWorkspaceRepository, clock = { now: () => asOf }) =>
  makeExecuteLoadWorkspace({
    repo,
    clock,
    policy: productionRules,
    scheduler,
  });

const expectedFailureCases: readonly Readonly<{
  name: string;
  loaded: 'shift_not_found' | null;
  failure: LoadWorkspaceExpectedFailure;
}>[] = [
  {
    name: 'missing location',
    loaded: null,
    failure: {
      tag: 'ProductionFailure',
      kind: 'not_found',
      code: 'production_location_not_found',
      message: 'The active production location was not found.',
      safeMessage: 'The active production location was not found.',
    },
  },
  {
    name: 'missing explicit shift',
    loaded: 'shift_not_found',
    failure: {
      tag: 'ProductionFailure',
      kind: 'not_found',
      code: 'production_shift_not_found',
      message: 'The requested production shift was not found at this location.',
      safeMessage:
        'The requested production shift was not found at this location.',
    },
  },
];

describe('load-workspace executor', () => {
  it('consumes the canonical Production board projection without adaptation', () => {
    expectTypeOf<
      WorkspaceReadModel['boardProjection']
    >().toEqualTypeOf<BoardProjection | null>();
  });

  proveOperation({
    operationId: 'production.load-workspace.v1',
    declaration: loadWorkspaceCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'reads one clock value before the repository and preserves unordered workspace arrays',
        proves: ['executor-success'],
        run: async () => {
          const timing: string[] = [];
          const load = vi.fn<LoadWorkspaceRepository['load']>(async () => {
            timing.push('read');
            return readModel();
          });
          const execute = make(
            { load },
            {
              now: () => {
                timing.push('clock');
                return asOf;
              },
            },
          );
          const outcome = await execute({ locationId: 'location-1' });

          expect(outcome.kind).toBe('success');
          if (outcome.kind !== 'success') return;
          expect(timing).toEqual(['clock', 'read']);
          expect(load).toHaveBeenCalledWith('location-1', undefined, asOf);
          expect(
            outcome.value.orders.map(({ id: orderId }) => orderId),
          ).toEqual([id(2), id(1)]);
          expect(
            outcome.value.pendingEligibleOrders.map(
              ({ id: orderId }) => orderId,
            ),
          ).toEqual([id(2), id(1)]);
          expect(outcome.value.asOf).toBe(asOf.toISOString());
        },
      },
    ],
  });

  it.each(expectedFailureCases)(
    'returns the exact typed $name failure',
    async ({ loaded, failure }) => {
      const execute = make({ load: async () => loaded });
      await expect(
        execute({ locationId: 'location-1', shiftId: id(10) }),
      ).resolves.toEqual({
        kind: 'failure',
        failure,
      });
    },
  );

  it('rejects every stale live-placement run or queue identity', async () => {
    const shiftId = id(10);
    const runId = id(11);
    const model = readModel();
    const current = {
      ...model,
      workspace: {
        ...model.workspace,
        currentShift: {
          id: shiftId,
          locationId: 'location-1',
          startsAt: asOf,
          endsAt: new Date(asOf.getTime() + 8 * 60 * 60_000),
          timezone: 'America/New_York',
          effectiveFolderCount: 2,
          status: 'open' as const,
          version: 1,
        },
        activeRuns: [
          {
            id: runId,
            productionShiftId: shiftId,
            status: 'started' as const,
            queueVersion: 2,
            plannedCompletionAt: asOf,
            overtimeAcknowledgement: null,
            version: 1,
          },
        ],
      },
      livePlacement: {
        runContext: {
          input: {
            run: {
              id: runId,
              queueVersion: 1,
              startsAt: asOf.toISOString(),
              shiftEndsAt: new Date(
                asOf.getTime() + 8 * 60 * 60_000,
              ).toISOString(),
              pulseMinutes: 60,
              pulseCapacityLbs: 100,
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
    } satisfies WorkspaceReadModel;
    const execute = make({ load: async () => current });

    await expect(execute({ locationId: 'location-1' })).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_live_placement_run_mismatch',
        kind: 'conflict',
      },
    });
  });

  it('maps unknown faults and preserves owned AppErrors', async () => {
    const unknown = make({
      load: async () => {
        throw { fault: 'database offline' };
      },
    });
    await expect(unknown({ locationId: 'location-1' })).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_workspace_load_failed',
      message: 'The production workspace could not be loaded.',
      safeMessage: 'The production workspace could not be loaded.',
      status: 503,
    });

    const owned = invariantViolationError({
      code: 'workspace_projection_invalid',
      message: 'Workspace projection invalid.',
    });
    const preserve = make({ load: async () => Promise.reject(owned) });
    try {
      await preserve({ locationId: 'location-1' });
      expect.unreachable('owned error should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toBe(owned);
    }
  });
});
