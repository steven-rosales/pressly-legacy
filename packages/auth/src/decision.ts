import type { Actor } from './actor.ts';

export type AuthDenyReason =
  | 'unauthenticated'
  | 'inactive_identity'
  | 'missing_role'
  | 'missing_permission'
  | 'stale_session'
  | 'missing_context'
  | 'invalid_session';

export type AuthDecision =
  | Readonly<{ ok: true; actor: Actor }>
  | Readonly<{
      ok: false;
      reason: AuthDenyReason;
      safeMessage: string;
      details?: unknown;
    }>;

export const allowDecision = (actor: Actor): AuthDecision => ({
  ok: true,
  actor,
});

export const denyDecision = (
  reason: AuthDenyReason,
  safeMessage: string,
  details?: unknown,
): AuthDecision => ({
  ok: false,
  reason,
  safeMessage,
  ...(details === undefined ? {} : { details }),
});
