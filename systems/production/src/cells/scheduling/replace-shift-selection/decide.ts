import {
  replaceShiftSelectionAlreadyStarted,
  replaceShiftSelectionNotFound,
  replaceShiftSelectionNotReady,
  replaceShiftSelectionPlanStateInvalid,
  replaceShiftSelectionVersionConflict,
} from './failures.ts';
import type {
  AvailableShiftSelection,
  LockedShiftSelection,
  ReplaceShiftSelectionPolicy,
  ShiftSelectionAccessDecision,
  ShiftSelectionChangeDecision,
} from './types.ts';

export const replaceShiftSelectionOperationId =
  'production.replace-shift-selection.v1' as const;

export const canonicalizeSelectedOrderIds = (
  values: readonly string[],
): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const sameSelection = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const decideShiftSelectionAccess = (input: {
  current: LockedShiftSelection;
  expectedVersion: number;
}): ShiftSelectionAccessDecision => {
  if (input.current.state === 'not_found')
    return { kind: 'reject', failure: replaceShiftSelectionNotFound() };
  if (input.current.state === 'run_exists')
    return {
      kind: 'reject',
      failure: replaceShiftSelectionAlreadyStarted(),
    };
  if (input.current.version !== input.expectedVersion)
    return {
      kind: 'reject',
      failure: replaceShiftSelectionVersionConflict(),
    };
  return { kind: 'inspect', current: input.current };
};

export const decideShiftSelectionChange = (input: {
  productionShiftId: string;
  current: AvailableShiftSelection;
  selectedOrderIds: readonly string[];
  selectedOrdersAreReady: boolean;
  policy: ReplaceShiftSelectionPolicy;
}): ShiftSelectionChangeDecision => {
  if (!input.selectedOrdersAreReady)
    return { kind: 'reject', failure: replaceShiftSelectionNotReady() };

  const currentOrderIds = canonicalizeSelectedOrderIds(
    input.current.selectedOrderIds,
  );
  if (sameSelection(currentOrderIds, input.selectedOrderIds))
    return {
      kind: 'no_change',
      result: {
        selection: {
          productionShiftId: input.productionShiftId,
          version: input.current.version,
          selectedOrderIds: [...input.selectedOrderIds],
        },
        supersededScheduleRunId: null,
        replayed: false,
      },
    };

  if (input.current.currentSchedule === null)
    return { kind: 'replace', supersede: null };

  const lifecycle = input.policy.evaluateScheduleRevisionTransition({
    state: input.current.currentSchedule.status,
    event: 'supersede',
  });
  if (
    lifecycle.tag === 'err' ||
    (lifecycle.value.from !== 'draft' && lifecycle.value.from !== 'accepted') ||
    lifecycle.value.state !== 'superseded'
  )
    return {
      kind: 'reject',
      failure: replaceShiftSelectionPlanStateInvalid(),
    };

  return {
    kind: 'replace',
    supersede: {
      scheduleRunId: input.current.currentSchedule.scheduleRunId,
      lifecycle: lifecycle.value,
    },
  };
};
