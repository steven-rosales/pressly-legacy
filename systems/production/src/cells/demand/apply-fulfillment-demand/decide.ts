import {
  applyFulfillmentDemandConflictFailure,
  applyFulfillmentDemandValidationFailure,
} from './failures.ts';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandDecision,
  ApplyFulfillmentDemandExpectedFailure,
  ApplyFulfillmentDemandPhase,
  ApplyFulfillmentDemandPolicy,
  FulfillmentAdmissionState,
  FulfillmentProductionMutation,
  StoredFulfillmentDemand,
} from './types.ts';
import type { ProductionOrderExecutionState } from '../../../model/public.ts';

const hashPattern = /^[a-f0-9]{64}$/;

export const validateApplyFulfillmentDemand = (
  command: ApplyFulfillmentDemandCommand,
): ApplyFulfillmentDemandExpectedFailure | null => {
  const dueAt = Date.parse(command.dueAt);
  const observedAt = Date.parse(command.observedAt);
  if (
    !Number.isInteger(command.fulfillmentVersion) ||
    command.fulfillmentVersion < 1 ||
    !hashPattern.test(command.projectionHash) ||
    !Number.isFinite(dueAt) ||
    !Number.isFinite(observedAt)
  )
    return applyFulfillmentDemandValidationFailure({
      code: 'fulfillment_demand_invalid',
      message: 'The fulfillment demand version, dates, or hash are invalid.',
    });

  if (
    (command.estimatedWeightLbs !== null &&
      (!Number.isFinite(command.estimatedWeightLbs) ||
        command.estimatedWeightLbs <= 0)) ||
    (command.estimatedWeightLbs === null) !==
      (command.estimatedWeightSource === null)
  )
    return applyFulfillmentDemandValidationFailure({
      code: 'fulfillment_demand_weight_invalid',
      message: 'The fulfillment estimate and its provenance are inconsistent.',
    });

  return null;
};

export const applyFulfillmentDemandPhase = (
  admission: FulfillmentAdmissionState,
): ApplyFulfillmentDemandPhase => {
  switch (admission) {
    case 'unreleased':
      return 'expected';
    case 'released':
      return 'production_released';
    case 'withdrawn':
      return 'withdrawn';
  }
};

export const decideApplyFulfillmentDemand = (input: {
  command: ApplyFulfillmentDemandCommand;
  existing: StoredFulfillmentDemand | null;
  policy: ApplyFulfillmentDemandPolicy;
}): ApplyFulfillmentDemandDecision => {
  if (
    input.existing !== null &&
    input.existing.locationId !== input.command.locationId
  )
    return {
      kind: 'reject',
      failure: applyFulfillmentDemandConflictFailure({
        code: 'fulfillment_location_changed',
        message: 'The fulfillment resolved to a different production location.',
      }),
    };

  if (
    input.existing !== null &&
    input.command.fulfillmentVersion < input.existing.fulfillmentVersion
  )
    return { kind: 'audit', outcome: 'ignored_older' };

  if (
    input.existing !== null &&
    input.command.fulfillmentVersion === input.existing.fulfillmentVersion &&
    input.command.projectionHash !== input.existing.projectionHash
  )
    return {
      kind: 'reject',
      failure: applyFulfillmentDemandConflictFailure({
        code: 'fulfillment_demand_diverged',
        message: 'The same fulfillment version produced different demand data.',
      }),
    };

  if (
    input.existing !== null &&
    input.command.fulfillmentVersion === input.existing.fulfillmentVersion
  )
    return { kind: 'audit', outcome: 'unchanged' };

  const effectiveAdmissionState =
    input.command.admissionState === 'unreleased' &&
    input.existing?.admissionOverride === 'released'
      ? 'released'
      : input.command.admissionState;
  const lifecycle = input.policy.evaluateDemandLifecycle({
    phase: applyFulfillmentDemandPhase(effectiveAdmissionState),
    productionStatus: input.existing?.productionStatus ?? null,
    currentBagCount: input.existing?.bagCount ?? null,
    estimatedWeightLbs: input.command.estimatedWeightLbs,
  });
  let production: FulfillmentProductionMutation =
    input.existing?.productionResolutionState === 'resolved_without_production'
      ? { action: 'preserve' }
      : lifecycle.production;

  if (production.action === 'create' || production.action === 'update') {
    let executionState: ProductionOrderExecutionState =
      input.policy.initialProductionOrderExecutionState;
    if (input.existing !== null && input.existing.productionStatus !== null) {
      const resolved = input.policy.resolveProductionOrderExecutionState({
        executionState: input.existing.productionExecutionStatus,
        operationalStatus: input.existing.productionStatus,
      });
      if (resolved.tag === 'err')
        return {
          kind: 'reject',
          failure: applyFulfillmentDemandConflictFailure({
            code: resolved.error.code.toLowerCase(),
            message: resolved.error.message,
          }),
        };
      executionState = resolved.value;
    }
    production = {
      ...production,
      status: input.policy.deriveProductionOrderOperationalStatus({
        executionState,
        admission: input.command.admissionState,
        admissionOverride: input.existing?.admissionOverride ?? null,
        hasPositiveDemand:
          input.command.estimatedWeightLbs !== null &&
          input.command.estimatedWeightLbs > 0,
        bagCount: lifecycle.canonicalBagCount,
      }),
    };
  }

  return {
    kind: 'apply',
    production,
    initialExecutionState: input.policy.initialProductionOrderExecutionState,
  };
};
