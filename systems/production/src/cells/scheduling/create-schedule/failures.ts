import type { CreateScheduleExpectedFailure } from './types.ts';

const failure = (
  kind: 'conflict' | 'not_found',
  code: CreateScheduleExpectedFailure['code'],
  message: string,
  safeMessage = message,
): CreateScheduleExpectedFailure =>
  ({ kind, code, message, safeMessage }) as CreateScheduleExpectedFailure;
export const idempotencyConflict = () =>
  failure(
    'conflict',
    'production_idempotency_conflict',
    'The idempotency key belongs to a different production command.',
  );
export const shiftNotFound = () =>
  failure(
    'not_found',
    'production_shift_not_found',
    'The production shift was not found.',
  );
export const shiftAlreadyStarted = () =>
  failure(
    'conflict',
    'production_shift_already_started',
    'A production run already exists for this shift.',
  );
export const schedulingInputNotFound = () =>
  failure(
    'not_found',
    'scheduling_input_not_found',
    'The shift or scheduler configuration was not found.',
  );
export const selectionEmpty = () =>
  failure(
    'conflict',
    'schedule_selection_empty',
    'Select at least one ready order before computing the schedule.',
  );
export const selectionNotReady = () =>
  failure(
    'conflict',
    'schedule_selection_not_ready',
    'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
  );
export const planningWindowFailure = (code: string, message: string) =>
  failure(
    'conflict',
    code.toLowerCase() as
      | 'production_shift_window_invalid'
      | 'production_shift_expired',
    message,
  );
export const currentPlanInvalid = () =>
  failure(
    'conflict',
    'schedule_current_plan_state_invalid',
    'The current schedule revision cannot be superseded.',
  );
export const scheduleRevisionConflict = () =>
  failure(
    'conflict',
    'production_schedule_revision_version_conflict',
    'Current schedule revision changed unexpectedly.',
    'Production state changed. Refresh and try again.',
  );

const codes = new Set<CreateScheduleExpectedFailure['code']>([
  'production_idempotency_conflict',
  'production_shift_already_started',
  'schedule_selection_empty',
  'schedule_selection_not_ready',
  'production_shift_window_invalid',
  'production_shift_expired',
  'schedule_current_plan_state_invalid',
  'production_schedule_revision_version_conflict',
  'production_shift_not_found',
  'scheduling_input_not_found',
]);
export const isCreateScheduleExpectedFailure = (
  value: unknown,
): value is CreateScheduleExpectedFailure => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v['kind'] === 'conflict' || v['kind'] === 'not_found') &&
    typeof v['code'] === 'string' &&
    codes.has(v['code'] as CreateScheduleExpectedFailure['code']) &&
    typeof v['message'] === 'string' &&
    typeof v['safeMessage'] === 'string'
  );
};
