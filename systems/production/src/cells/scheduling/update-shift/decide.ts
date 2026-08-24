import {
  updateShiftAlreadyStarted,
  updateShiftClosed,
  updateShiftCurrentPlanStateInvalid,
  updateShiftNotFound,
  updateShiftVersionConflict,
  updateShiftWindowInvalid,
} from './failures.ts';
import type {
  ProductionShift,
  UpdateShiftChangedField,
  UpdateShiftCommand,
  UpdateShiftCurrentSchedule,
  UpdateShiftEligibilityDecision,
  UpdateShiftPolicy,
  UpdateShiftStateDecision,
  UpdateShiftSupersessionDecision,
  UpdateShiftValidationFailure,
} from './types.ts';

export const updateShiftOperationId = 'production.update-shift.v1' as const;

export const validateUpdateShiftWindow = (
  command: Pick<UpdateShiftCommand, 'endsAt' | 'startsAt'>,
): UpdateShiftValidationFailure | null =>
  Number.isFinite(Date.parse(command.startsAt)) &&
  Number.isFinite(Date.parse(command.endsAt)) &&
  Date.parse(command.endsAt) > Date.parse(command.startsAt)
    ? null
    : updateShiftWindowInvalid();

export const changedUpdateShiftFields = (
  current: ProductionShift,
  desired: Pick<
    UpdateShiftCommand,
    'effectiveFolderCount' | 'endsAt' | 'startsAt'
  >,
): readonly UpdateShiftChangedField[] => [
  ...(Date.parse(current.startsAt) === Date.parse(desired.startsAt)
    ? []
    : (['startsAt'] as const)),
  ...(Date.parse(current.endsAt) === Date.parse(desired.endsAt)
    ? []
    : (['endsAt'] as const)),
  ...(current.effectiveFolderCount === desired.effectiveFolderCount
    ? []
    : (['effectiveFolderCount'] as const)),
];

export const decideUpdateShiftState = (input: {
  command: UpdateShiftCommand;
  current: ProductionShift | null;
}): UpdateShiftStateDecision => {
  if (input.current === null)
    return { kind: 'reject', failure: updateShiftNotFound() };
  if (input.current.version !== input.command.expectedVersion)
    return { kind: 'reject', failure: updateShiftVersionConflict() };
  if (input.current.status === 'closed')
    return { kind: 'reject', failure: updateShiftClosed() };
  return { kind: 'ready', current: input.current };
};

export const decideUpdateShiftEligibility = (input: {
  command: UpdateShiftCommand;
  current: ProductionShift;
  productionRunExists: boolean;
}): UpdateShiftEligibilityDecision => {
  if (input.productionRunExists)
    return { kind: 'reject', failure: updateShiftAlreadyStarted() };
  return {
    kind: 'ready',
    changedFields: changedUpdateShiftFields(input.current, input.command),
  };
};

export const decideUpdateShiftSupersession = (input: {
  currentSchedule: UpdateShiftCurrentSchedule | null;
  policy: UpdateShiftPolicy;
}): UpdateShiftSupersessionDecision => {
  if (input.currentSchedule === null)
    return { kind: 'ready', supersession: null };

  const lifecycle = input.policy.evaluateScheduleRevisionTransition({
    state: input.currentSchedule.status,
    event: 'supersede',
  });
  if (
    lifecycle.tag === 'err' ||
    (lifecycle.value.from !== 'draft' && lifecycle.value.from !== 'accepted') ||
    lifecycle.value.state !== 'superseded'
  )
    return {
      kind: 'reject',
      failure: updateShiftCurrentPlanStateInvalid(),
    };

  return {
    kind: 'ready',
    supersession: {
      scheduleRunId: input.currentSchedule.scheduleRunId,
      lifecycle: lifecycle.value,
    },
  };
};
