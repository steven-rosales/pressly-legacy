import type { Database } from '@pressly/db/client';
import { desc, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import type { ListIdentitySessionsStore } from './list-identity-sessions.port.ts';

export const makeListIdentitySessionsStore = (
  db: Database,
): ListIdentitySessionsStore => ({
  listIdentitySessions: async (identityId) =>
    runDatabaseOperation(() =>
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
});
