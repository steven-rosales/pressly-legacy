import type {
  ReplaceShiftSelectionIdempotencyConflictFailure,
  ReplaceShiftSelectionNotFoundFailure,
  ReplaceShiftSelectionNotReadyFailure,
  ReplaceShiftSelectionPlanStateFailure,
  ReplaceShiftSelectionScheduleVersionFailure,
  ReplaceShiftSelectionStartedFailure,
  ReplaceShiftSelectionVersionFailure,
} from './types.ts';

export const replaceShiftSelectionIdempotencyConflict =
  (): ReplaceShiftSelectionIdempotencyConflictFailure => ({
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });

export const replaceShiftSelectionNotFound =
  (): ReplaceShiftSelectionNotFoundFailure => ({
    kind: 'not_found',
    code: 'production_shift_not_found',
    message: 'The production shift was not found.',
    safeMessage: 'The production shift was not found.',
  });

export const replaceShiftSelectionAlreadyStarted =
  (): ReplaceShiftSelectionStartedFailure => ({
    kind: 'conflict',
    code: 'production_shift_already_started',
    message: 'The order selection is frozen because production has started.',
    safeMessage:
      'The order selection is frozen because production has started.',
  });

export const replaceShiftSelectionVersionConflict =
  (): ReplaceShiftSelectionVersionFailure => ({
    kind: 'conflict',
    code: 'production_shift_selection_version_conflict',
    message:
      'The shift selection changed. Refresh it before choosing orders again.',
    safeMessage:
      'The shift selection changed. Refresh it before choosing orders again.',
  });

export const replaceShiftSelectionNotReady =
  (): ReplaceShiftSelectionNotReadyFailure => ({
    kind: 'conflict',
    code: 'production_shift_selection_not_ready',
    message:
      'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
    safeMessage:
      'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
  });

export const replaceShiftSelectionPlanStateInvalid =
  (): ReplaceShiftSelectionPlanStateFailure => ({
    kind: 'conflict',
    code: 'schedule_current_plan_state_invalid',
    message: 'The current schedule revision cannot be superseded.',
    safeMessage: 'The current schedule revision cannot be superseded.',
  });

export const replaceShiftSelectionScheduleVersionConflict =
  (): ReplaceShiftSelectionScheduleVersionFailure => ({
    kind: 'conflict',
    code: 'production_shift_selection_schedule_version_conflict',
    message: 'Current schedule revision changed unexpectedly.',
    safeMessage: 'Production state changed. Refresh and try again.',
  });
