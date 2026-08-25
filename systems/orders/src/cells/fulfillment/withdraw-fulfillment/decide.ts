import { isAuditedOrderCommandValid } from '../../../model/canonical-order/policy.ts';
import type {
  WithdrawFulfillmentCommand,
  WithdrawFulfillmentExpectedFailure,
} from './types.ts';

export const withdrawFulfillmentFailure = Object.freeze({
  invalid: (): WithdrawFulfillmentExpectedFailure => ({
    kind: 'validation',
    code: 'fulfillment_release_command_invalid',
    message: 'The fulfillment release command is incomplete.',
  }),
  notFound: (): WithdrawFulfillmentExpectedFailure => ({
    kind: 'not_found',
    code: 'fulfillment_not_found',
    message: 'The fulfillment was not found.',
  }),
  versionConflict: (): WithdrawFulfillmentExpectedFailure => ({
    kind: 'conflict',
    code: 'fulfillment_version_conflict',
    message:
      'The Order or fulfillment changed after this request was prepared. Refresh and try again.',
  }),
  invalidTransition: (): WithdrawFulfillmentExpectedFailure => ({
    kind: 'conflict',
    code: 'fulfillment_transition_invalid',
    message:
      'The requested fulfillment command is not allowed from the current release state.',
  }),
  idempotencyConflict: (): WithdrawFulfillmentExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});

export const validateWithdrawFulfillment = (
  command: WithdrawFulfillmentCommand,
): WithdrawFulfillmentExpectedFailure | null =>
  !isAuditedOrderCommandValid(command, [
    'commercial_canceled',
    'production_hold',
    'manager_override',
  ]) ||
  command.fulfillmentId.trim() === '' ||
  command.locationId.trim() === '' ||
  command.expectedOrderVersion < 1 ||
  command.expectedFulfillmentVersion < 1
    ? withdrawFulfillmentFailure.invalid()
    : null;
