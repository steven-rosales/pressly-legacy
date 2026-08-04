export type CorrectOrderFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_correction_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found' | 'order_customer_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'order_version_conflict'
        | 'order_location_move_requires_command'
        | 'fulfillment_commitment_conflict'
        | 'order_idempotency_conflict';
      message: string;
    }>;

export const correctOrderFailure = Object.freeze({
  invalid: (): CorrectOrderFailure => ({
    kind: 'validation',
    code: 'order_correction_invalid',
    message: 'The order correction is incomplete.',
  }),
  notFound: (): CorrectOrderFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The order was not found.',
  }),
  customerNotFound: (): CorrectOrderFailure => ({
    kind: 'not_found',
    code: 'order_customer_not_found',
    message: 'The selected customer was not found.',
  }),
  versionConflict: (): CorrectOrderFailure => ({
    kind: 'conflict',
    code: 'order_version_conflict',
    message:
      'The Order or fulfillment changed after this correction was prepared. Refresh and try again.',
  }),
  locationMove: (): CorrectOrderFailure => ({
    kind: 'conflict',
    code: 'order_location_move_requires_command',
    message:
      'Moving an Order to another location requires a dedicated cross-location command.',
  }),
  fulfillmentCommitment: (): CorrectOrderFailure => ({
    kind: 'conflict',
    code: 'fulfillment_commitment_conflict',
    message: 'A released fulfillment cannot change its type or location.',
  }),
  idempotencyConflict: (): CorrectOrderFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});
