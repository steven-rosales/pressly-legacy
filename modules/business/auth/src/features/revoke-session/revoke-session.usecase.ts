import { result, type Result } from '@pressly/kernel';
import type { LogoutResult, RevokeSessionCommand } from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import type {
  Clock,
  RevokeSessionStore,
  TokenHasher,
} from './revoke-session.port.ts';

type MakeRevokeSessionDeps = {
  store: RevokeSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
};

export type RevokeSession = (
  command: RevokeSessionCommand,
) => Promise<Result<LogoutResult, AppError>>;

export const makeRevokeSession =
  (deps: MakeRevokeSessionDeps): RevokeSession =>
  async (command) => {
    const revoked = await deps.store.revokeByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
      deps.clock.now(),
    );

    if (result.isErr(revoked)) return revoked;

    if (revoked.value.identityId && revoked.value.sessionId) {
      await deps.store.recordAuditEvent({
        actorIdentityId: revoked.value.identityId,
        eventType: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: revoked.value.sessionId,
      });
    }

    return result.ok({ revoked: true });
  };
