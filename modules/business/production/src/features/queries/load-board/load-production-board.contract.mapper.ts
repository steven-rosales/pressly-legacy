import type {
  ProductionBoard as ProductionBoardResult,
  ProductionPendingPlacement as ProductionPendingPlacementResult,
  ProductionRunBoardParams,
  ProductionStageNextAction as ProductionStageNextActionResult,
} from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type {
  ProductionBoard,
  ProductionBoardPendingPlacement,
  ProductionBoardStageNextAction,
} from '../../../foundations/language/board/production-board-read.model.ts';
import type { LoadProductionBoardCommand } from './load-production-board.model.ts';

export const toLoadProductionBoardCommand = (
  params: ProductionRunBoardParams,
): LoadProductionBoardCommand => ({
  locationId: params.locationId,
  productionRunId: params.productionRunId,
});

const toStageNextActionResult = (
  action: ProductionBoardStageNextAction,
): ProductionStageNextActionResult => {
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
            : utcIsoFromDate(action.availableAt),
      };
    case 'confirmation_required':
      return action.action === 'start'
        ? {
            ...action,
            availableAt: utcIsoFromDate(action.availableAt),
            timing: {
              plannedStartAt: utcIsoFromDate(action.timing.plannedStartAt),
              plannedEndAt: utcIsoFromDate(action.timing.plannedEndAt),
              observedAt: utcIsoFromDate(action.timing.observedAt),
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          }
        : {
            ...action,
            availableAt: utcIsoFromDate(action.availableAt),
            timing: {
              actualStartAt: utcIsoFromDate(action.timing.actualStartAt),
              plannedEndAt: utcIsoFromDate(action.timing.plannedEndAt),
              completionBoundaryAt: utcIsoFromDate(
                action.timing.completionBoundaryAt,
              ),
              observedAt: utcIsoFromDate(action.timing.observedAt),
              plannedDurationMilliseconds:
                action.timing.plannedDurationMilliseconds,
              elapsedMilliseconds: action.timing.elapsedMilliseconds,
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          };
  }
};

const toPendingPlacementResult = (
  placement: ProductionBoardPendingPlacement,
): ProductionPendingPlacementResult => {
  switch (placement.status) {
    case 'awaiting_run':
      return { ...placement };
    case 'ambiguous_run':
      return {
        ...placement,
        candidateProductionRunIds: [...placement.candidateProductionRunIds],
      };
    case 'confirmation_required':
      return {
        ...placement,
        target: { ...placement.target },
        affectedBatchIds: [...placement.affectedBatchIds],
        projectedCompletionAt: utcIsoFromDate(placement.projectedCompletionAt),
      };
    case 'not_placed':
      return {
        ...placement,
        preview:
          placement.preview === null
            ? null
            : {
                ...placement.preview,
                target: { ...placement.preview.target },
                affectedBatchIds: [...placement.preview.affectedBatchIds],
                projectedCompletionAt: utcIsoFromDate(
                  placement.preview.projectedCompletionAt,
                ),
              },
      };
  }
};

export const toProductionBoardResult = (
  board: ProductionBoard,
): ProductionBoardResult => ({
  productionShift: {
    ...board.productionShift,
    startsAt: utcIsoFromDate(board.productionShift.startsAt),
    endsAt: utcIsoFromDate(board.productionShift.endsAt),
  },
  productionRun: {
    ...board.productionRun,
    plannedCompletionAt: utcIsoFromDate(
      board.productionRun.plannedCompletionAt,
    ),
    overtimeAcknowledgement:
      board.productionRun.overtimeAcknowledgement === null
        ? null
        : {
            ...board.productionRun.overtimeAcknowledgement,
            acknowledgedAt: utcIsoFromDate(
              board.productionRun.overtimeAcknowledgement.acknowledgedAt,
            ),
          },
  },
  batches: board.batches.map((batch) => ({
    ...batch,
    membership:
      batch.membership.state === 'mutable'
        ? { state: 'mutable' as const }
        : {
            ...batch.membership,
            frozenAt: utcIsoFromDate(batch.membership.frozenAt),
          },
    orders: batch.orders.map((order) => ({
      ...order,
      dueAt: utcIsoFromDate(order.dueAt),
      pinnedAt: order.pinnedAt === null ? null : utcIsoFromDate(order.pinnedAt),
    })),
    stages: batch.stages.map((stage) => ({
      ...stage,
      plannedStartAt: utcIsoFromDate(stage.plannedStartAt),
      plannedEndAt: utcIsoFromDate(stage.plannedEndAt),
      actualStartAt:
        stage.actualStartAt === null
          ? null
          : utcIsoFromDate(stage.actualStartAt),
      actualEndAt:
        stage.actualEndAt === null ? null : utcIsoFromDate(stage.actualEndAt),
      machineIds: [...stage.machineIds],
      nextAction: toStageNextActionResult(stage.nextAction),
      allowedActions: [...stage.allowedActions],
    })),
  })),
  eligibleOrders: board.eligibleOrders.map((order) => ({
    ...order,
    dueAt: utcIsoFromDate(order.dueAt),
    placement: toPendingPlacementResult(order.placement),
  })),
  asOf: utcIsoFromDate(board.asOf),
});
