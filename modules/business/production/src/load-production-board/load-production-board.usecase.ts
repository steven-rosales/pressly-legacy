import { result } from '@pressly/kernel';
import { productionError } from '../production.error.ts';
import type { ClockPort, ProductionPolicyPort } from '../production.port.ts';
import type {
  LoadProductionBoard,
  LoadProductionBoardRepository,
} from './load-production-board.port.ts';
export type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoard =
  (deps: {
    repo: LoadProductionBoardRepository;
    clock: ClockPort;
    policy: ProductionPolicyPort;
  }): LoadProductionBoard =>
  async ({ locationId, productionShiftId }) =>
    deps.repo.transaction(async (repo) => {
      const board = await repo.loadBoard(
        locationId,
        productionShiftId,
        deps.clock.now(),
      );

      if (board === null)
        return result.err(
          productionError(
            'PRODUCTION_BOARD_NOT_FOUND',
            'The production board was not found.',
            404,
          ),
        );

      const now = deps.clock.now();
      const batches = await Promise.all(
        board.batches.map(async (batch) => ({
          ...batch,
          stages: await Promise.all(
            batch.stages.map(async (stage) => {
              const context = await repo.loadStageTransitionContext(
                locationId,
                stage.id,
                now,
              );
              if (context === null) return { ...stage, allowedActions: [] };

              const policyContext = {
                now,
                productionRunStarted: context.productionRunStarted,
                previousStageCompleted: context.previousStageCompleted,
                sameKindAlreadyActive: context.sameKindAlreadyActive,
                machinesRequired:
                  stage.stage === 'washing' || stage.stage === 'drying',
                assignedMachineIds: context.stage.machineIds,
                overlappingMachineIds: context.machines
                  .filter(
                    (machine) =>
                      context.stage.machineIds.includes(machine.id) &&
                      machine.overlaps,
                  )
                  .map((machine) => machine.id),
              };
              const entity = {
                state: context.stage.status,
                plannedStartAt: new Date(context.stage.plannedStartAt),
                plannedEndAt: new Date(context.stage.plannedEndAt),
                actualStartAt:
                  context.stage.actualStartAt === null
                    ? null
                    : new Date(context.stage.actualStartAt),
              };
              const allowedActions = (['start', 'complete'] as const).filter(
                (transition) =>
                  deps.policy.evaluateStageTransition(
                    entity,
                    { type: transition },
                    policyContext,
                  ).tag === 'ok',
              );
              return { ...stage, allowedActions };
            }),
          ),
        })),
      );

      return result.ok({ ...board, batches });
    });
