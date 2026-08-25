import type {
  ChangeAdmissionCommand,
  ChangeAdmissionDecision,
  ChangeAdmissionFacts,
  ChangeAdmissionPolicy,
} from './types.ts';

export const changeAdmissionOperationId =
  'production.change-admission.v1' as const;

const conflict = (code: string, message: string): ChangeAdmissionDecision => ({
  kind: 'reject',
  failure: { kind: 'conflict', code, message, safeMessage: message },
});

export const decideChangeAdmission = (input: {
  command: ChangeAdmissionCommand;
  facts: ChangeAdmissionFacts | null;
  policy: ChangeAdmissionPolicy;
}): ChangeAdmissionDecision => {
  if (input.facts === null)
    return {
      kind: 'reject',
      failure: {
        kind: 'not_found',
        code: 'production_order_not_found',
        message: 'The production order was not found.',
        safeMessage: 'The production order was not found.',
      },
    };

  if (input.facts.productionVersion !== input.command.expectedVersion)
    return conflict(
      'production_order_version_conflict',
      'The order changed before its production admission was updated. Refresh and review the current state.',
    );

  const access = input.policy.evaluateProductionOrderOperationalAccess({
    resolutionState: input.facts.resolutionState,
  });
  if (access.tag === 'err')
    return conflict(access.error.code.toLowerCase(), access.error.message);

  const admission = input.policy.evaluateProductionAdmission({
    target: input.command.target,
    sourceAdmissionState: input.facts.sourceAdmissionState,
    productionStatus: input.facts.productionStatus,
    admissionOverride: input.facts.admissionOverride,
    bagCount: input.facts.bagCount,
    selectedForShift: input.facts.selectedForShift,
    hasActivePlacement: input.facts.hasActivePlacement,
  });
  if (admission.tag === 'err')
    return conflict(
      admission.error.code.toLowerCase(),
      admission.error.message,
    );

  const execution = input.policy.resolveProductionOrderExecutionState({
    executionState: input.facts.executionStatus,
    operationalStatus: input.facts.productionStatus,
  });
  if (execution.tag === 'err')
    return conflict(
      execution.error.code.toLowerCase(),
      execution.error.message,
    );
  if (execution.value !== 'unassigned')
    return conflict(
      'production_admission_already_committed',
      'This order is already committed to production.',
    );

  const nextStatus = input.policy.deriveProductionOrderOperationalStatus({
    executionState: execution.value,
    admission: input.facts.sourceAdmissionState,
    admissionOverride: admission.value.admissionOverride,
    hasPositiveDemand: input.facts.derivedWeightLbs > 0,
    bagCount: input.facts.bagCount,
  });
  if (
    nextStatus !== 'release_pending' &&
    nextStatus !== 'intake_pending' &&
    nextStatus !== 'eligible'
  )
    return conflict(
      'production_admission_state_invalid',
      'The production admission facts do not produce a usable readiness state.',
    );

  return {
    kind: 'commit',
    admissionOverride: admission.value.admissionOverride,
    nextStatus,
  };
};
