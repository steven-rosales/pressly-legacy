import type {
  ProcessorOperationalOrderIdentity,
  ProcessorProductionBoard,
} from '@pressly/contracts/processor';
import { productionOrderReferenceId } from '@pressly/processor-experience';
import type { ProductionBoard } from '@pressly/production';
import { requireOperationalOrderIdentity } from './operational-order-identity.contract.mapper.ts';

const serializeBoardStageNextAction = (
  action: ProductionBoard['batches'][number]['stages'][number]['nextAction'],
): ProcessorProductionBoard['batches'][number]['stages'][number]['nextAction'] => {
  switch (action.state) {
    case 'available':
    case 'terminal':
      return { ...action };
    case 'blocked':
      return {
        ...action,
        availableAt: action.availableAt?.toISOString() ?? null,
      };
    case 'confirmation_required':
      return action.action === 'start'
        ? {
            ...action,
            availableAt: action.availableAt.toISOString(),
            timing: {
              ...action.timing,
              plannedStartAt: action.timing.plannedStartAt.toISOString(),
              plannedEndAt: action.timing.plannedEndAt.toISOString(),
              observedAt: action.timing.observedAt.toISOString(),
            },
          }
        : {
            ...action,
            availableAt: action.availableAt.toISOString(),
            timing: {
              ...action.timing,
              actualStartAt: action.timing.actualStartAt.toISOString(),
              plannedEndAt: action.timing.plannedEndAt.toISOString(),
              completionBoundaryAt:
                action.timing.completionBoundaryAt.toISOString(),
              observedAt: action.timing.observedAt.toISOString(),
            },
          };
  }
};

const serializeBoardPendingPlacement = (
  placement: ProductionBoard['eligibleOrders'][number]['placement'],
): ProcessorProductionBoard['eligibleOrders'][number]['placement'] => {
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
        projectedCompletionAt: placement.projectedCompletionAt.toISOString(),
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
                projectedCompletionAt:
                  placement.preview.projectedCompletionAt.toISOString(),
              },
      };
  }
};

export const toProcessorProductionRunContract = (
  run: ProductionBoard['productionRun'],
): ProcessorProductionBoard['productionRun'] => ({
  ...run,
  plannedCompletionAt: run.plannedCompletionAt.toISOString(),
  overtimeAcknowledgement:
    run.overtimeAcknowledgement === null
      ? null
      : {
          ...run.overtimeAcknowledgement,
          acknowledgedAt:
            run.overtimeAcknowledgement.acknowledgedAt.toISOString(),
        },
});

export const toProcessorProductionBoardContract = (
  board: ProductionBoard,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorProductionBoard => ({
  productionShift: {
    ...board.productionShift,
    startsAt: board.productionShift.startsAt.toISOString(),
    endsAt: board.productionShift.endsAt.toISOString(),
  },
  productionRun: toProcessorProductionRunContract(board.productionRun),
  batches: board.batches.map((batch) => ({
    ...batch,
    membership:
      batch.membership.state === 'mutable'
        ? { state: 'mutable' }
        : {
            ...batch.membership,
            frozenAt: batch.membership.frozenAt.toISOString(),
          },
    orders: batch.orders.map((order) => ({
      ...order,
      dueAt: order.dueAt.toISOString(),
      pinnedAt: order.pinnedAt?.toISOString() ?? null,
      identity: requireOperationalOrderIdentity(
        identities,
        productionOrderReferenceId(order.id),
      ),
    })),
    stages: batch.stages.map((stage) => ({
      ...stage,
      plannedStartAt: stage.plannedStartAt.toISOString(),
      plannedEndAt: stage.plannedEndAt.toISOString(),
      actualStartAt: stage.actualStartAt?.toISOString() ?? null,
      actualEndAt: stage.actualEndAt?.toISOString() ?? null,
      machineIds: [...stage.machineIds],
      nextAction: serializeBoardStageNextAction(stage.nextAction),
      allowedActions: [...stage.allowedActions],
    })),
  })),
  eligibleOrders: board.eligibleOrders.map((order) => ({
    ...order,
    dueAt: order.dueAt.toISOString(),
    placement: serializeBoardPendingPlacement(order.placement),
  })),
  asOf: board.asOf.toISOString(),
});
