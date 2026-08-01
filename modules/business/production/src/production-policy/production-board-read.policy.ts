import type {
  ProductionBatch,
  ProductionBoard,
  ProductionOrderListItem,
  StageRun,
} from '@pressly/contracts';
import type { ProductionPolicyPort } from './production-policy.port.ts';

export type StageNextActionReadContext = Readonly<{
  stageRunId: string;
  entity: Readonly<{
    state: string;
    plannedStartAt: Date;
    plannedEndAt: Date;
    actualStartAt: Date | null;
  }>;
  context: Readonly<{
    now: Date;
    productionRunStarted: boolean;
    previousStageCompleted: boolean;
    sameKindAlreadyActive: boolean;
    machinesRequired: boolean;
    assignedMachineIds: readonly string[];
    overlappingMachineIds: readonly string[];
  }>;
}>;

export type UnevaluatedStageRun = Omit<
  StageRun,
  'nextAction' | 'allowedActions'
>;
export type UnevaluatedProductionBatch = Omit<ProductionBatch, 'stages'> &
  Readonly<{ stages: UnevaluatedStageRun[] }>;
export type UnevaluatedProductionBoard = Omit<ProductionBoard, 'batches'> &
  Readonly<{ batches: UnevaluatedProductionBatch[] }>;

export type ProductionBoardProjection = Readonly<{
  board: UnevaluatedProductionBoard;
  stageNextActionContexts: readonly StageNextActionReadContext[];
  orders: readonly ProductionOrderListItem[];
}>;

export const evaluateProductionBoardProjection = (
  projection: ProductionBoardProjection,
  policy: Pick<ProductionPolicyPort, 'evaluateStageNextAction'>,
): ProductionBoard => {
  const contextByStageId = new Map(
    projection.stageNextActionContexts.map((context) => [
      context.stageRunId,
      context,
    ]),
  );
  return {
    ...projection.board,
    batches: projection.board.batches.map((batch) => ({
      ...batch,
      stages: batch.stages.map((stage): StageRun => {
        const evaluation = contextByStageId.get(stage.id);
        if (evaluation === undefined)
          throw new Error(`Stage ${stage.id} is missing next-action context.`);
        const decision = policy.evaluateStageNextAction(
          evaluation.entity,
          evaluation.context,
        );
        if (decision.tag === 'err')
          throw new Error(
            `Stage ${stage.id} next action could not be evaluated: ${decision.error.code}.`,
          );
        return {
          ...stage,
          nextAction: decision.value,
          allowedActions:
            decision.value.state === 'available' ||
            decision.value.state === 'confirmation_required'
              ? [decision.value.action]
              : [],
        };
      }),
    })),
  };
};
