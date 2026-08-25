import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ProductionOrderResolutionAvailability,
  ProductionOrderResolutionDenialReason,
  ProductionOrderResolutionReviewReason,
  ProductionRules,
} from '../../../model/public.ts';
import type {
  ProductionOrderCommandCapabilities,
  ProductionOrderCommandCapabilityContext,
  ProductionOrderRouteCommandDenialCode,
  ProductionQueuedMoveTarget,
  RoutingBatch,
} from './types.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const blocked = (
  code: ProductionOrderRouteCommandDenialCode,
): Readonly<{
  status: 'blocked';
  code: ProductionOrderRouteCommandDenialCode;
}> => ({ status: 'blocked', code });

const commonDenial = (
  policy: ProductionRules,
  context: ProductionOrderCommandCapabilityContext,
): ProductionOrderRouteCommandDenialCode | null => {
  if (context.run === null || context.source === null)
    return 'PRODUCTION_ORDER_ROUTE_NOT_FOUND';
  if (context.run.status !== 'started') return 'PRODUCTION_RUN_NOT_STARTED';
  const access = policy.evaluateProductionOrderOperationalAccess({
    resolutionState: context.order.resolutionState,
  });
  if (access.tag === 'err')
    return access.error.code === 'PRODUCTION_ORDER_RESOLVED'
      ? 'PRODUCTION_ORDER_RESOLVED'
      : 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID';
  const execution = policy.resolveProductionOrderExecutionState({
    executionState: context.order.executionStatus,
    operationalStatus: context.order.operationalStatus,
  });
  if (execution.tag === 'err')
    return 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID';
  if (execution.value !== 'scheduled') return 'PRODUCTION_ORDER_NOT_SCHEDULED';
  if (context.source.activeOrderCount <= 1)
    return 'SOURCE_BATCH_WOULD_BE_EMPTY';
  if (!Number.isFinite(context.order.weightLbs) || context.order.weightLbs <= 0)
    return 'ORDER_WEIGHT_INVALID';
  if (
    context.source.productionBatchId.length === 0 ||
    !Number.isInteger(context.source.sequence) ||
    context.source.sequence < 0
  )
    return 'SOURCE_BATCH_INVALID';
  return null;
};

const queuedTarget = (
  policy: ProductionRules,
  context: ProductionOrderCommandCapabilityContext,
  candidate: RoutingBatch,
): ProductionQueuedMoveTarget => {
  if (context.source === null)
    throw invariant(
      'production_order_capability_source_batch_missing',
      'Queued target evaluation requires a source batch.',
    );
  const decision = policy.evaluateQueuedMoveTarget({
    sourceProductionBatchId: context.source.productionBatchId,
    orderWeightLbs: context.order.weightLbs,
    target: candidate,
  });
  const effectiveCapacityLbs = candidate.stages.reduce(
    (capacityLbs, stage) => Math.min(capacityLbs, stage.capacityLbs),
    candidate.pulseCapacityLbs,
  );
  return {
    productionBatchId: candidate.productionBatchId,
    batchSequence: candidate.sequence,
    batchStatus: candidate.status,
    membershipFrozen: candidate.membershipFrozen,
    expectedBatchVersion: candidate.version,
    currentWeightLbs: candidate.derivedWeightLbs,
    projectedWeightLbs: candidate.derivedWeightLbs + context.order.weightLbs,
    capacityLbs: effectiveCapacityLbs,
    feasibility:
      decision.decision === 'allowed'
        ? { status: 'allowed' }
        : { status: 'blocked', code: decision.code },
  };
};

const routeExceptionCapability = (
  policy: ProductionRules,
  context: ProductionOrderCommandCapabilityContext,
  source: NonNullable<ProductionOrderCommandCapabilityContext['source']>,
  versions: Readonly<{
    expectedQueueVersion: number;
    expectedOrderVersion: number;
    expectedSourceBatchVersion: number;
  }>,
): ProductionOrderCommandCapabilities['routeException'] => {
  if (source.status === 'queued' || source.status === 'finished')
    return blocked('EXCEPTION_SOURCE_NOT_IN_FLIGHT');
  const currentStage = policy.deriveOrderRoutingCurrentStage({
    batchStatus: source.status,
    stages: source.stages,
    attempts: context.sourceAttempts,
  });
  if (currentStage.tag === 'err')
    return blocked('SOURCE_CURRENT_STAGE_MISMATCH');
  const decision = policy.evaluateOrderRouting({
    command: 'defer_or_rework',
    order: {
      productionOrderId: context.order.id,
      weightLbs: context.order.weightLbs,
    },
    source: {
      productionBatchId: source.productionBatchId,
      sequence: source.sequence,
      status: source.status,
      membershipFrozen: source.membershipFrozen,
    },
    currentStage: currentStage.value.stage,
    currentStageStatus: currentStage.value.status,
    restartStage: currentStage.value.stage,
    targetCandidates: context.candidates,
  });
  return decision.decision === 'accepted'
    ? { status: 'allowed', ...versions }
    : blocked(decision.reason.code);
};

export const assessOrderCommandCapabilities = (
  policy: ProductionRules,
  context: ProductionOrderCommandCapabilityContext,
): ProductionOrderCommandCapabilities => {
  const targets =
    context.source === null
      ? []
      : context.candidates.map((candidate) =>
          queuedTarget(policy, context, candidate),
        );
  const denial = commonDenial(policy, context);
  if (denial !== null)
    return {
      queuedMove: { ...blocked(denial), targets },
      routeException: blocked(denial),
    };
  const run = context.run;
  const source = context.source;
  if (run === null || source === null)
    throw invariant(
      'production_order_capability_context_missing',
      'Allowed routing context is incomplete.',
    );
  const versions = {
    expectedQueueVersion: run.queueVersion,
    expectedOrderVersion: context.order.version,
    expectedSourceBatchVersion: source.version,
  } as const;
  const queuedMove =
    source.status !== 'queued'
      ? { ...blocked('QUEUED_REBATCH_SOURCE_NOT_QUEUED'), targets }
      : source.membershipFrozen
        ? { ...blocked('QUEUED_REBATCH_SOURCE_FROZEN'), targets }
        : targets.some((target) => target.feasibility.status === 'allowed')
          ? { status: 'allowed' as const, ...versions, targets }
          : { ...blocked('NO_FEASIBLE_TARGET'), targets };
  return {
    queuedMove,
    routeException: routeExceptionCapability(policy, context, source, versions),
  };
};

type ResolutionFacts = Readonly<{
  resolutionState: string;
  executionStatus: string | null | undefined;
  operationalStatus: string;
  expectedVersion: number;
  hasShiftSelection: boolean;
  hasBatchMembership: boolean;
  hasStageAttempt: boolean;
  hasRoute: boolean;
  hasIntake: boolean;
  hasManualAdmission: boolean;
  isPriority: boolean;
  hasPendingPlacement: boolean;
}>;

export const assessResolutionAvailability = (
  policy: ProductionRules,
  facts: ResolutionFacts,
): ProductionOrderResolutionAvailability => {
  if (facts.resolutionState === 'resolved_without_production')
    return { status: 'blocked', reasons: ['resolution_transition_invalid'] };
  const execution = policy.resolveProductionOrderExecutionState({
    executionState: facts.executionStatus,
    operationalStatus: facts.operationalStatus,
  });
  if (execution.tag === 'err')
    return { status: 'blocked', reasons: ['execution_state_invalid'] };
  if (execution.value === 'finished')
    return { status: 'blocked', reasons: ['execution_finished'] };
  const lifecycle = policy.evaluateProductionOrderResolutionTransition({
    state: facts.resolutionState,
    event: 'resolve_without_production',
  });
  if (lifecycle.tag === 'err')
    return { status: 'blocked', reasons: ['resolution_transition_invalid'] };
  const guard = policy.evaluateProductionOrderResolutionGuard({
    executionState: execution.value,
    hasShiftSelection: facts.hasShiftSelection,
    hasBatchMembership: facts.hasBatchMembership,
    hasStageAttempt: facts.hasStageAttempt,
    hasRoute: facts.hasRoute,
    hasIntake: facts.hasIntake,
    hasManualAdmission: facts.hasManualAdmission,
    isPriority: facts.isPriority,
    hasPendingPlacement: facts.hasPendingPlacement,
  });
  if (guard.status === 'blocked')
    return {
      status: 'blocked',
      reasons: [
        ...guard.blockReasons,
      ] as ProductionOrderResolutionDenialReason[],
    };
  return {
    status: 'allowed',
    expectedVersion: facts.expectedVersion,
    requiresExplicitReview: guard.requiresExplicitReview,
    reviewReasons: [
      ...guard.reviewReasons,
    ] as ProductionOrderResolutionReviewReason[],
  };
};
