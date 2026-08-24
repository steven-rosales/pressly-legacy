import type { CellOutcome } from '@pressly/cells';
import type { ProductionWorkspace } from '../../../read-models/production-board/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  BoardPolicy,
  BoardProjection,
} from '../../../read-models/production-board/model.ts';
import { evaluateBoardProjection } from '../../../read-models/production-board/project.ts';
import { projectDemandOutlook } from './demand.ts';
import {
  loadWorkspaceLivePlacementConflict,
  loadWorkspaceLocationNotFound,
  loadWorkspaceShiftNotFound,
} from './failures.ts';
import { projectLiveRunChanges } from './live.ts';
import { serializeWorkspace } from './project.ts';
import type {
  DemandOutlookRow,
  LiveRunPlacementOrder,
  LoadWorkspaceClock,
  LoadWorkspaceExpectedFailure,
  LoadWorkspaceInput,
  RunPlacementContext,
  WorkspaceBaseModel,
  WorkspaceScheduler,
} from './types.ts';

export type WorkspaceReadModel = Readonly<{
  workspace: WorkspaceBaseModel;
  boardProjection: BoardProjection | null;
  demandOutlookRows: readonly DemandOutlookRow[];
  livePlacement: Readonly<{
    runContext: RunPlacementContext;
    orders: readonly LiveRunPlacementOrder[];
  }> | null;
}>;

export type LoadWorkspaceRepository = Readonly<{
  load: (
    locationId: string,
    shiftId: string | undefined,
    asOf: Date,
  ) => Promise<WorkspaceReadModel | 'shift_not_found' | null>;
}>;

export type LoadWorkspaceDependencies = Readonly<{
  repo: LoadWorkspaceRepository;
  clock: LoadWorkspaceClock;
  policy: BoardPolicy;
  scheduler: WorkspaceScheduler;
}>;

export type ExecuteLoadWorkspace = (
  input: LoadWorkspaceInput,
) => Promise<CellOutcome<ProductionWorkspace, LoadWorkspaceExpectedFailure>>;

export const makeExecuteLoadWorkspace = (
  dependencies: LoadWorkspaceDependencies,
): ExecuteLoadWorkspace =>
  async function execute(input) {
    try {
      // Preserve the executable call-argument order: clock before repository.
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.load(
        input.locationId,
        input.shiftId,
        asOf,
      );
      if (loaded === null)
        return {
          kind: 'failure',
          failure: loadWorkspaceLocationNotFound(),
        };
      if (loaded === 'shift_not_found')
        return { kind: 'failure', failure: loadWorkspaceShiftNotFound() };

      if (loaded.livePlacement !== null) {
        const projectedRun = loaded.livePlacement.runContext.input.run;
        const activeRun = loaded.workspace.activeRuns.find(
          (run) => run.id === projectedRun.id,
        );
        const identityIsCurrent =
          loaded.workspace.currentShift !== null &&
          activeRun?.status === 'started' &&
          activeRun.productionShiftId === loaded.workspace.currentShift.id &&
          activeRun.queueVersion === projectedRun.queueVersion &&
          loaded.livePlacement.runContext.runStatus === 'started' &&
          loaded.livePlacement.orders.every(
            ({ context }) =>
              context.input.run.id === projectedRun.id &&
              context.input.run.queueVersion === projectedRun.queueVersion,
          );
        if (!identityIsCurrent)
          return {
            kind: 'failure',
            failure: loadWorkspaceLivePlacementConflict(),
          };
      }

      const currentShift = loaded.workspace.currentShift;
      return {
        kind: 'success',
        value: serializeWorkspace({
          ...loaded.workspace,
          liveRunChanges:
            loaded.livePlacement === null
              ? null
              : projectLiveRunChanges({
                  runId: loaded.livePlacement.runContext.input.run.id,
                  queueVersion:
                    loaded.livePlacement.runContext.input.run.queueVersion,
                  pulseCapacityLbs:
                    loaded.livePlacement.runContext.input.run.pulseCapacityLbs,
                  orders: loaded.livePlacement.orders,
                  scheduler: dependencies.scheduler,
                }),
          demandOutlook:
            currentShift === null
              ? null
              : projectDemandOutlook({
                  shift: currentShift,
                  config: loaded.workspace.currentSchedulerConfig,
                  machines: loaded.workspace.machines,
                  activeRunExists: loaded.workspace.activeRuns.some(
                    (run) => run.productionShiftId === currentShift.id,
                  ),
                  rows: loaded.demandOutlookRows,
                  scheduler: dependencies.scheduler,
                }),
          board:
            loaded.boardProjection === null
              ? null
              : evaluateBoardProjection(
                  loaded.boardProjection,
                  dependencies.policy,
                ),
        }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_workspace_load_failed',
          message: 'The production workspace could not be loaded.',
          safeMessage: 'The production workspace could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
