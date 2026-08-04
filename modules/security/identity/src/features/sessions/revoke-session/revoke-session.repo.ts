import { type Database } from '@pressly/db/client';
import { and, eq, gt, isNull } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import type { RevokeSessionStore } from './revoke-session.port.ts';
import { recordAuthAuditEvent } from '../../../foundations/adapters/postgres/identity-store/auth-audit.repo.ts';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/identity-store/database-result.adapter.ts';

export const makeRevokeSessionStore = (db: Database): RevokeSessionStore => ({
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

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
