export type ResolveCanonicalSourceUserFailure =
  | Readonly<{
      kind: 'conflict';
      code: 'canonical_source_user_business_conflict';
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'user_idempotency_conflict';
    }>;

export const resolveCanonicalSourceUserFailure = Object.freeze({
  businessConflict: (): ResolveCanonicalSourceUserFailure => ({
    kind: 'conflict',
    code: 'canonical_source_user_business_conflict',
  }),
  idempotencyConflict: (): ResolveCanonicalSourceUserFailure => ({
    kind: 'conflict',
    code: 'user_idempotency_conflict',
  }),
});
