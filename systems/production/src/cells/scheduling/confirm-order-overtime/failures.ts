import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmOrderOvertimeFailureCode,
} from './types.ts';

const expectedFailure = (
  kind: ConfirmOrderOvertimeExpectedFailure['kind'],
  code: ConfirmOrderOvertimeFailureCode,
  message: string,
  safeMessage = message,
): ConfirmOrderOvertimeExpectedFailure => ({
  kind,
  code,
  message,
  safeMessage,
});

export const confirmOrderOvertimeIdempotencyConflict =
  (): ConfirmOrderOvertimeExpectedFailure =>
    expectedFailure(
      'conflict',
      'production_idempotency_conflict',
      'The idempotency key belongs to a different production command.',
    );

export const confirmOrderOvertimeContextNotFound =
  (): ConfirmOrderOvertimeExpectedFailure =>
    expectedFailure(
      'not_found',
      'production_placement_context_not_found',
      'The production run or order was not found.',
    );

export const confirmOrderOvertimeLifecycleConflict = (
  code:
    | 'production_order_execution_event_not_allowed'
    | 'production_order_execution_state_invalid'
    | 'production_order_execution_transition_invalid',
  message: string,
): ConfirmOrderOvertimeExpectedFailure =>
  expectedFailure('conflict', code, message);

export const confirmOrderOvertimeConcurrencyConflict = (
  code:
    | 'production_placement_order_version_conflict'
    | 'production_placement_queue_version_conflict'
    | 'production_placement_stage_version_conflict',
  message: string,
): ConfirmOrderOvertimeExpectedFailure =>
  expectedFailure(
    'conflict',
    code,
    message,
    'Production state changed. Refresh and try again.',
  );

const codes = new Set<ConfirmOrderOvertimeFailureCode>([
  'production_idempotency_conflict',
  'production_order_execution_event_not_allowed',
  'production_order_execution_state_invalid',
  'production_order_execution_transition_invalid',
  'production_placement_context_not_found',
  'production_placement_order_version_conflict',
  'production_placement_queue_version_conflict',
  'production_placement_stage_version_conflict',
]);

export const isConfirmOrderOvertimeExpectedFailure = (
  value: unknown,
): value is ConfirmOrderOvertimeExpectedFailure => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const failure = value as Readonly<Record<string, unknown>>;
  return (
    (failure['kind'] === 'conflict' || failure['kind'] === 'not_found') &&
    typeof failure['code'] === 'string' &&
    codes.has(failure['code'] as ConfirmOrderOvertimeFailureCode) &&
    typeof failure['message'] === 'string' &&
    typeof failure['safeMessage'] === 'string'
  );
};
