import { type Database } from '@pressly/db/client';
import { and, desc, eq, gt, isNull } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import type { IdentitySessionStore } from '../../../ports/identity-session-store/identity-session-store.port.ts';
import { runDatabaseOperation } from '../identity-store/database-result.adapter.ts';

export const makeIdentitySessionStore = (
  db: Database,
): IdentitySessionStore => ({
  listIdentitySessions: async (identityId) =>
    runDatabaseOperation(async () =>
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
    runDatabaseOperation(async () =>
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
