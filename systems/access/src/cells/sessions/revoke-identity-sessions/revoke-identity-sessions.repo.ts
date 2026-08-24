import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq, gt, isNull } from '@pressly/postgres/query';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { RevokeIdentitySessionsStore } from './revoke-identity-sessions.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeRevokeIdentitySessionsStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): RevokeIdentitySessionsStore => ({
  revokeIdentitySessions: async (input) =>
    runDatabaseOperation(() =>
      db.transaction(async (tx) => {
        const selectedSession =
          input.sessionId === undefined
            ? undefined
            : eq(auth.authSessions.id, input.sessionId);
        const revoked = await tx
          .update(auth.authSessions)
          .set({ revokedAt: input.revokedAt })
          .where(
            and(
              eq(auth.authSessions.identityId, input.identityId),
              isNull(auth.authSessions.revokedAt),
              gt(auth.authSessions.expiresAt, input.revokedAt),
              selectedSession,
            ),
          )
          .returning({ id: auth.authSessions.id });

        await tx.insert(auth.authAuditEvents).values({
          principalIdentityId: input.principalIdentityId,
          eventType:
            input.sessionId === undefined
              ? 'auth.sessions.revoked_all'
              : 'auth.session.revoked',
          resourceType: 'auth_identity',
          resourceId: input.identityId,
          metadata: {
            revokedCount: revoked.length,
            ...(input.sessionId === undefined
              ? {}
              : { sessionId: input.sessionId }),
          },
        });

        return revoked.length;
      }),
    ),
});
