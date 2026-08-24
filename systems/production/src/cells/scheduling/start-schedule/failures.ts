import type { StartScheduleExpectedFailure } from './types.ts';

const failure = (
  kind: StartScheduleExpectedFailure['kind'],
  code: StartScheduleExpectedFailure['code'],
  message: string,
  safeMessage = message,
): StartScheduleExpectedFailure =>
  ({ kind, code, message, safeMessage }) as StartScheduleExpectedFailure;

export const idempotencyConflict = () =>
  failure(
    'conflict',
    'production_idempotency_conflict',
    'The idempotency key belongs to a different production command.',
  );

export const scheduleNotFound = () =>
  failure(
    'not_found',
    'schedule_not_found',
    'The accepted schedule was not found.',
  );

export const scheduleHashMismatch = () =>
  failure(
    'conflict',
    'schedule_hash_mismatch',
    'The accepted schedule hash does not match the Start command.',
  );

export const shiftNotFound = () =>
  failure(
    'not_found',
    'production_shift_not_found',
    'The production shift was not found.',
  );

export const policyConflict = (
  code: Exclude<
    StartScheduleConflictFailureCode,
    | 'production_idempotency_conflict'
    | 'schedule_hash_mismatch'
    | 'schedule_input_stale'
    | 'production_order_execution_transition_invalid'
    | 'production_schedule_start_order_version_conflict'
  >,
  message: string,
) => failure('conflict', code, message);

type StartScheduleConflictFailureCode = Extract<
  StartScheduleExpectedFailure,
  { kind: 'conflict' }
>['code'];

export const scheduleInputStale = () =>
  failure(
    'conflict',
    'schedule_input_stale',
    'The accepted schedule no longer matches its selected orders.',
  );

export const orderTransitionInvalid = () =>
  failure(
    'conflict',
    'production_order_execution_transition_invalid',
    'The production order cannot be committed by Start.',
  );

export const orderStateInvalid = () =>
  failure(
    'conflict',
    'production_order_execution_state_invalid',
    'The production order execution state is invalid.',
  );

export const orderVersionConflict = () =>
  failure(
    'conflict',
    'production_schedule_start_order_version_conflict',
    'Not every selected order was available at Start.',
    'Production state changed. Refresh and try again.',
  );

const codes = new Set<StartScheduleExpectedFailure['code']>([
  'production_idempotency_conflict',
  'schedule_not_found',
  'schedule_hash_mismatch',
  'production_shift_not_found',
  'production_shift_window_invalid',
  'production_shift_expired',
  'production_shift_not_started',
  'schedule_not_accepted',
  'schedule_not_current',
  'schedule_input_snapshot_stale',
  'production_run_already_exists',
  'schedule_has_no_batches',
  'schedule_input_stale',
  'production_order_execution_state_invalid',
  'production_order_execution_event_not_allowed',
  'production_order_execution_transition_invalid',
  'production_schedule_start_order_version_conflict',
]);

export const isStartScheduleExpectedFailure = (
  value: unknown,
): value is StartScheduleExpectedFailure => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate['kind'] === 'conflict' || candidate['kind'] === 'not_found') &&
    typeof candidate['code'] === 'string' &&
    codes.has(candidate['code'] as StartScheduleExpectedFailure['code']) &&
    typeof candidate['message'] === 'string' &&
    typeof candidate['safeMessage'] === 'string'
  );
};
