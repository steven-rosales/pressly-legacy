import { placeOrderExactlyConflict } from './failures.ts';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
  ProductionPlacementFailureReason,
  ProposeOnlinePlacement,
} from '../../../model/online-order-placement/model.ts';
import type {
  ExactOrderNotPlacedResult,
  ExactOrderPlacementConfirmationRequiredResult,
  PlaceOrderExactlyCommand,
  PlaceOrderExactlyDecision,
  PlaceOrderExactlyPolicy,
} from './types.ts';

export const placementFailureReason = (
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

const notPlaced = (input: {
  command: PlaceOrderExactlyCommand;
  queueVersion: number;
  code: string;
  message: string;
}): ExactOrderNotPlacedResult => ({
  status: 'not_placed',
  mode: 'manager_exact',
  productionRunId: input.command.productionRunId,
  productionOrderId: input.command.productionOrderId,
  reason: placementFailureReason(input.code),
  message: input.message,
  queueVersion: input.queueVersion,
  replayed: false,
});

const confirmationRequired = (input: {
  command: PlaceOrderExactlyCommand;
  proposal: OnlinePlacementProposal;
}): ExactOrderPlacementConfirmationRequiredResult => ({
  status: 'confirmation_required',
  mode: 'manager_exact',
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

export const decidePlaceOrderExactly = (input: {
  command: PlaceOrderExactlyCommand;
  context: ProductionOrderPlacementContext;
  policy: PlaceOrderExactlyPolicy;
  proposeOnlinePlacement: ProposeOnlinePlacement<
    Readonly<{ type: 'manager_exact'; targetBatchId: string }>
  >;
}): PlaceOrderExactlyDecision => {
  const actualTargetVersion =
    input.context.batchVersions[input.command.productionBatchId];
  if (actualTargetVersion !== input.command.expectedBatchVersion)
    return {
      kind: 'audit',
      result: notPlaced({
        command: input.command,
        queueVersion: input.context.input.run.queueVersion,
        code: 'QUEUE_VERSION_CONFLICT',
        message: 'The target batch changed before exact placement.',
      }),
      proposal: null,
    };

  const proposal = input.proposeOnlinePlacement({
    ...input.context.input,
    mode: {
      type: 'manager_exact',
      targetBatchId: input.command.productionBatchId,
    },
  });
  if (proposal.kind === 'rejected')
    return {
      kind: 'audit',
      result: notPlaced({
        command: input.command,
        queueVersion: input.context.input.run.queueVersion,
        code: proposal.reason.code,
        message: proposal.reason.message,
      }),
      proposal: null,
    };

  const placement = input.policy.evaluatePlacementCommit({
    runStatus: input.context.runStatus,
    orderStatus: input.context.orderStatus,
    orderAlreadyAssigned: input.context.orderAlreadyAssigned,
    expectedQueueVersion: input.command.expectedQueueVersion,
    actualQueueVersion: input.context.input.run.queueVersion,
    placementType: 'manager_exact',
    authorizedAction: input.command.authorizedAction,
    orderWeightLbs: input.context.input.order.derivedWeightLbs,
    pulseCapacityLbs: input.context.input.run.pulseCapacityLbs,
    overtime: {
      required: proposal.overtime.required,
      proposalHash: proposal.placementPlanHash,
      confirmation: null,
    },
  });
  if (
    placement.tag === 'err' &&
    placement.error.code === 'OVERTIME_CONFIRMATION_REQUIRED'
  )
    return {
      kind: 'audit',
      result: confirmationRequired({ command: input.command, proposal }),
      proposal,
    };
  if (placement.tag === 'err')
    return {
      kind: 'audit',
      result: notPlaced({
        command: input.command,
        queueVersion: input.context.input.run.queueVersion,
        code: placement.error.code,
        message: placement.error.message,
      }),
      proposal,
    };

  const execution = input.policy.resolveProductionOrderExecutionState({
    executionState: input.context.orderExecutionStatus,
    operationalStatus: input.context.orderStatus,
  });
  if (execution.tag === 'err')
    return {
      kind: 'reject',
      failure: placeOrderExactlyConflict(
        execution.error.code.toLowerCase(),
        execution.error.message,
      ),
    };
  const transition = input.policy.evaluateProductionOrderExecutionTransition({
    state: execution.value,
    event: 'schedule_or_place',
  });
  if (transition.tag === 'err')
    return {
      kind: 'reject',
      failure: placeOrderExactlyConflict(
        transition.error.code.toLowerCase(),
        transition.error.message,
      ),
    };
  if (
    transition.value.from !== 'unassigned' ||
    transition.value.state !== 'scheduled'
  )
    return {
      kind: 'reject',
      failure: placeOrderExactlyConflict(
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
      failure: placeOrderExactlyConflict(
        'production_order_execution_state_invalid',
        'The production order execution state is invalid.',
      ),
    };

  return {
    kind: 'commit',
    plan: {
      proposal,
      orderLifecycle: {
        productionOrderId: input.command.productionOrderId,
        persistedState: input.context.orderExecutionStatus,
        expectedVersion: input.context.orderVersion,
        lifecycle: {
          from: transition.value.from,
          state: transition.value.state,
        },
      },
      initialBatchState: input.policy.initialProductionBatchState,
      initialStageState: input.policy.initialProductionStageState,
      initialAttemptState: input.policy.initialProductionOrderStageAttemptState,
    },
  };
};
