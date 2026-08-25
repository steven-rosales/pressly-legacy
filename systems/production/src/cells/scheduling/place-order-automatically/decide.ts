import { placeOrderAutomaticallyLifecycleConflict } from './failures.ts';
import type {
  OnlinePlacementProposal,
  OnlinePlacementResult,
  ProductionOrderPlacementContext,
  ProductionPlacementFailureReason,
} from '../../../model/online-order-placement/model.ts';
import type {
  AutomaticProductionOrderNotPlacedResult,
  AutomaticProductionOrderPlacementConfirmationRequiredResult,
  AutomaticPlacementCommand,
  PlaceOrderAutomaticallyDecision,
  PlaceOrderAutomaticallyPolicy,
} from './types.ts';

export const placeOrderAutomaticallyOperationId =
  'production.place-order-automatically.v1' as const;

export const productionPlacementFailureReason = (
  code: string,
): ProductionPlacementFailureReason => {
  switch (code) {
    case 'PRODUCTION_RUN_NOT_STARTED':
      return 'run_not_started';
    case 'PRODUCTION_RUN_COMPLETED':
      return 'run_completed';
    case 'ORDER_NOT_ELIGIBLE':
      return 'order_not_eligible';
    case 'ORDER_ALREADY_PLACED':
      return 'order_already_scheduled';
    case 'QUEUE_VERSION_CONFLICT':
      return 'queue_conflict';
    case 'OVERTIME_CONFIRMATION_STALE':
      return 'proposal_stale';
    case 'ORDER_EXCEEDS_PULSE_CAPACITY':
    case 'TARGET_BATCH_CAPACITY_EXCEEDED':
    case 'BATCH_CAPACITY_EXCEEDED':
      return 'hard_capacity_exceeded';
    default:
      return 'no_mutable_position';
  }
};

export const automaticPlacementNotPlaced = (input: {
  command: AutomaticPlacementCommand;
  queueVersion: number;
  code: string;
  message: string;
}): AutomaticProductionOrderNotPlacedResult => ({
  status: 'not_placed',
  mode: 'automatic',
  productionRunId: input.command.productionRunId,
  productionOrderId: input.command.productionOrderId,
  reason: productionPlacementFailureReason(input.code),
  message: input.message,
  queueVersion: input.queueVersion,
  replayed: false,
});

export const automaticPlacementConfirmationRequired = (input: {
  command: AutomaticPlacementCommand;
  proposal: OnlinePlacementProposal;
}): AutomaticProductionOrderPlacementConfirmationRequiredResult => ({
  status: 'confirmation_required',
  mode: 'automatic',
  productionRunId: input.command.productionRunId,
  productionOrderId: input.command.productionOrderId,
  target:
    input.proposal.target.type === 'existing_batch'
      ? {
          kind: 'existing_batch',
          productionBatchId: input.proposal.target.batchId,
          sequence: input.proposal.target.sequence,
        }
      : {
          kind: 'new_batch',
          sequence: input.proposal.target.insertAtSequence,
        },
  affectedBatchIds: input.proposal.affectedBatches.flatMap((batch) =>
    batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
  ),
  queueVersion: input.proposal.expectedQueueVersion,
  proposalHash: input.proposal.placementPlanHash,
  projectedCompletionAt: input.proposal.projectedCompletionAt,
  overtimeMinutes: input.proposal.overtime.overrunMinutes,
  replayed: false,
});

export const decidePlaceOrderAutomatically = (input: {
  command: AutomaticPlacementCommand;
  context: ProductionOrderPlacementContext;
  proposal: OnlinePlacementResult;
  policy: PlaceOrderAutomaticallyPolicy;
}): PlaceOrderAutomaticallyDecision => {
  if (input.proposal.kind === 'rejected')
    return {
      kind: 'record',
      proposal: null,
      result: automaticPlacementNotPlaced({
        command: input.command,
        queueVersion: input.context.input.run.queueVersion,
        code: input.proposal.reason.code,
        message: input.proposal.reason.message,
      }),
    };

  const placement = input.policy.evaluatePlacementCommit({
    runStatus: input.context.runStatus,
    orderStatus: input.context.orderStatus,
    orderAlreadyAssigned: input.context.orderAlreadyAssigned,
    expectedQueueVersion: input.command.expectedQueueVersion,
    actualQueueVersion: input.context.input.run.queueVersion,
    placementType: 'automatic',
    authorizedAction: input.command.authorizedAction,
    orderWeightLbs: input.context.input.order.derivedWeightLbs,
    pulseCapacityLbs: input.context.input.run.pulseCapacityLbs,
    overtime: {
      required: input.proposal.overtime.required,
      proposalHash: input.proposal.placementPlanHash,
      confirmation: null,
    },
  });

  if (
    placement.tag === 'err' &&
    placement.error.code === 'OVERTIME_CONFIRMATION_REQUIRED'
  )
    return {
      kind: 'record',
      proposal: input.proposal,
      result: automaticPlacementConfirmationRequired({
        command: input.command,
        proposal: input.proposal,
      }),
    };

  if (placement.tag === 'err')
    return {
      kind: 'record',
      proposal: input.proposal,
      result: automaticPlacementNotPlaced({
        command: input.command,
        queueVersion: input.context.input.run.queueVersion,
        code: placement.error.code,
        message: placement.error.message,
      }),
    };

  const resolvedExecution = input.policy.resolveProductionOrderExecutionState({
    executionState: input.context.orderExecutionStatus,
    operationalStatus: input.context.orderStatus,
  });
  if (resolvedExecution.tag === 'err')
    return {
      kind: 'reject',
      failure: placeOrderAutomaticallyLifecycleConflict(
        resolvedExecution.error.code.toLowerCase() as
          | 'production_order_execution_event_not_allowed'
          | 'production_order_execution_state_invalid',
        resolvedExecution.error.message,
      ),
    };

  const transition = input.policy.evaluateProductionOrderExecutionTransition({
    state: resolvedExecution.value,
    event: 'schedule_or_place',
  });
  if (transition.tag === 'err')
    return {
      kind: 'reject',
      failure: placeOrderAutomaticallyLifecycleConflict(
        transition.error.code.toLowerCase() as
          | 'production_order_execution_event_not_allowed'
          | 'production_order_execution_state_invalid',
        transition.error.message,
      ),
    };

  if (
    transition.value.from !== 'unassigned' ||
    transition.value.state !== 'scheduled'
  )
    return {
      kind: 'reject',
      failure: placeOrderAutomaticallyLifecycleConflict(
        'production_order_execution_transition_invalid',
        'The production order cannot be committed by placement.',
      ),
    };

  if (
    input.context.orderExecutionStatus !== 'unassigned' &&
    input.context.orderExecutionStatus !== 'scheduled' &&
    input.context.orderExecutionStatus !== 'finished'
  )
    return {
      kind: 'reject',
      failure: placeOrderAutomaticallyLifecycleConflict(
        'production_order_execution_state_invalid',
        'The production order execution state is invalid.',
      ),
    };

  return {
    kind: 'commit',
    proposal: input.proposal,
    orderLifecycle: {
      productionOrderId: input.command.productionOrderId,
      persistedState: input.context.orderExecutionStatus,
      expectedVersion: input.context.orderVersion,
      lifecycle: {
        from: transition.value.from,
        state: transition.value.state,
      },
    },
  };
};
