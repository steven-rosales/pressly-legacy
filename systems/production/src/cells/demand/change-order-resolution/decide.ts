import type {
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionDecision,
  ChangeOrderResolutionExpectedFailure,
  ChangeOrderResolutionFacts,
  ChangeOrderResolutionPolicy,
  RestoredOrderSourceProjection,
} from './types.ts';

export const changeOrderResolutionOperationId =
  'production.change-order-resolution.v1' as const;

const conflict = (
  code: string,
  message: string,
): ChangeOrderResolutionDecision => ({
  kind: 'reject',
  failure: { kind: 'conflict', code, message, safeMessage: message },
});

const notFound = (): ChangeOrderResolutionDecision => ({
  kind: 'reject',
  failure: {
    kind: 'not_found',
    code: 'production_order_not_found',
    message: 'The production order was not found.',
    safeMessage: 'The production order was not found.',
  },
});

const policyConflict = (failure: {
  code: string;
  message: string;
}): ChangeOrderResolutionDecision =>
  conflict(failure.code.toLowerCase(), failure.message);

const restoredAdmissionFact = (input: {
  commercialState: ChangeOrderResolutionFacts['sourceCommercialState'];
  phase: ChangeOrderResolutionFacts['demandPhase'];
  admission: ChangeOrderResolutionFacts['sourceAdmissionState'];
}): 'unreleased' | 'released' | 'withdrawn' | 'post_production' =>
  input.commercialState !== 'open' || input.phase === 'post_production'
    ? 'post_production'
    : input.admission;

const versionConflict = (): ChangeOrderResolutionExpectedFailure => ({
  kind: 'conflict',
  code: 'production_order_version_conflict',
  message:
    'The order changed before its archive status was updated. Refresh and review the current state.',
  safeMessage:
    'The order changed before its archive status was updated. Refresh and review the current state.',
});

export const decideChangeOrderResolution = (input: {
  command: ChangeOrderResolutionCommand;
  facts: ChangeOrderResolutionFacts | null;
  policy: ChangeOrderResolutionPolicy;
}): ChangeOrderResolutionDecision => {
  if (input.facts === null) return notFound();
  if (input.facts.productionVersion !== input.command.expectedVersion)
    return { kind: 'reject', failure: versionConflict() };

  if (
    input.command.sourceStatePrecondition !== undefined &&
    (input.facts.sourceCommercialState !==
      input.command.sourceStatePrecondition.commercialState ||
      input.facts.sourceAdmissionState !==
        input.command.sourceStatePrecondition.admissionState)
  )
    return conflict(
      'production_order_source_state_conflict',
      'The canonical order or fulfillment changed before the archive status was updated.',
    );

  const transition = input.policy.evaluateProductionOrderResolutionTransition({
    state: input.facts.resolutionState,
    event: input.command.action,
  });
  if (transition.tag === 'err') return policyConflict(transition.error);

  const execution = input.policy.resolveProductionOrderExecutionState({
    executionState: input.facts.executionStatus,
    operationalStatus: input.facts.operationalStatus,
  });
  if (execution.tag === 'err') return policyConflict(execution.error);

  let clearPendingPlacement = false;
  let reviewReasons: readonly string[] = [];
  let restoredSourceProjection: RestoredOrderSourceProjection | null = null;

  if (input.command.action === 'resolve_without_production') {
    const guard = input.policy.evaluateProductionOrderResolutionGuard({
      executionState: execution.value,
      hasShiftSelection:
        input.facts.hasShiftSelection || input.facts.hasHistoricalPlanSelection,
      hasBatchMembership: input.facts.hasBatchMembership,
      hasStageAttempt: input.facts.hasStageAttempt,
      hasRoute: input.facts.hasRoute,
      hasIntake: input.facts.hasIntake,
      hasManualAdmission: input.facts.hasManualAdmission,
      isPriority: input.facts.isPriority,
      hasPendingPlacement: input.facts.hasPendingPlacement,
    });
    if (guard.status === 'blocked')
      return conflict(
        'production_order_resolution_blocked',
        'This order has production participation and must remain in operational history.',
      );
    if (guard.requiresExplicitReview && !input.command.confirmReviewedFacts)
      return conflict(
        'production_order_resolution_review_required',
        'Review the recorded operational facts before archiving this order from active work.',
      );
    clearPendingPlacement = guard.mayClearPendingPlacement;
    reviewReasons = guard.reviewReasons;
  } else {
    if (execution.value !== 'unassigned')
      return conflict(
        'production_order_restore_blocked',
        'Only never-produced work can be restored to active operations.',
      );
    if (
      input.facts.sourceEstimatedWeightLbs === null ||
      input.facts.sourceEstimatedWeightLbs <= 0 ||
      input.facts.sourceEstimatedWeightSource === null
    )
      return conflict(
        'production_order_restore_demand_invalid',
        'The current source demand does not contain a positive weight estimate. Refresh the source order before restoring it.',
      );
    const operationalStatus =
      input.policy.deriveProductionOrderOperationalStatus({
        executionState: execution.value,
        admission: restoredAdmissionFact({
          commercialState: input.facts.sourceCommercialState,
          phase: input.facts.demandPhase,
          admission: input.facts.sourceAdmissionState,
        }),
        admissionOverride: input.facts.admissionOverride,
        hasPositiveDemand: true,
        bagCount: input.facts.bagCount,
      });
    if (operationalStatus === 'scheduled' || operationalStatus === 'finished')
      return conflict(
        'production_order_restore_state_invalid',
        'The retained order facts do not produce an open operational state.',
      );
    restoredSourceProjection = {
      dueAt: input.facts.sourceDueAt,
      derivedWeightLbs: input.facts.sourceEstimatedWeightLbs,
      derivedWeightSource: input.facts.sourceEstimatedWeightSource,
      operationalStatus,
      clearAdmissionOverride: input.facts.sourceAdmissionState !== 'unreleased',
    };
  }

  return {
    kind: 'commit',
    lifecycle: transition.value,
    clearPendingPlacement,
    reviewReasons,
    restoredSourceProjection,
  };
};
