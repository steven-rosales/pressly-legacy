import { isAuditedOrderCommandValid } from '../../../model/canonical-order/policy.ts';
import type {
  CancelOrderCommand,
  CancelOrderExpectedFailure,
} from './types.ts';

export const cancelOrderFailure = Object.freeze({
  invalid: (): CancelOrderExpectedFailure => ({
    kind: 'validation',
    code: 'order_lifecycle_command_invalid',
    message: 'The order lifecycle command is incomplete.',
  }),
  notFound: (): CancelOrderExpectedFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The order was not found.',
  }),
  versionConflict: (): CancelOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_version_conflict',
    message:
      'The order changed after this lifecycle command was prepared. Refresh and try again.',
  }),
  invalidTransition: (): CancelOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_transition_invalid',
    message:
      'The requested lifecycle command is not allowed from the current order state.',
  }),
  idempotencyConflict: (): CancelOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});

export const validateCancelOrder = (
  command: CancelOrderCommand,
): CancelOrderExpectedFailure | null =>
  !isAuditedOrderCommandValid(command, [
    'customer_canceled',
    'duplicate_order',
    'created_in_error',
    'manager_correction',
  ]) ||
  command.locationId.trim() === '' ||
  command.orderId.trim() === '' ||
  command.expectedVersion < 1
    ? cancelOrderFailure.invalid()
    : null;
