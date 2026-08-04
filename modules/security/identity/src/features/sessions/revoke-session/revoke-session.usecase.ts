import type { Clock } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type { RevokeSessionStore, TokenHasher } from './revoke-session.port.ts';
import type {
  RevokeSessionCommand,
  RevokeSessionOutcome,
} from './revoke-session.model.ts';

type MakeRevokeSessionDeps = {
  store: RevokeSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
  securityEvents?: SecurityEventSink;
};

export type RevokeSession = (
  command: RevokeSessionCommand,
) => Promise<RevokeSessionOutcome>;

export const makeRevokeSession =
  (deps: MakeRevokeSessionDeps): RevokeSession =>
  async (command) => {
    const now = deps.clock.now();
    const revoked = await deps.store.revokeByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
      now,
    );

    if (revoked.identityId && revoked.sessionId) {
      await deps.store.recordAuditEvent({
        principalIdentityId: revoked.identityId,
        eventType: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: revoked.sessionId,
      });
      (deps.securityEvents ?? nullSecurityEventSink).emit({
        name: 'session.revoked',
        occurredAt: now.toISOString(),
        outcome: 'succeeded',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        principalId: revoked.identityId,
        sessionId: revoked.sessionId,
        resourceType: 'auth.session',
        resourceId: revoked.sessionId,
      });
    }

    return { revoked: true };
  };
