import { isAuditedOrderCommandValid } from '../../../model/canonical-order/policy.ts';
import type {
  ReleaseFulfillmentCommand,
  ReleaseFulfillmentExpectedFailure,
} from './types.ts';

export const releaseFulfillmentFailure = Object.freeze({
  invalid: (): ReleaseFulfillmentExpectedFailure => ({
    kind: 'validation',
    code: 'fulfillment_release_command_invalid',
    message: 'The fulfillment release command is incomplete.',
  }),
  notFound: (): ReleaseFulfillmentExpectedFailure => ({
    kind: 'not_found',
    code: 'fulfillment_not_found',
    message: 'The fulfillment was not found.',
  }),
  versionConflict: (): ReleaseFulfillmentExpectedFailure => ({
    kind: 'conflict',
    code: 'fulfillment_version_conflict',
    message:
      'The Order or fulfillment changed after this request was prepared. Refresh and try again.',
  }),
  invalidTransition: (): ReleaseFulfillmentExpectedFailure => ({
    kind: 'conflict',
    code: 'fulfillment_transition_invalid',
    message:
      'The requested fulfillment command is not allowed from the current release state.',
  }),
  idempotencyConflict: (): ReleaseFulfillmentExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});

export const validateReleaseFulfillment = (
  command: ReleaseFulfillmentCommand,
): ReleaseFulfillmentExpectedFailure | null =>
  !isAuditedOrderCommandValid(command, [
    'ready_for_production',
    'manager_override',
  ]) ||
  command.fulfillmentId.trim() === '' ||
  command.locationId.trim() === '' ||
  command.expectedOrderVersion < 1 ||
  command.expectedFulfillmentVersion < 1
    ? releaseFulfillmentFailure.invalid()
    : null;
