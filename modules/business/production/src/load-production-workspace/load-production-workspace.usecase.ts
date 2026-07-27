import { result } from '@pressly/kernel';
import { productionError } from '../production.error.ts';
import type {
  ClockPort,
  ProductionPolicyPort,
  ProductionSchedulerPort,
} from '../production.port.ts';
import { projectLiveRunChanges } from '../live-run-changes.policy.ts';
import { evaluateProductionBoardProjection } from '../production-board-read.policy.ts';
import { projectDemandOutlook } from './demand-outlook.policy.ts';
import type {
  LoadProductionWorkspace,
  LoadProductionWorkspaceRepository,
} from './load-production-workspace.port.ts';

export const makeLoadProductionWorkspace =
  (deps: {
    repo: LoadProductionWorkspaceRepository;
    clock: ClockPort;
    policy: Pick<ProductionPolicyPort, 'evaluateStageNextAction'>;
    scheduler: Pick<
      ProductionSchedulerPort,
      'forecastDemand' | 'proposeOnlinePlacement'
    >;
  }): LoadProductionWorkspace =>
  async ({ locationId, shiftId }) => {
    const workspace = await deps.repo.loadWorkspace(
      locationId,
      shiftId,
      deps.clock.now(),
    );

    if (workspace === null)
      return result.err(
        productionError(
          'PRODUCTION_LOCATION_NOT_FOUND',
          'The active production location was not found.',
          404,
        ),
      );
    if (workspace === 'shift_not_found')
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_NOT_FOUND',
          'The requested production shift was not found at this location.',
          404,
        ),
      );
    if (workspace.livePlacement !== null) {
      const projectedRun = workspace.livePlacement.runContext.input.run;
      const activeRun = workspace.workspace.activeRuns.find(
        (run) => run.id === projectedRun.id,
      );
      const identityIsCurrent =
        workspace.workspace.currentShift !== null &&
        activeRun?.status === 'started' &&
        activeRun.productionShiftId === workspace.workspace.currentShift.id &&
        activeRun.queueVersion === projectedRun.queueVersion &&
        workspace.livePlacement.runContext.runStatus === 'started' &&
        workspace.livePlacement.orders.every(
          ({ context }) =>
            context.input.run.id === projectedRun.id &&
            context.input.run.queueVersion === projectedRun.queueVersion,
        );
      if (!identityIsCurrent)
        return result.err(
          productionError(
            'PRODUCTION_LIVE_PLACEMENT_RUN_MISMATCH',
            'The live-placement projection does not match the selected started run.',
            409,
          ),
        );
    }
    return result.ok({
      ...workspace.workspace,
      liveRunChanges:
        workspace.livePlacement === null
          ? null
          : projectLiveRunChanges({
              runId: workspace.livePlacement.runContext.input.run.id,
              queueVersion:
                workspace.livePlacement.runContext.input.run.queueVersion,
              pulseCapacityLbs:
                workspace.livePlacement.runContext.input.run.pulseCapacityLbs,
              orders: workspace.livePlacement.orders,
              scheduler: deps.scheduler,
            }),
      demandOutlook:
        workspace.workspace.currentShift === null
          ? null
          : projectDemandOutlook({
              shift: workspace.workspace.currentShift,
              config: workspace.workspace.currentSchedulerConfig,
              machines: workspace.workspace.machines,
              activeRunExists: workspace.workspace.activeRuns.some(
                (run) =>
                  run.productionShiftId ===
                  workspace.workspace.currentShift?.id,
              ),
              rows: workspace.demandOutlookRows,
              scheduler: deps.scheduler,
            }),
      board:
        workspace.boardProjection === null
          ? null
          : evaluateProductionBoardProjection(
              workspace.boardProjection,
              deps.policy,
            ),
    });
  };

export type {
  LoadProductionWorkspace,
  LoadProductionWorkspaceRepository,
} from './load-production-workspace.port.ts';
