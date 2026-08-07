import type { Database, DatabaseTransaction } from '@pressly/db/client';
import { and, eq, isNull, ne } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { UnitOfWork } from '@pressly/kernel';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import type { RemoveMfaStore } from './remove-mfa.port.ts';

export const makeRemoveMfaStore = (
  db: Database,
  unitOfWork: UnitOfWork<DatabaseTransaction> = defineUnitOfWork(
    db,
    (transaction) => transaction,
  ),
): RemoveMfaStore => ({
  removeMfa: async (input) =>
    runDatabaseOperation(async () => {
      await unitOfWork.transaction(async (tx) => {
        await tx
          .delete(auth.authMfaRecoveryCodes)
          .where(eq(auth.authMfaRecoveryCodes.identityId, input.identityId));
        await tx
          .delete(auth.authMfaChallenges)
          .where(eq(auth.authMfaChallenges.identityId, input.identityId));
        await tx
          .delete(auth.authMfaCredentials)
          .where(eq(auth.authMfaCredentials.identityId, input.identityId));
        await tx
          .update(auth.authSessions)
          .set({ revokedAt: input.now })
          .where(
            and(
              eq(auth.authSessions.identityId, input.identityId),
              ne(auth.authSessions.id, input.sessionId),
              isNull(auth.authSessions.revokedAt),
            ),
          );
        await tx
          .update(auth.authSessions)
          .set({ assuranceLevel: 'password', lastUsedAt: input.now })
          .where(
            and(
              eq(auth.authSessions.id, input.sessionId),
              eq(auth.authSessions.identityId, input.identityId),
            ),
          );
        await tx.insert(auth.authAuditEvents).values({
          principalIdentityId: input.identityId,
          eventType: 'auth.mfa.removed',
          resourceType: 'auth_identity',
          resourceId: input.identityId,
          metadata: { otherSessionsRevoked: true },
        });
      });
    }),
});
