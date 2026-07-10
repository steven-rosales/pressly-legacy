import { result, type Result } from '@pressly/kernel';
import type { LogoutResult } from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type {
  Clock,
  RevokeSessionStore,
  TokenHasher,
} from './revoke-session.port.ts';

type MakeRevokeSessionDeps = {
  store: RevokeSessionStore;
  tokenHasher: TokenHasher;
  clock: Clock;
  securityEvents?: SecurityEventSink;
};

export type RevokeSessionCommand = Readonly<{
  bearerToken: string;
  requestId?: string;
}>;

export type RevokeSession = (
  command: RevokeSessionCommand,
) => Promise<Result<LogoutResult, AppError>>;

export const makeRevokeSession =
  (deps: MakeRevokeSessionDeps): RevokeSession =>
  async (command) => {
    const now = deps.clock.now();
    const revoked = await deps.store.revokeByTokenHash(
      deps.tokenHasher.hash(command.bearerToken),
      now,
    );

    if (result.isErr(revoked)) return revoked;

    if (revoked.value.identityId && revoked.value.sessionId) {
      await deps.store.recordAuditEvent({
        principalIdentityId: revoked.value.identityId,
        eventType: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: revoked.value.sessionId,
      });
      (deps.securityEvents ?? nullSecurityEventSink).emit({
        name: 'session.revoked',
        occurredAt: now.toISOString(),
        outcome: 'succeeded',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        principalId: revoked.value.identityId,
        sessionId: revoked.value.sessionId,
        resourceType: 'auth.session',
        resourceId: revoked.value.sessionId,
      });
    }

    return result.ok({ revoked: true });
  };
