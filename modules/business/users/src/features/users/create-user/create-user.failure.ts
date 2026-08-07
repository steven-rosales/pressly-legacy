export type CreateUserFailure =
  | Readonly<{
      kind: 'validation';
      code: 'user_idempotency_key_required';
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'user_idempotency_conflict';
    }>;

export const createUserFailure = Object.freeze({
  invalidCommand: (): CreateUserFailure => ({
    kind: 'validation',
    code: 'user_idempotency_key_required',
  }),
  idempotencyConflict: (): CreateUserFailure => ({
    kind: 'conflict',
    code: 'user_idempotency_conflict',
  }),
});
