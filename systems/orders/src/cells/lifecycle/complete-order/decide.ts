import { isAuditedOrderCommandValid } from '../../../model/canonical-order/policy.ts';
import type {
  CompleteOrderCommand,
  CompleteOrderExpectedFailure,
} from './types.ts';

export const completeOrderFailure = Object.freeze({
  invalid: (): CompleteOrderExpectedFailure => ({
    kind: 'validation',
    code: 'order_lifecycle_command_invalid',
    message: 'The order lifecycle command is incomplete.',
  }),
  notFound: (): CompleteOrderExpectedFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The order was not found.',
  }),
  versionConflict: (): CompleteOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_version_conflict',
    message:
      'The order changed after this lifecycle command was prepared. Refresh and try again.',
  }),
  invalidTransition: (): CompleteOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_transition_invalid',
    message:
      'The requested lifecycle command is not allowed from the current order state.',
  }),
  idempotencyConflict: (): CompleteOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});

export const validateCompleteOrder = (
  command: CompleteOrderCommand,
): CompleteOrderExpectedFailure | null =>
  !isAuditedOrderCommandValid(command, [
    'service_completed',
    'manager_correction',
  ]) ||
  command.locationId.trim() === '' ||
  command.orderId.trim() === '' ||
  command.expectedVersion < 1
    ? completeOrderFailure.invalid()
    : null;
