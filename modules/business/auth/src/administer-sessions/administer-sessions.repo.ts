import { and, auth, desc, eq, gt, isNull, type Database } from '@pressly/db';
import type { AdministerSessionsStore } from './administer-sessions.port.ts';
import { toDatabaseResult } from '../persistence/database-result.ts';

export const makeAdministerSessionsStore = (
  db: Database,
): AdministerSessionsStore => ({
  listIdentitySessions: async (identityId) =>
    toDatabaseResult(async () =>
      db
        .select({
          id: auth.authSessions.id,
          issuedAt: auth.authSessions.issuedAt,
          lastUsedAt: auth.authSessions.lastUsedAt,
          expiresAt: auth.authSessions.expiresAt,
          revokedAt: auth.authSessions.revokedAt,
        })
        .from(auth.authSessions)
        .where(eq(auth.authSessions.identityId, identityId))
        .orderBy(desc(auth.authSessions.issuedAt)),
    ),

  revokeIdentitySessions: async (input) =>
    toDatabaseResult(async () =>
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
