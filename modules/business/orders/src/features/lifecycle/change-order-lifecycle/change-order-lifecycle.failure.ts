export type ChangeOrderLifecycleFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_lifecycle_command_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'order_version_conflict'
        | 'order_transition_invalid'
        | 'order_idempotency_conflict';
      message: string;
    }>;

export const changeOrderLifecycleFailure = Object.freeze({
  invalid: (): ChangeOrderLifecycleFailure => ({
    kind: 'validation',
    code: 'order_lifecycle_command_invalid',
    message: 'The order lifecycle command is incomplete.',
  }),
  notFound: (): ChangeOrderLifecycleFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The order was not found.',
  }),
  versionConflict: (): ChangeOrderLifecycleFailure => ({
    kind: 'conflict',
    code: 'order_version_conflict',
    message:
      'The order changed after this lifecycle command was prepared. Refresh and try again.',
  }),
  invalidTransition: (): ChangeOrderLifecycleFailure => ({
    kind: 'conflict',
    code: 'order_transition_invalid',
    message:
      'The requested lifecycle command is not allowed from the current order state.',
  }),
  idempotencyConflict: (): ChangeOrderLifecycleFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});
