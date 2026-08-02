import { result, type Result } from '@pressly/kernel';
import {
  isSessionExpired,
  isSessionIdleExpired,
  isSessionRevoked,
  type Principal,
} from '@pressly/auth/authentication';
import {
  principalAttributesFromSession,
  type PrincipalAttributes,
} from '@pressly/auth/authorization';
import { authError, type AppError } from '@pressly/errors';
import type {
  Clock,
  LoadSessionStore,
  TokenHasher,
} from './load-session.port.ts';

export type LoadedSession = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

type MakeLoadSessionDeps = {
  store: LoadSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
  idleTimeoutMinutes: number;
};

export type LoadSession = (
  command: Readonly<{ bearerToken: string }>,
) => Promise<Result<LoadedSession, AppError>>;

const invalidSession = (): AppError =>
  authError({
    code: 'invalid_session',
    message: 'Session is invalid.',
    safeMessage: 'Authentication is required.',
  });

const expiredSession = (): AppError =>
  authError({
    code: 'session_expired',
    message: 'Session is expired.',
    safeMessage: 'Please log in again.',
  });

/**
 * Loads session by finding the token hash.
 * @returns The loaded principal with session timestamps.
 */
export const makeLoadSession =
  (deps: MakeLoadSessionDeps): LoadSession =>
  async (command) => {
    const now = deps.clock.now();
    const found = await deps.store.findByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
    );

    if (result.isErr(found)) return found;
    if (found.value === undefined) return result.err(invalidSession());
    if (!found.value.isActive) return result.err(invalidSession());
    if (isSessionRevoked(found.value)) return result.err(invalidSession());
    if (isSessionExpired(found.value, now)) return result.err(expiredSession());
    if (isSessionIdleExpired(found.value, now, deps.idleTimeoutMinutes))
      return result.err(expiredSession());

    const touched = await deps.store.touchSession(found.value.sessionId, now);
    if (result.isErr(touched)) return touched;

    const principal: Principal = {
      identityId: found.value.identityId,
      kind: found.value.kind,
      displayName: found.value.displayName,
      ...(found.value.email === undefined ? {} : { email: found.value.email }),
      sessionId: found.value.sessionId,
      sessionIssuedAt: found.value.issuedAt,
      sessionExpiresAt: found.value.expiresAt,
    };

    return result.ok({
      principal,
      principalAttributes: principalAttributesFromSession({
        assignments: found.value.assignments,
        identityActive: found.value.isActive,
        assuranceLevel: found.value.assuranceLevel,
      }),
    });
  };
