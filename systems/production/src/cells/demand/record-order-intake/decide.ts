import type {
  RecordOrderIntakeCommand,
  RecordOrderIntakeDecision,
  RecordOrderIntakeFacts,
  RecordOrderIntakePolicy,
} from './types.ts';

export const recordOrderIntakeOperationId =
  'production.record-order-intake.v1' as const;

const conflict = (
  code: string,
  message: string,
): RecordOrderIntakeDecision => ({
  kind: 'reject',
  failure: { kind: 'conflict', code, message, safeMessage: message },
});

const intakeStateConflict = (): RecordOrderIntakeDecision =>
  conflict(
    'production_order_intake_state_invalid',
    'Bag intake cannot change after an order enters production.',
  );

export const decideRecordOrderIntake = (input: {
  command: RecordOrderIntakeCommand;
  facts: RecordOrderIntakeFacts | null;
  policy: RecordOrderIntakePolicy;
}): RecordOrderIntakeDecision => {
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
      'The production order changed before intake was recorded.',
    );

  const access = input.policy.evaluateProductionOrderOperationalAccess({
    resolutionState: input.facts.resolutionState,
  });
  if (access.tag === 'err')
    return conflict(access.error.code.toLowerCase(), access.error.message);

  if (
    !['release_pending', 'intake_pending', 'eligible'].includes(
      input.facts.productionStatus,
    )
  )
    return intakeStateConflict();

  const admission = input.policy.evaluateIntakeAdmission({
    phase: input.facts.demandPhase,
    derivedWeightLbs: input.facts.derivedWeightLbs,
    bagCount: input.command.bagCount,
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
  if (execution.value !== 'unassigned') return intakeStateConflict();

  const admissionFact =
    input.facts.demandPhase === 'production_released'
      ? 'released'
      : input.facts.demandPhase === 'withdrawn'
        ? 'withdrawn'
        : input.facts.demandPhase === 'post_production'
          ? 'post_production'
          : 'unreleased';
  const nextStatus = input.policy.deriveProductionOrderOperationalStatus({
    executionState: execution.value,
    admission: admissionFact,
    admissionOverride: input.facts.admissionOverride,
    hasPositiveDemand: input.facts.derivedWeightLbs > 0,
    bagCount: input.command.bagCount,
  });
  if (nextStatus !== 'release_pending' && nextStatus !== 'eligible')
    return conflict(
      'production_order_intake_state_invalid',
      'Bag intake does not produce an admissible production state.',
    );

  return { kind: 'commit', nextStatus };
};
