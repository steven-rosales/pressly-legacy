import * as result from '@pressly/cells/result';
import type { CodedFailure, Result } from '@pressly/cells/result';

export const orderRoutingStages = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

export type OrderRoutingStage = (typeof orderRoutingStages)[number];
export type OrderRoutingStageStatus = 'planned' | 'started' | 'completed';
export type OrderRoutingBatchStatus = 'queued' | OrderRoutingStage | 'finished';
export type OrderRoutingCommand = 'queued_rebatch' | 'defer_or_rework';

export type OrderRoutingTargetStage = Readonly<{
  stage: OrderRoutingStage;
  status: OrderRoutingStageStatus;
  assignedWeightLbs: number;
  capacityLbs: number;
}>;

export type OrderRoutingTargetCandidate = Readonly<{
  productionBatchId: string;
  sequence: number;
  status: OrderRoutingBatchStatus;
  membershipFrozen: boolean;
  stages: readonly OrderRoutingTargetStage[];
}>;

export type QueuedMoveTargetRejectionCode =
  | 'TARGET_IS_SOURCE_BATCH'
  | 'TARGET_NOT_QUEUED'
  | 'TARGET_MEMBERSHIP_FROZEN'
  | 'TARGET_STAGE_GRAPH_INVALID'
  | 'TARGET_STAGE_NOT_PLANNED'
  | 'HARD_CAPACITY_EXCEEDED';

export type QueuedMoveTargetDecision =
  | Readonly<{ decision: 'allowed' }>
  | Readonly<{
      decision: 'blocked';
      code: QueuedMoveTargetRejectionCode;
    }>;

export type QueuedMoveTargetInput = Readonly<{
  sourceProductionBatchId: string;
  orderWeightLbs: number;
  target: OrderRoutingTargetCandidate;
}>;

export type OrderRoutingInput = Readonly<{
  command: OrderRoutingCommand;
  order: Readonly<{
    productionOrderId: string;
    weightLbs: number;
  }>;
  source: Readonly<{
    productionBatchId: string;
    sequence: number;
    status: OrderRoutingBatchStatus;
    membershipFrozen: boolean;
  }>;
  currentStage: OrderRoutingStage;
  currentStageStatus: Extract<OrderRoutingStageStatus, 'planned' | 'started'>;
  restartStage: OrderRoutingStage;
  targetCandidates: readonly OrderRoutingTargetCandidate[];
}>;

export type OrderRoutingCurrentStageInput = Readonly<{
  batchStatus: OrderRoutingBatchStatus;
  stages: readonly Readonly<{
    stage: OrderRoutingStage;
    status: OrderRoutingStageStatus;
  }>[];
  attempts: readonly Readonly<{
    stage: OrderRoutingStage;
    status: 'assigned' | 'completed' | 'released';
  }>[];
}>;

export type OrderRoutingCurrentStage = Readonly<{
  stage: OrderRoutingStage;
  status: Extract<OrderRoutingStageStatus, 'planned' | 'started'>;
}>;

export type OrderRoutingRejectionCode =
  | 'ORDER_WEIGHT_INVALID'
  | 'SOURCE_BATCH_INVALID'
  | 'QUEUED_REBATCH_SOURCE_NOT_QUEUED'
  | 'QUEUED_REBATCH_SOURCE_FROZEN'
  | 'EXCEPTION_SOURCE_NOT_IN_FLIGHT'
  | 'SOURCE_CURRENT_STAGE_MISMATCH'
  | 'RESTART_STAGE_SKIPS_REQUIRED_WORK'
  | 'TARGET_STAGE_GRAPH_INVALID'
  | 'NO_LATER_TARGET'
  | 'NO_FEASIBLE_TARGET'
  | 'HARD_CAPACITY_EXCEEDED';

export type OrderRoutingTargetAssignment = Readonly<{
  stage: OrderRoutingStage;
  sourceDisposition: 'release_unfinished' | 'preserve_completed_for_rework';
  assignedWeightBeforeLbs: number;
  assignedWeightAfterLbs: number;
  capacityLbs: number;
}>;

export type OrderRoutingAcceptedDecision = Readonly<{
  decision: 'accepted';
  command: OrderRoutingCommand;
  wholeOrder: Readonly<{
    productionOrderId: string;
    weightLbs: number;
  }>;
  route: Readonly<{
    sourceProductionBatchId: string;
    sourceSequence: number;
    targetProductionBatchId: string;
    targetSequence: number;
    currentStage: OrderRoutingStage;
    restartStage: OrderRoutingStage;
    releasedUnfinishedStages: readonly OrderRoutingStage[];
    reworkStages: readonly OrderRoutingStage[];
    targetAssignments: readonly OrderRoutingTargetAssignment[];
  }>;
}>;

export type OrderRoutingRejectedDecision = Readonly<{
  decision: 'rejected';
  command: OrderRoutingCommand;
  reason: Readonly<{
    code: OrderRoutingRejectionCode;
    message: string;
  }>;
}>;

export type OrderRoutingDecision =
  | OrderRoutingAcceptedDecision
  | OrderRoutingRejectedDecision;

const stageIndex = (stage: OrderRoutingStage): number =>
  orderRoutingStages.indexOf(stage);

const sourceProgressFailure = (
  code: string,
  message: string,
): CodedFailure => ({ code, message });

export const deriveOrderRoutingCurrentStage = (
  input: OrderRoutingCurrentStageInput,
): Result<OrderRoutingCurrentStage, CodedFailure> => {
  if (input.stages.length !== orderRoutingStages.length)
    return result.err(
      sourceProgressFailure(
        'SOURCE_STAGE_GRAPH_INVALID',
        'The source batch stage graph is incomplete.',
      ),
    );

  const byStage = new Map(input.stages.map((stage) => [stage.stage, stage]));
  if (byStage.size !== orderRoutingStages.length)
    return result.err(
      sourceProgressFailure(
        'SOURCE_STAGE_GRAPH_INVALID',
        'The source batch stage graph is incomplete.',
      ),
    );
  const stages = orderRoutingStages.flatMap((stage) => {
    const value = byStage.get(stage);
    return value === undefined ? [] : [value];
  });
  if (stages.length !== orderRoutingStages.length)
    return result.err(
      sourceProgressFailure(
        'SOURCE_STAGE_GRAPH_INVALID',
        'The source batch stage graph is incomplete.',
      ),
    );

  let completedPrefixLength = 0;
  while (stages[completedPrefixLength]?.status === 'completed')
    completedPrefixLength += 1;
  const activeStageIndex = stages.findIndex(
    (stage) => stage.status === 'started',
  );
  const suffixStart =
    activeStageIndex < 0 ? completedPrefixLength : activeStageIndex + 1;
  const stageSequenceValid =
    (activeStageIndex < 0 || activeStageIndex === completedPrefixLength) &&
    stages.slice(suffixStart).every((stage) => stage.status === 'planned');
  if (!stageSequenceValid)
    return result.err(
      sourceProgressFailure(
        'SOURCE_STAGE_SEQUENCE_INVALID',
        'The source batch stages are not one completed prefix with at most one active stage.',
      ),
    );

  const activeStage =
    activeStageIndex < 0 ? undefined : orderRoutingStages[activeStageIndex];
  const completedStage =
    completedPrefixLength === 0
      ? undefined
      : orderRoutingStages[completedPrefixLength - 1];
  if (
    completedPrefixLength !== orderRoutingStages.length &&
    ((activeStageIndex >= 0 && activeStage === undefined) ||
      (activeStageIndex < 0 &&
        completedPrefixLength > 0 &&
        completedStage === undefined))
  )
    return result.err(
      sourceProgressFailure(
        'SOURCE_STAGE_GRAPH_INVALID',
        'The source batch stage graph is incomplete.',
      ),
    );
  const expectedBatchStatus: OrderRoutingBatchStatus =
    completedPrefixLength === orderRoutingStages.length
      ? 'finished'
      : (activeStage ?? completedStage ?? 'queued');
  if (input.batchStatus !== expectedBatchStatus)
    return result.err(
      sourceProgressFailure(
        'SOURCE_BATCH_STATUS_INCONSISTENT',
        'The source batch status does not match its canonical stage graph.',
      ),
    );

  const assignedCounts = new Map<OrderRoutingStage, number>();
  for (const attempt of input.attempts) {
    if (attempt.status !== 'assigned') continue;
    assignedCounts.set(
      attempt.stage,
      (assignedCounts.get(attempt.stage) ?? 0) + 1,
    );
  }
  if ([...assignedCounts.values()].some((count) => count > 1))
    return result.err(
      sourceProgressFailure(
        'SOURCE_ORDER_ATTEMPT_INVALID',
        'The source order has duplicate active stage attempts.',
      ),
    );
  const currentStage = orderRoutingStages.find(
    (stage) => (assignedCounts.get(stage) ?? 0) === 1,
  );
  if (currentStage === undefined)
    return result.err(
      sourceProgressFailure(
        'SOURCE_ORDER_ATTEMPT_MISSING',
        'The source order has no unfinished stage attempt.',
      ),
    );

  const currentStageIndex = stageIndex(currentStage);
  const currentStageFact = stages[currentStageIndex];
  if (currentStageFact === undefined)
    return result.err(
      sourceProgressFailure(
        'SOURCE_STAGE_GRAPH_INVALID',
        'The source batch stage graph is incomplete.',
      ),
    );
  const currentStageStatus = currentStageFact.status;
  const currentStageMatchesBatch =
    (currentStageStatus === 'started' &&
      activeStageIndex === currentStageIndex) ||
    (currentStageStatus === 'planned' &&
      activeStageIndex < 0 &&
      completedPrefixLength === currentStageIndex);
  if (!currentStageMatchesBatch)
    return result.err(
      sourceProgressFailure(
        'SOURCE_ORDER_ATTEMPT_INCONSISTENT',
        'The source order unfinished attempt does not match current batch progress.',
      ),
    );

  return result.ok({ stage: currentStage, status: currentStageStatus });
};

const reject = (
  command: OrderRoutingCommand,
  code: OrderRoutingRejectionCode,
  message: string,
): OrderRoutingRejectedDecision => ({
  decision: 'rejected',
  command,
  reason: { code, message },
});

const hasCanonicalStageGraph = (
  candidate: OrderRoutingTargetCandidate,
): boolean => {
  if (candidate.stages.length !== orderRoutingStages.length) return false;

  const byStage = new Map(
    candidate.stages.map((stage) => [stage.stage, stage]),
  );
  if (byStage.size !== orderRoutingStages.length) return false;

  return orderRoutingStages.every((stage) => {
    const candidateStage = byStage.get(stage);
    return (
      candidateStage !== undefined &&
      ['planned', 'started', 'completed'].includes(candidateStage.status) &&
      Number.isFinite(candidateStage.assignedWeightLbs) &&
      candidateStage.assignedWeightLbs >= 0 &&
      Number.isFinite(candidateStage.capacityLbs) &&
      candidateStage.capacityLbs > 0
    );
  });
};

const stageMap = (
  candidate: OrderRoutingTargetCandidate,
): ReadonlyMap<OrderRoutingStage, OrderRoutingTargetStage> =>
  new Map(candidate.stages.map((stage) => [stage.stage, stage]));

const suffixFrom = (stage: OrderRoutingStage): readonly OrderRoutingStage[] =>
  orderRoutingStages.slice(stageIndex(stage));

const targetCanReceiveSuffixForStages = (
  candidate: OrderRoutingTargetCandidate,
  routedStages: readonly OrderRoutingStage[],
): boolean => {
  const stages = stageMap(candidate);
  return routedStages.every((stage) => stages.get(stage)?.status === 'planned');
};

const targetCanReceiveSuffix = (
  input: OrderRoutingInput,
  candidate: OrderRoutingTargetCandidate,
  routedStages: readonly OrderRoutingStage[],
): boolean => {
  if (
    input.command === 'queued_rebatch' &&
    (candidate.status !== 'queued' || candidate.membershipFrozen)
  )
    return false;

  if (candidate.status === 'finished') return false;

  return targetCanReceiveSuffixForStages(candidate, routedStages);
};

const targetHasCapacity = (
  candidate: OrderRoutingTargetCandidate,
  routedStages: readonly OrderRoutingStage[],
  orderWeightLbs: number,
): boolean => {
  const stages = stageMap(candidate);
  return routedStages.every((stage) => {
    const target = stages.get(stage);
    return (
      target !== undefined &&
      target.assignedWeightLbs + orderWeightLbs <= target.capacityLbs
    );
  });
};

export const evaluateQueuedMoveTarget = (
  input: QueuedMoveTargetInput,
): QueuedMoveTargetDecision => {
  if (input.target.productionBatchId === input.sourceProductionBatchId)
    return { decision: 'blocked', code: 'TARGET_IS_SOURCE_BATCH' };
  if (input.target.status !== 'queued')
    return { decision: 'blocked', code: 'TARGET_NOT_QUEUED' };
  if (input.target.membershipFrozen)
    return { decision: 'blocked', code: 'TARGET_MEMBERSHIP_FROZEN' };
  if (!hasCanonicalStageGraph(input.target))
    return { decision: 'blocked', code: 'TARGET_STAGE_GRAPH_INVALID' };

  const routedStages = suffixFrom('sorting');
  if (!targetCanReceiveSuffixForStages(input.target, routedStages))
    return { decision: 'blocked', code: 'TARGET_STAGE_NOT_PLANNED' };
  if (!targetHasCapacity(input.target, routedStages, input.orderWeightLbs))
    return { decision: 'blocked', code: 'HARD_CAPACITY_EXCEEDED' };
  return { decision: 'allowed' };
};

const orderedCandidates = (
  candidates: readonly OrderRoutingTargetCandidate[],
): readonly OrderRoutingTargetCandidate[] =>
  candidates
    .slice()
    .sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.productionBatchId.localeCompare(right.productionBatchId),
    );

export const evaluateOrderRouting = (
  input: OrderRoutingInput,
): OrderRoutingDecision => {
  if (!Number.isFinite(input.order.weightLbs) || input.order.weightLbs <= 0)
    return reject(
      input.command,
      'ORDER_WEIGHT_INVALID',
      'Order routing requires one positive whole-order weight.',
    );

  if (
    input.source.productionBatchId.length === 0 ||
    !Number.isInteger(input.source.sequence) ||
    input.source.sequence < 0
  )
    return reject(
      input.command,
      'SOURCE_BATCH_INVALID',
      'The source production batch identity or sequence is invalid.',
    );

  if (stageIndex(input.restartStage) > stageIndex(input.currentStage))
    return reject(
      input.command,
      'RESTART_STAGE_SKIPS_REQUIRED_WORK',
      'Routing cannot skip the order current stage or any required work.',
    );

  if (input.command === 'queued_rebatch') {
    if (input.source.status !== 'queued')
      return reject(
        input.command,
        'QUEUED_REBATCH_SOURCE_NOT_QUEUED',
        'Queued rebatching is only valid before the source batch starts.',
      );
    if (input.source.membershipFrozen)
      return reject(
        input.command,
        'QUEUED_REBATCH_SOURCE_FROZEN',
        'Queued rebatching cannot override frozen source membership.',
      );
  } else {
    if (input.source.status === 'queued' || input.source.status === 'finished')
      return reject(
        input.command,
        'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
        'Deferral or rework requires an in-flight source batch.',
      );
    const currentIndex = stageIndex(input.currentStage);
    const sourceMatchesCurrentStage =
      input.currentStageStatus === 'started'
        ? input.source.status === input.currentStage
        : currentIndex > 0 &&
          input.source.status === orderRoutingStages[currentIndex - 1];
    if (!sourceMatchesCurrentStage)
      return reject(
        input.command,
        'SOURCE_CURRENT_STAGE_MISMATCH',
        'The order current stage must match the in-flight source batch.',
      );
  }

  if (!input.targetCandidates.every(hasCanonicalStageGraph))
    return reject(
      input.command,
      'TARGET_STAGE_GRAPH_INVALID',
      'Every target candidate must provide one valid load for each stage.',
    );

  const candidates = orderedCandidates(input.targetCandidates).filter(
    (candidate) =>
      candidate.productionBatchId !== input.source.productionBatchId &&
      (input.command === 'queued_rebatch' ||
        candidate.sequence > input.source.sequence),
  );

  if (input.command === 'defer_or_rework' && candidates.length === 0)
    return reject(
      input.command,
      'NO_LATER_TARGET',
      'Deferral or rework requires a later production batch.',
    );

  const routedStages = suffixFrom(input.restartStage);
  const stageFeasibleCandidates = candidates.filter((candidate) =>
    targetCanReceiveSuffix(input, candidate, routedStages),
  );
  if (stageFeasibleCandidates.length === 0)
    return reject(
      input.command,
      'NO_FEASIBLE_TARGET',
      'No target batch can receive the requested stage suffix.',
    );

  const target = stageFeasibleCandidates.find((candidate) =>
    targetHasCapacity(candidate, routedStages, input.order.weightLbs),
  );
  if (target === undefined)
    return reject(
      input.command,
      'HARD_CAPACITY_EXCEEDED',
      'The whole order exceeds capacity in every otherwise-feasible target.',
    );

  const currentIndex = stageIndex(input.currentStage);
  const restartIndex = stageIndex(input.restartStage);
  const targetStages = stageMap(target);
  const targetAssignments = routedStages.flatMap((stage) => {
    const targetStage = targetStages.get(stage);
    return targetStage === undefined
      ? []
      : [
          {
            stage,
            sourceDisposition:
              stageIndex(stage) < currentIndex
                ? ('preserve_completed_for_rework' as const)
                : ('release_unfinished' as const),
            assignedWeightBeforeLbs: targetStage.assignedWeightLbs,
            assignedWeightAfterLbs:
              targetStage.assignedWeightLbs + input.order.weightLbs,
            capacityLbs: targetStage.capacityLbs,
          },
        ];
  });
  if (targetAssignments.length !== routedStages.length)
    return reject(
      input.command,
      'TARGET_STAGE_GRAPH_INVALID',
      'Every target candidate must provide one valid load for each stage.',
    );

  return {
    decision: 'accepted',
    command: input.command,
    wholeOrder: { ...input.order },
    route: {
      sourceProductionBatchId: input.source.productionBatchId,
      sourceSequence: input.source.sequence,
      targetProductionBatchId: target.productionBatchId,
      targetSequence: target.sequence,
      currentStage: input.currentStage,
      restartStage: input.restartStage,
      releasedUnfinishedStages: orderRoutingStages.slice(currentIndex),
      reworkStages: orderRoutingStages.slice(restartIndex, currentIndex),
      targetAssignments,
    },
  };
};
