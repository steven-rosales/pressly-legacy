import type { Database } from '@pressly/db/client';
import { and, eq, gt, isNull } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { defineResultUnitOfWork } from '@pressly/db/unit-of-work';
import { result } from '@pressly/kernel';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import type { ConfirmMfaEnrollmentStore } from './confirm-mfa-enrollment.port.ts';

type EnrollmentTransitionFailure = Readonly<{ kind: 'rejected' }>;

const enrollmentTransitionRejected: EnrollmentTransitionFailure = Object.freeze(
  { kind: 'rejected' },
);

export const makeConfirmMfaEnrollmentStore = (
  db: Database,
): ConfirmMfaEnrollmentStore => {
  const unitOfWork = defineResultUnitOfWork(db, (transaction) => transaction);

  return {
    findCredential: async (identityId) =>
      runDatabaseOperation(async () => {
        const [credential] = await db
          .select()
          .from(auth.authMfaCredentials)
          .where(eq(auth.authMfaCredentials.identityId, identityId))
          .limit(1);
        return credential;
      }),

    confirmEnrollment: async (input) =>
      runDatabaseOperation(async () => {
        const confirmed = await unitOfWork.transaction(async (tx) => {
          const [credential] = await tx
            .update(auth.authMfaCredentials)
            .set({
              status: 'enabled',
              lastUsedCounter: input.counter,
              enabledAt: input.now,
              updatedAt: input.now,
            })
            .where(
              and(
                eq(auth.authMfaCredentials.identityId, input.identityId),
                eq(auth.authMfaCredentials.status, 'pending'),
              ),
            )
            .returning({ id: auth.authMfaCredentials.id });
          if (credential === undefined)
            return result.err(enrollmentTransitionRejected);

          const [session] = await tx
            .update(auth.authSessions)
            .set({ assuranceLevel: 'mfa', lastUsedAt: input.now })
            .where(
              and(
                eq(auth.authSessions.id, input.sessionId),
                eq(auth.authSessions.identityId, input.identityId),
                isNull(auth.authSessions.revokedAt),
                gt(auth.authSessions.expiresAt, input.now),
              ),
            )
            .returning({ id: auth.authSessions.id });
          if (session === undefined)
            return result.err(enrollmentTransitionRejected);

          await tx
            .delete(auth.authMfaRecoveryCodes)
            .where(eq(auth.authMfaRecoveryCodes.identityId, input.identityId));
          await tx.insert(auth.authMfaRecoveryCodes).values(
            input.recoveryCodeHashes.map((codeHash) => ({
              identityId: input.identityId,
              codeHash,
            })),
          );
          await tx.insert(auth.authAuditEvents).values({
            principalIdentityId: input.identityId,
            eventType: 'auth.mfa.enrolled',
            resourceType: 'auth_identity',
            resourceId: input.identityId,
          });

          return result.ok(undefined);
        });

        return result.isOk(confirmed);
      }),
  };
};
