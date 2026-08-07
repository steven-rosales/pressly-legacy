export type FulfillmentReleaseFailure =
  | Readonly<{
      kind: 'validation';
      code: 'fulfillment_release_command_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'fulfillment_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'fulfillment_version_conflict'
        | 'fulfillment_transition_invalid'
        | 'order_idempotency_conflict';
      message: string;
    }>;

export const fulfillmentReleaseFailure = Object.freeze({
  invalid: (): FulfillmentReleaseFailure => ({
    kind: 'validation',
    code: 'fulfillment_release_command_invalid',
    message: 'The fulfillment release command is incomplete.',
  }),
  notFound: (): FulfillmentReleaseFailure => ({
    kind: 'not_found',
    code: 'fulfillment_not_found',
    message: 'The fulfillment was not found.',
  }),
  versionConflict: (): FulfillmentReleaseFailure => ({
    kind: 'conflict',
    code: 'fulfillment_version_conflict',
    message:
      'The Order or fulfillment changed after this request was prepared. Refresh and try again.',
  }),
  invalidTransition: (): FulfillmentReleaseFailure => ({
    kind: 'conflict',
    code: 'fulfillment_transition_invalid',
    message:
      'The requested fulfillment command is not allowed from the current release state.',
  }),
  idempotencyConflict: (): FulfillmentReleaseFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});
