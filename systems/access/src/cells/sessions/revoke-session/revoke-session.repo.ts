import { type PostgresDatabase } from '@pressly/postgres/client';
import { and, eq, gt, isNull } from '@pressly/postgres/query';
import type { RevokeSessionStore } from './revoke-session.port.ts';
import { recordAuthAuditEvent } from '../../../postgres/auth-audit/auth-audit.repo.ts';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeRevokeSessionStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): RevokeSessionStore => ({
  revokeByTokenHash: async (tokenHash, revokedAt) =>
    runDatabaseOperation(async () => {
      const [session] = await db
        .update(auth.authSessions)
        .set({ revokedAt })
        .where(
          and(
            eq(auth.authSessions.tokenHash, tokenHash),
            isNull(auth.authSessions.revokedAt),
            gt(auth.authSessions.expiresAt, revokedAt),
          ),
        )
        .returning({
          sessionId: auth.authSessions.id,
          identityId: auth.authSessions.identityId,
        });

      if (session === undefined) return {};

      return session;
    }),

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, auth, input),
});
