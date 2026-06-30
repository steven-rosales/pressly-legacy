import type { RevokeIdentitySessionsResult } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import type {
  AdministerSessionsStore,
  Clock,
} from './administer-sessions.port.ts';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';

export type RevokeIdentitySessions = (command: {
  principalIdentityId: string;
  identityId: string;
  sessionId?: string;
  requestId?: string;
}) => Promise<Result<RevokeIdentitySessionsResult, AppError>>;

export const makeRevokeIdentitySessions =
  (input: {
    store: AdministerSessionsStore;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): RevokeIdentitySessions =>
  async (command) => {
    const now = input.clock.now();
    const revoked = await input.store.revokeIdentitySessions({
      ...command,
      revokedAt: now,
    });
    if (result.isErr(revoked)) return revoked;

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
      reason: `revoked_count:${revoked.value}`,
    });

    return result.ok({ revokedCount: revoked.value });
  };
