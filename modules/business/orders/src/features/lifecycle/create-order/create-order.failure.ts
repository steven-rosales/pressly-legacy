export type CreateOrderFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_create_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_reference_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'order_idempotency_conflict';
      message: string;
    }>;

export const createOrderFailure = Object.freeze({
  invalid: (): CreateOrderFailure => ({
    kind: 'validation',
    code: 'order_create_invalid',
    message: 'The order is incomplete.',
  }),
  referenceNotFound: (): CreateOrderFailure => ({
    kind: 'not_found',
    code: 'order_reference_not_found',
    message: 'The selected customer or fulfillment location was not found.',
  }),
  idempotencyConflict: (): CreateOrderFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});
