export type AuthDenyReason =
  | 'unauthenticated'
  | 'inactive_identity'
  | 'missing_assignment'
  | 'missing_permission'
  | 'missing_context'
  | 'stale_session'
  | 'invalid_session'
  | 'policy_denied';

export type AuthDecision =
  | Readonly<{ tag: 'allowed'; policyId: string }>
  | Readonly<{
      tag: 'denied';
      reason: AuthDenyReason;
      safeMessage: string;
      policyId?: string;
      details?: unknown;
    }>;

export const allowDecision = (policyId: string): AuthDecision => ({
  tag: 'allowed',
  policyId,
});

export const denyDecision = (input: {
  reason: AuthDenyReason;
  safeMessage: string;
  policyId?: string;
  details?: unknown;
}): AuthDecision => ({
  tag: 'denied',
  reason: input.reason,
  safeMessage: input.safeMessage,
  ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
  ...(input.details === undefined ? {} : { details: input.details }),
});

export const isAllowed = (
  decision: AuthDecision,
): decision is Extract<AuthDecision, { tag: 'allowed' }> =>
  decision.tag === 'allowed';

export const isDenied = (
  decision: AuthDecision,
): decision is Extract<AuthDecision, { tag: 'denied' }> =>
  decision.tag === 'denied';
