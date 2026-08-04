export type UpdateUserFailure =
  | Readonly<{ kind: 'validation'; code: 'user_update_invalid' }>
  | Readonly<{ kind: 'not_found'; code: 'user_not_found' }>
  | Readonly<{ kind: 'conflict'; code: 'user_version_conflict' }>
  | Readonly<{ kind: 'conflict'; code: 'user_idempotency_conflict' }>;

export const updateUserFailure = Object.freeze({
  invalidCommand: (): UpdateUserFailure => ({
    kind: 'validation',
    code: 'user_update_invalid',
  }),
  notFound: (): UpdateUserFailure => ({
    kind: 'not_found',
    code: 'user_not_found',
  }),
  versionConflict: (): UpdateUserFailure => ({
    kind: 'conflict',
    code: 'user_version_conflict',
  }),
  idempotencyConflict: (): UpdateUserFailure => ({
    kind: 'conflict',
    code: 'user_idempotency_conflict',
  }),
});
