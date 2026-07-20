import { result } from '@pressly/kernel';
import { productionError } from '../production.error.ts';
import type {
  ClockPort,
  ProductionPolicyPort,
  ProductionSchedulerPort,
} from '../production.port.ts';
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
    policy: Pick<
      ProductionPolicyPort,
      'evaluateDemandReconciliation' | 'evaluateStageNextAction'
    >;
    scheduler: Pick<ProductionSchedulerPort, 'forecastDemand'>;
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
    return result.ok({
      ...workspace.workspace,
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
              policy: deps.policy,
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
