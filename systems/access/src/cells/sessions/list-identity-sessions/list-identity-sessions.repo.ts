import type { PostgresDatabase } from '@pressly/postgres/client';
import { desc, eq } from '@pressly/postgres/query';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { ListIdentitySessionsStore } from './list-identity-sessions.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeListIdentitySessionsStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
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
