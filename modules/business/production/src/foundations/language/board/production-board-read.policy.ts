import { invariantViolationError } from '@pressly/errors/factories';
import { isUtcIso } from '@pressly/time';
import type { ProductionStageNextAction } from '../execution/production-lifecycle.model.ts';
import type {
  ProductionBoard,
  ProductionBoardBatch,
  ProductionBoardProjection,
  ProductionBoardStage,
  ProductionBoardStageNextAction,
} from './production-board-read.model.ts';
import type { ProductionRules } from '../rules/production-rules.factory.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const policyDate = (value: string, field: string): Date => {
  if (!isUtcIso(value))
    throw productionInvariantViolation(
      'production_board_stage_next_action_time_invalid',
      `Stage next-action ${field} is not a UTC timestamp.`,
    );
  return new Date(value);
};

const toBoardStageNextAction = (
  action: ProductionStageNextAction,
): ProductionBoardStageNextAction => {
  switch (action.state) {
    case 'available':
    case 'terminal':
      return action;
    case 'blocked':
      return {
        ...action,
        availableAt:
          action.availableAt === null
            ? null
            : policyDate(action.availableAt, 'availableAt'),
      };
    case 'confirmation_required':
      return action.action === 'start'
        ? {
            ...action,
            availableAt: policyDate(action.availableAt, 'availableAt'),
            timing: {
              plannedStartAt: policyDate(
                action.timing.plannedStartAt,
                'timing.plannedStartAt',
              ),
              plannedEndAt: policyDate(
                action.timing.plannedEndAt,
                'timing.plannedEndAt',
              ),
              observedAt: policyDate(
                action.timing.observedAt,
                'timing.observedAt',
              ),
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          }
        : {
            ...action,
            availableAt: policyDate(action.availableAt, 'availableAt'),
            timing: {
              actualStartAt: policyDate(
                action.timing.actualStartAt,
                'timing.actualStartAt',
              ),
              plannedEndAt: policyDate(
                action.timing.plannedEndAt,
                'timing.plannedEndAt',
              ),
              completionBoundaryAt: policyDate(
                action.timing.completionBoundaryAt,
                'timing.completionBoundaryAt',
              ),
              observedAt: policyDate(
                action.timing.observedAt,
                'timing.observedAt',
              ),
              plannedDurationMilliseconds:
                action.timing.plannedDurationMilliseconds,
              elapsedMilliseconds: action.timing.elapsedMilliseconds,
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          };
  }
};

export const evaluateProductionBoardProjection = (
  projection: ProductionBoardProjection,
  policy: Pick<ProductionRules, 'evaluateStageNextAction'>,
): ProductionBoard => {
  const contextByStageId = new Map(
    projection.stageNextActionContexts.map((context) => [
      context.stageRunId,
      context,
    ]),
  );
  return {
    ...projection.board,
    batches: projection.board.batches.map(
      (batch): ProductionBoardBatch => ({
        ...batch,
        stages: batch.stages.map((stage): ProductionBoardStage => {
          const evaluation = contextByStageId.get(stage.id);
          if (evaluation === undefined)
            throw productionInvariantViolation(
              'production_board_stage_context_missing',
              `Stage ${stage.id} is missing next-action context.`,
            );
          const decision = policy.evaluateStageNextAction(
            evaluation.entity,
            evaluation.context,
          );
          if (decision.tag === 'err')
            throw productionInvariantViolation(
              'production_board_stage_next_action_invalid',
              `Stage ${stage.id} next action could not be evaluated: ${decision.error.code}.`,
            );
          const nextAction = toBoardStageNextAction(decision.value);
          return {
            ...stage,
            nextAction,
            allowedActions:
              nextAction.state === 'available' ||
              nextAction.state === 'confirmation_required'
                ? [nextAction.action]
                : [],
          };
        }),
      }),
    ),
  };
};
