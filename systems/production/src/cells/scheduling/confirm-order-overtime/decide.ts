import { confirmOrderOvertimeLifecycleConflict } from './failures.ts';
import type {
  OnlinePlacementMode,
  OnlinePlacementProposal,
  OnlinePlacementResult,
  ProductionOrderPlacementContext,
  ProductionPlacementFailureReason,
} from '../../../model/online-order-placement/model.ts';
import type {
  ConfirmOrderOvertimeDecision,
  ConfirmOrderOvertimePolicy,
  ConfirmProductionOrderOvertimeCommand,
  ConfirmedPlacementConfirmationRequiredResult,
  ConfirmedProductionOrderNotPlacedResult,
  StoredOvertimeProposal,
} from './types.ts';

export const confirmOrderOvertimeOperationId =
  'production.confirm-order-overtime.v1' as const;

export const placementModeFromStoredOvertime = (
  stored: StoredOvertimeProposal | null,
): OnlinePlacementMode =>
  stored?.mode === 'manager_exact' && stored.targetBatchId !== null
    ? { type: 'manager_exact', targetBatchId: stored.targetBatchId }
    : { type: 'automatic' };

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

const notPlaced = (input: {
  command: ConfirmProductionOrderOvertimeCommand;
  mode: OnlinePlacementMode;
  queueVersion: number;
  code: string;
  message: string;
}): ConfirmedProductionOrderNotPlacedResult => ({
  status: 'not_placed',
  mode: input.mode.type,
  productionRunId: input.command.productionRunId,
  productionOrderId: input.command.productionOrderId,
  reason: productionPlacementFailureReason(input.code),
  message: input.message,
  queueVersion: input.queueVersion,
  replayed: false,
});

const confirmationRequired = (input: {
  command: ConfirmProductionOrderOvertimeCommand;
  mode: OnlinePlacementMode;
  proposal: OnlinePlacementProposal;
}): ConfirmedPlacementConfirmationRequiredResult => ({
  status: 'confirmation_required',
  mode: input.mode.type,
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

export const decideConfirmOrderOvertime = (input: {
  command: ConfirmProductionOrderOvertimeCommand;
  storedOvertime: StoredOvertimeProposal | null;
  mode: OnlinePlacementMode;
  context: ProductionOrderPlacementContext;
  proposal: OnlinePlacementResult;
  policy: ConfirmOrderOvertimePolicy;
}): ConfirmOrderOvertimeDecision => {
  if (input.proposal.kind === 'rejected')
    return {
      kind: 'record',
      proposal: null,
      result: notPlaced({
        command: input.command,
        mode: input.mode,
        queueVersion: input.context.input.run.queueVersion,
        code: input.proposal.reason.code,
        message: input.proposal.reason.message,
      }),
    };

  if (
    input.storedOvertime === null ||
    input.storedOvertime.proposalHash !== input.command.proposalHash ||
    input.storedOvertime.queueVersion !== input.command.expectedQueueVersion ||
    input.proposal.placementPlanHash !== input.command.proposalHash
  )
    return {
      kind: 'record',
      proposal: input.proposal,
      result: notPlaced({
        command: input.command,
        mode: input.mode,
        queueVersion: input.context.input.run.queueVersion,
        code: 'OVERTIME_CONFIRMATION_STALE',
        message:
          'The overtime proposal no longer matches the production queue.',
      }),
    };

  const placement = input.policy.evaluatePlacementCommit({
    runStatus: input.context.runStatus,
    orderStatus: input.context.orderStatus,
    orderAlreadyAssigned: input.context.orderAlreadyAssigned,
    expectedQueueVersion: input.command.expectedQueueVersion,
    actualQueueVersion: input.context.input.run.queueVersion,
    placementType: input.mode.type,
    authorizedAction: input.command.authorizedAction,
    orderWeightLbs: input.context.input.order.derivedWeightLbs,
    pulseCapacityLbs: input.context.input.run.pulseCapacityLbs,
    overtime: {
      required: input.proposal.overtime.required,
      proposalHash: input.proposal.placementPlanHash,
      confirmation: {
        proposalHash: input.command.proposalHash,
        queueVersion: input.command.expectedQueueVersion,
      },
    },
  });
  if (
    placement.tag === 'err' &&
    placement.error.code === 'OVERTIME_CONFIRMATION_REQUIRED'
  )
    return {
      kind: 'record',
      proposal: input.proposal,
      result: confirmationRequired({
        command: input.command,
        mode: input.mode,
        proposal: input.proposal,
      }),
    };
  if (placement.tag === 'err')
    return {
      kind: 'record',
      proposal: input.proposal,
      result: notPlaced({
        command: input.command,
        mode: input.mode,
        queueVersion: input.context.input.run.queueVersion,
        code: placement.error.code,
        message: placement.error.message,
      }),
    };

  const resolved = input.policy.resolveProductionOrderExecutionState({
    executionState: input.context.orderExecutionStatus,
    operationalStatus: input.context.orderStatus,
  });
  if (resolved.tag === 'err')
    return {
      kind: 'reject',
      failure: confirmOrderOvertimeLifecycleConflict(
        resolved.error.code.toLowerCase() as
          | 'production_order_execution_event_not_allowed'
          | 'production_order_execution_state_invalid',
        resolved.error.message,
      ),
    };
  const transition = input.policy.evaluateProductionOrderExecutionTransition({
    state: resolved.value,
    event: 'schedule_or_place',
  });
  if (transition.tag === 'err')
    return {
      kind: 'reject',
      failure: confirmOrderOvertimeLifecycleConflict(
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
      failure: confirmOrderOvertimeLifecycleConflict(
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
      failure: confirmOrderOvertimeLifecycleConflict(
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
