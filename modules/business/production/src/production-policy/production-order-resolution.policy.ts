import type {
  ProductionOrderResolutionAvailability,
  ProductionOrderResolutionDenialReason,
} from '@pressly/contracts';
import type {
  ProductionOrderResolutionLifecycleDecision,
  ProductionOrderResolutionReviewReason,
} from '../production-lifecycle/production-lifecycle.model.ts';
import type { ProductionPolicyPort } from './production-policy.port.ts';

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

export type ProductionOrderResolutionPolicy = Pick<
  ProductionPolicyPort,
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderResolutionTransition'
  | 'evaluateProductionOrderResolutionGuard'
>;

export type ProductionOrderResolutionAssessment =
  | Readonly<{
      status: 'already_historical';
      reason: 'resolved_without_production' | 'execution_finished';
    }>
  | Readonly<{
      status: 'blocked';
      reasons: readonly ProductionOrderResolutionDenialReason[];
    }>
  | Readonly<{
      status: 'allowed';
      expectedVersion: number;
      requiresExplicitReview: boolean;
      reviewReasons: readonly ProductionOrderResolutionReviewReason[];
      lifecycle: ProductionOrderResolutionLifecycleDecision;
    }>;

/**
 * Computes whether an order may leave active work from canonical Production
 * facts. External source observations are intentionally absent from this input.
 */
export const assessProductionOrderResolution = (
  policy: ProductionOrderResolutionPolicy,
  facts: ResolutionFacts,
): ProductionOrderResolutionAssessment => {
  if (facts.resolutionState === 'resolved_without_production')
    return {
      status: 'already_historical',
      reason: 'resolved_without_production',
    };

  const execution = policy.resolveProductionOrderExecutionState({
    executionState: facts.executionStatus,
    operationalStatus: facts.operationalStatus,
  });
  if (execution.tag === 'err')
    return { status: 'blocked', reasons: ['execution_state_invalid'] };
  if (execution.value === 'finished')
    return { status: 'already_historical', reason: 'execution_finished' };

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
    return { status: 'blocked', reasons: guard.blockReasons };

  return {
    status: 'allowed',
    expectedVersion: facts.expectedVersion,
    requiresExplicitReview: guard.requiresExplicitReview,
    reviewReasons: guard.reviewReasons,
    lifecycle: lifecycle.value,
  };
};

export const toProductionOrderResolutionAvailability = (
  assessment: ProductionOrderResolutionAssessment,
): ProductionOrderResolutionAvailability => {
  if (assessment.status === 'allowed')
    return {
      status: 'allowed',
      expectedVersion: assessment.expectedVersion,
      requiresExplicitReview: assessment.requiresExplicitReview,
      reviewReasons: [...assessment.reviewReasons],
    };
  if (assessment.status === 'blocked')
    return { status: 'blocked', reasons: [...assessment.reasons] };

  return {
    status: 'blocked',
    reasons: [
      assessment.reason === 'execution_finished'
        ? 'execution_finished'
        : 'resolution_transition_invalid',
    ],
  };
};
