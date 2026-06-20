import { result, type Result } from '@pressly/kernel';
import { isSessionExpired, isSessionRevoked } from '@pressly/auth';
import type { LoadSessionCommand, LoadSessionResult } from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import { expiredSession, invalidSession } from './load-session.error.ts';
import type {
  Clock,
  LoadSessionStore,
  TokenHasher,
} from './load-session.port.ts';

type MakeLoadSessionDeps = {
  store: LoadSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
};

export type LoadSession = (
  command: LoadSessionCommand,
) => Promise<Result<LoadSessionResult, AppError>>;

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

    const touched = await deps.store.touchSession(found.value.sessionId, now);

    if (result.isErr(touched)) return touched;

    return result.ok({
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
