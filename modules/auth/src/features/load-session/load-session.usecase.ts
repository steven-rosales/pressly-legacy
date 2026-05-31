import {
  isSessionExpired,
  isSessionRevoked,
  type Principal,
} from '@pressly/auth';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import { expiredSession, invalidSession } from './load-session.error.ts';
import type {
  Clock,
  LoadSessionStore,
  TokenHasher,
} from './load-session.port.ts';

export type LoadSessionCommand = Readonly<{ bearerToken: string }>;

type MakeLoadSessionDeps = {
  store: LoadSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
};

export type LoadSession = (
  command: LoadSessionCommand,
) => Promise<Result<Principal, AppError>>;

/**
 * Loads session by finding the token hash.
 * @returns {Principal} The Principal object that has roles, email, the kind (e.g., human | service), identityId, sessionId, and timestamps.
 */
export const makeLoadSession =
  (deps: MakeLoadSessionDeps): LoadSession =>
  async (command) => {
    const now = deps.clock.now();
    const found = await deps.store.findByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
    );

    if (!found.ok) return found;
    if (found.value === undefined) return err(invalidSession());
    if (!found.value.isActive) return err(invalidSession());
    if (isSessionRevoked(found.value)) return err(invalidSession());
    if (isSessionExpired(found.value, now)) return err(expiredSession());

    const touched = await deps.store.touchSession(found.value.sessionId, now);

    if (!touched.ok) return touched;

    return ok({
      identityId: found.value.identityId,
      kind: found.value.kind,
      displayName: found.value.displayName,
      ...(found.value.email === undefined ? {} : { email: found.value.email }),
      roles: [...found.value.roles],
      sessionId: found.value.sessionId,
      sessionIssuedAt: found.value.issuedAt,
      sessionExpiresAt: found.value.expiresAt,
    });
  };
