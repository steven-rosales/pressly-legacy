import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import {
  isSessionExpired,
  isSessionIdleExpired,
  isSessionRevoked,
  type Principal,
} from '../../../model/authentication/public.ts';
import { principalAttributesFromSession } from '../../../model/authorization/public.ts';
import type { Clock } from '@pressly/time';
import type { LoadSessionStore, TokenHasher } from './load-session.port.ts';
import type { LoadedSession } from './load-session.model.ts';
import {
  loadSessionFailure,
  type LoadSessionFailure,
} from './load-session.failure.ts';

type MakeLoadSessionDeps = {
  store: LoadSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
  idleTimeoutMinutes: number;
};

export type LoadSession = (
  command: Readonly<{ bearerToken: string }>,
) => Promise<Result<LoadedSession, LoadSessionFailure>>;

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

    if (found === undefined) return result.err(loadSessionFailure.invalid());
    if (!found.isActive) return result.err(loadSessionFailure.invalid());
    if (isSessionRevoked(found))
      return result.err(loadSessionFailure.invalid());
    if (isSessionExpired(found, now))
      return result.err(loadSessionFailure.expired());
    if (isSessionIdleExpired(found, now, deps.idleTimeoutMinutes))
      return result.err(loadSessionFailure.expired());

    await deps.store.touchSession(found.sessionId, now);

    const principal: Principal = {
      identityId: found.identityId,
      kind: found.kind,
      displayName: found.displayName,
      ...(found.email === undefined ? {} : { email: found.email }),
      ...(found.customerId === undefined
        ? {}
        : { audience: 'customer', customerId: found.customerId }),
      sessionId: found.sessionId,
      sessionIssuedAt: found.issuedAt,
      sessionExpiresAt: found.expiresAt,
    };

    return result.ok({
      principal,
      principalAttributes: principalAttributesFromSession({
        assignments: found.assignments,
        identityActive: found.isActive,
        assuranceLevel: found.assuranceLevel,
      }),
    });
  };
