import { and, auth, eq, gt, isNull, type Database } from '@pressly/db';
import type { RevokeSessionStore } from '../../../features/revoke-session/revoke-session.port.ts';
import { recordAuthAuditEvent } from '../../common/auth-audit.ts';
import { toDatabaseResult } from '../../common/database-result.ts';

export const makeRevokeSessionStore = (db: Database): RevokeSessionStore => ({
  revokeByTokenHash: async (tokenHash, revokedAt) =>
    toDatabaseResult(async () => {
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

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
