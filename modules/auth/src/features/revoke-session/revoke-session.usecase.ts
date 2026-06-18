import type { LogoutResult, RevokeSessionCommand } from '@pressly/contracts';
import { ok, type AppError, type Result } from '@pressly/errors';
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

    if (!revoked.ok) return revoked;

    if (revoked.value.identityId && revoked.value.sessionId) {
      await deps.store.recordAuditEvent({
        actorIdentityId: revoked.value.identityId,
        eventType: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: revoked.value.sessionId,
      });
    }

    return ok({ revoked: true });
  };
