import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { and, eq, isNull, ne } from '@pressly/postgres/query';
import { defineUnitOfWork } from '@pressly/postgres/unit-of-work';
import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { RemoveMfaStore } from './remove-mfa.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeRemoveMfaStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
  unitOfWork: UnitOfWork<PostgresTransaction> = defineUnitOfWork(
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
