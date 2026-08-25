import { sha256Text } from '@pressly/codec/node';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { CodedFailure, Result } from '@pressly/cells/result';
import type {
  OrderRoutingCurrentStage,
  OrderRoutingDecision,
} from '../order-routing.ts';
import type {
  OrderRouteProposalContext,
  OrderRouteProposalDecision,
  OrderRouteProposalCommand,
  OrderRouteProposalPolicy,
  ProductionOrderRouteProposal,
} from './model.ts';

const asBatchStatus = (
  value: string,
):
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished' => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw invariantViolationError({
        code: 'production_batch_status_invalid',
        message: 'Stored production routing data is inconsistent.',
        safeMessage: 'Stored production routing data is inconsistent.',
      });
  }
};

const currentStageFor = (
  command: OrderRouteProposalCommand,
  context: OrderRouteProposalContext,
  policy: Pick<OrderRouteProposalPolicy, 'deriveOrderRoutingCurrentStage'>,
): Result<OrderRoutingCurrentStage, CodedFailure> => {
  if (command.kind === 'queued_move')
    return result.ok({ stage: 'sorting', status: 'planned' });

  const source = context.candidates.find(
    (candidate) =>
      candidate.productionBatchId === context.source.productionBatchId,
  );
  if (source === undefined)
    throw invariantViolationError({
      code: 'production_order_route_source_stage_graph_missing',
      message: 'Stored production routing data is inconsistent.',
      safeMessage: 'Stored production routing data is inconsistent.',
    });

  return policy.deriveOrderRoutingCurrentStage({
    batchStatus: asBatchStatus(context.source.status),
    stages: source.stages.map((stage) => ({
      stage: stage.stage,
      status: stage.status,
    })),
    attempts: context.attempts
      .filter(
        (attempt) =>
          attempt.productionBatchId === context.source.productionBatchId,
      )
      .map((attempt) => ({ stage: attempt.stage, status: attempt.status })),
  });
};

const proposalConflict = (input: {
  code: string;
  message: string;
}): OrderRouteProposalDecision & { kind: 'reject' } => ({
  kind: 'reject',
  failure: {
    kind: 'conflict',
    code: input.code,
    message: input.message,
    safeMessage: input.message,
  },
});

const proposalValidation = (input: {
  code: string;
  message: string;
}): OrderRouteProposalDecision & { kind: 'reject' } => ({
  kind: 'reject',
  failure: {
    kind: 'validation',
    classification: 'semantic',
    code: input.code,
    message: input.message,
    safeMessage: input.message,
  },
});

export const hashOrderRouteProposal = (
  proposal: Omit<ProductionOrderRouteProposal, 'proposalHash'>,
): string => sha256Text(JSON.stringify(proposal));

export const evaluateOrderRouteProposal = (input: {
  command: OrderRouteProposalCommand;
  context: OrderRouteProposalContext;
  policy: OrderRouteProposalPolicy;
  consistency: 'snapshot' | 'locked';
}): OrderRouteProposalDecision => {
  const { command, context } = input;
  if (context.run.status !== 'started')
    return proposalConflict({
      code: 'production_run_not_started',
      message: 'Orders can only move within a started production run.',
    });

  const access = input.policy.evaluateProductionOrderOperationalAccess({
    resolutionState: context.order.resolutionState,
  });
  if (access.tag === 'err')
    return proposalConflict({
      code: access.error.code.toLowerCase(),
      message: access.error.message,
    });

  const execution = input.policy.resolveProductionOrderExecutionState({
    executionState: context.order.executionStatus,
    operationalStatus: context.order.operationalStatus,
  });
  if (execution.tag === 'err')
    return proposalConflict({
      code: execution.error.code.toLowerCase(),
      message: execution.error.message,
    });
  if (execution.value !== 'scheduled')
    return proposalConflict({
      code: 'production_order_not_scheduled',
      message: 'Only a scheduled production order can move between batches.',
    });

  if (context.run.queueVersion !== command.expectedQueueVersion)
    return proposalConflict({
      code: 'production_queue_version_conflict',
      message: 'The production queue changed before the order move.',
    });
  if (context.order.version !== command.expectedOrderVersion)
    return proposalConflict({
      code: 'production_order_version_conflict',
      message: 'The production order changed before the order move.',
    });
  if (context.source.version !== command.expectedSourceBatchVersion)
    return proposalConflict({
      code: 'production_batch_version_conflict',
      message: 'The source batch changed before the order move.',
    });
  if (context.source.activeOrderCount <= 1)
    return proposalConflict({
      code: 'source_batch_would_be_empty',
      message:
        'This is the source batch only order. Empty-batch handling requires an explicit floor decision.',
    });

  const candidates =
    command.kind === 'queued_move'
      ? context.candidates.filter(
          (candidate) =>
            candidate.productionBatchId === command.targetProductionBatchId,
        )
      : context.candidates;
  const currentStage = currentStageFor(command, context, input.policy);
  if (currentStage.tag === 'err') {
    if (input.consistency === 'locked')
      throw invariantViolationError({
        code: `production_order_route_${currentStage.error.code.toLowerCase()}`,
        message: currentStage.error.message,
        safeMessage: 'Stored production routing data is inconsistent.',
      });
    return proposalConflict({
      code: currentStage.error.code.toLowerCase(),
      message: currentStage.error.message,
    });
  }

  const decision: OrderRoutingDecision = input.policy.evaluateOrderRouting({
    command:
      command.kind === 'queued_move' ? 'queued_rebatch' : 'defer_or_rework',
    order: {
      productionOrderId: context.order.id,
      weightLbs: context.order.weightLbs,
    },
    source: {
      productionBatchId: context.source.productionBatchId,
      sequence: context.source.sequence,
      status: asBatchStatus(context.source.status),
      membershipFrozen: context.source.membershipFrozen,
    },
    currentStage: currentStage.value.stage,
    currentStageStatus: currentStage.value.status,
    restartStage: command.restartStage,
    targetCandidates: candidates.map((candidate) => ({
      productionBatchId: candidate.productionBatchId,
      sequence: candidate.sequence,
      status: asBatchStatus(candidate.status),
      membershipFrozen: candidate.membershipFrozen,
      stages: candidate.stages,
    })),
  });
  if (decision.decision === 'rejected')
    return decision.reason.code === 'NO_LATER_TARGET'
      ? proposalConflict({
          code: decision.reason.code.toLowerCase(),
          message: decision.reason.message,
        })
      : proposalValidation({
          code: decision.reason.code.toLowerCase(),
          message: decision.reason.message,
        });

  const target = context.candidates.find(
    (candidate) =>
      candidate.productionBatchId === decision.route.targetProductionBatchId,
  );
  if (target === undefined)
    throw invariantViolationError({
      code: 'production_order_route_target_missing',
      message: 'Stored production routing data is inconsistent.',
      safeMessage: 'Stored production routing data is inconsistent.',
    });

  const targetWeights = decision.route.targetAssignments.map(
    (assignment) => assignment.assignedWeightAfterLbs,
  );
  const targetCapacities = decision.route.targetAssignments.map(
    (assignment) => assignment.capacityLbs,
  );
  const unsigned: Omit<ProductionOrderRouteProposal, 'proposalHash'> = {
    kind: command.kind,
    productionRunId: context.run.id,
    productionOrderId: context.order.id,
    sourceProductionBatchId: context.source.productionBatchId,
    sourceBatchSequence: context.source.sequence,
    targetProductionBatchId: target.productionBatchId,
    targetBatchSequence: target.sequence,
    restartStage: command.restartStage,
    releasedStages: [...decision.route.releasedUnfinishedStages],
    assignedStages: decision.route.targetAssignments.map(
      (assignment) => assignment.stage,
    ),
    orderWeightLbs: context.order.weightLbs,
    targetWeightLbs: Math.max(...targetWeights),
    targetCapacityLbs: Math.min(...targetCapacities),
    expectedQueueVersion: context.run.queueVersion,
    expectedOrderVersion: context.order.version,
    expectedSourceBatchVersion: context.source.version,
    expectedTargetBatchVersion: target.version,
  };
  return {
    kind: 'propose',
    proposal: { ...unsigned, proposalHash: hashOrderRouteProposal(unsigned) },
  };
};
