import {
  conflictFailure,
  notFoundFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { result } from '@pressly/kernel';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import type { Clock } from '@pressly/time';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type { ProductionAlgorithmRegistry } from '../../../foundations/algorithms/approved-production/production-algorithm-registry.factory.ts';
import { projectLiveRunChanges } from './live-run-changes.policy.ts';
import { evaluateProductionBoardProjection } from '../../../foundations/language/board/production-board-read.policy.ts';
import { projectDemandOutlook } from './demand-outlook.policy.ts';
import type {
  LoadProductionWorkspace,
  LoadProductionWorkspaceRepository,
} from './load-production-workspace.port.ts';

export const makeLoadProductionWorkspace =
  (deps: {
    repo: LoadProductionWorkspaceRepository;
    clock: Clock;
    policy: Pick<ProductionRules, 'evaluateStageNextAction'>;
    scheduler: Pick<
      ProductionAlgorithmRegistry,
      'forecastDemand' | 'proposeOnlinePlacement'
    >;
  }): LoadProductionWorkspace =>
  async ({ locationId, shiftId }) => {
    const workspace = await withProductionDatabaseError(
      'PRODUCTION_WORKSPACE_LOAD_FAILED',
      'The production workspace could not be loaded.',
      () => deps.repo.loadWorkspace(locationId, shiftId, deps.clock.now()),
    );
    if (workspace === null)
      return result.err(
        notFoundFailure({
          code: 'production_location_not_found',
          message: 'The active production location was not found.',
          safeMessage: 'The active production location was not found.',
        }),
      );
    if (workspace === 'shift_not_found')
      return result.err(
        notFoundFailure({
          code: 'production_shift_not_found',
          message:
            'The requested production shift was not found at this location.',
          safeMessage:
            'The requested production shift was not found at this location.',
        }),
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
          conflictFailure({
            code: 'production_live_placement_run_mismatch',
            message:
              'The live-placement projection does not match the selected started run.',
            safeMessage:
              'The live-placement projection does not match the selected started run.',
          }),
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
