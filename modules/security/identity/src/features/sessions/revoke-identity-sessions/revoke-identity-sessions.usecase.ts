import type { Clock } from '@pressly/time';
import type { IdentitySessionStore } from '../../../foundations/ports/identity-session-store/identity-session-store.port.ts';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type {
  RevokeIdentitySessionsCommand,
  RevokeIdentitySessionsOutcome,
} from './revoke-identity-sessions.model.ts';

export type RevokeIdentitySessions = (
  command: RevokeIdentitySessionsCommand,
) => Promise<RevokeIdentitySessionsOutcome>;

export const makeRevokeIdentitySessions =
  (input: {
    store: IdentitySessionStore;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): RevokeIdentitySessions =>
  async (command) => {
    const now = input.clock.now();
    const revoked = await input.store.revokeIdentitySessions({
      ...command,
      revokedAt: now,
    });
    (input.securityEvents ?? nullSecurityEventSink).emit({
      name:
        command.sessionId === undefined
          ? 'session.revoked_all'
          : 'session.revoked',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(command.requestId === undefined
        ? {}
        : { requestId: command.requestId }),
      principalId: command.principalIdentityId,
      ...(command.sessionId === undefined
        ? {}
        : { sessionId: command.sessionId }),
      action: 'auth:session:revoke',
      resourceType: 'auth.identity',
      resourceId: command.identityId,
      reason: `revoked_count:${revoked}`,
    });

    return { revokedCount: revoked };
  };
