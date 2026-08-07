import { type Database, type DatabaseTransaction } from '@pressly/db/client';
import { and, eq, gt, isNull, lt, lte, ne, or, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { defineResultUnitOfWork } from '@pressly/db/unit-of-work';
import { result, type Result, type ResultUnitOfWork } from '@pressly/kernel';
import type {
  CompletedMfaSession,
  CompleteMfaChallengeStore,
  MfaCompletionResult,
} from './complete-mfa-challenge.port.ts';
import { mapStoredRoles } from '../../../foundations/adapters/postgres/role-read/stored-roles.persistence.mapper.ts';
import { runDatabaseOperation } from '../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';

type MfaTransitionFailure = Readonly<{ kind: 'rejected' }>;
const mfaTransitionRejected: MfaTransitionFailure = Object.freeze({
  kind: 'rejected',
});

const makeCompleteTransaction = (
  db: Database,
  providedUnitOfWork?: ResultUnitOfWork<DatabaseTransaction>,
) => {
  const unitOfWork =
    providedUnitOfWork ??
    defineResultUnitOfWork(db, (transaction) => transaction);

  return (
    work: (
      transaction: DatabaseTransaction,
    ) => Promise<Result<CompletedMfaSession, MfaTransitionFailure>>,
  ): Promise<MfaCompletionResult> =>
    runDatabaseOperation(async () => {
      const outcome = await unitOfWork.transaction(work);
      return result.isErr(outcome)
        ? ({ status: 'rejected' } as const)
        : outcome.value;
    });
};

export const makeCompleteMfaChallengeStore = (
  db: Database,
  unitOfWork?: ResultUnitOfWork<DatabaseTransaction>,
): CompleteMfaChallengeStore => {
  const completeTransaction = makeCompleteTransaction(db, unitOfWork);

  return {
    findChallengeByTokenHash: async (tokenHash) =>
      runDatabaseOperation(async () => {
        const [row] = await db
          .select({
            challenge: auth.authMfaChallenges,
            credential: auth.authMfaCredentials,
            identity: auth.authIdentities,
          })
          .from(auth.authMfaChallenges)
          .innerJoin(
            auth.authMfaCredentials,
            eq(
              auth.authMfaChallenges.identityId,
              auth.authMfaCredentials.identityId,
            ),
          )
          .innerJoin(
            auth.authIdentities,
            eq(auth.authMfaChallenges.identityId, auth.authIdentities.id),
          )
          .where(eq(auth.authMfaChallenges.tokenHash, tokenHash))
          .limit(1);

        if (row === undefined || row.credential.status !== 'enabled')
          return undefined;

        const [workforceRoles, compatibilityRoles] = await Promise.all([
          db
            .select({ role: auth.authAccessGrants.role })
            .from(auth.authAccessGrants)
            .innerJoin(
              auth.workforceMemberships,
              and(
                eq(
                  auth.workforceMemberships.id,
                  auth.authAccessGrants.membershipId,
                ),
                eq(
                  auth.workforceMemberships.businessId,
                  auth.authAccessGrants.businessId,
                ),
                eq(
                  auth.workforceMemberships.identityId,
                  auth.authAccessGrants.identityId,
                ),
              ),
            )
            .where(
              and(
                eq(auth.authAccessGrants.identityId, row.identity.id),
                eq(auth.authAccessGrants.state, 'active'),
                eq(auth.workforceMemberships.state, 'active'),
                or(
                  isNull(auth.authAccessGrants.startsAt),
                  lte(auth.authAccessGrants.startsAt, sql`now()`),
                ),
                or(
                  isNull(auth.authAccessGrants.endsAt),
                  gt(auth.authAccessGrants.endsAt, sql`now()`),
                ),
              ),
            ),
          db
            .select({ role: auth.authRoleAssignments.role })
            .from(auth.authRoleAssignments)
            .where(
              and(
                eq(auth.authRoleAssignments.identityId, row.identity.id),
                ne(auth.authRoleAssignments.role, 'owner'),
                ne(auth.authRoleAssignments.role, 'manager'),
                ne(auth.authRoleAssignments.role, 'operator'),
              ),
            ),
        ]);

        return {
          challengeId: row.challenge.id,
          identityId: row.identity.id,
          kind: row.identity.kind === 'service' ? 'service' : 'human',
          displayName: row.identity.displayName,
          ...(row.identity.email === null ? {} : { email: row.identity.email }),
          isActive: row.identity.isActive,
          roles: mapStoredRoles([...workforceRoles, ...compatibilityRoles]),
          encryptedSecret: row.credential.encryptedSecret,
          lastUsedCounter: row.credential.lastUsedCounter,
          expiresAt: row.challenge.expiresAt,
          consumedAt: row.challenge.consumedAt,
        };
      }),

    completeTotpChallenge: async (input) =>
      completeTransaction(async (tx) => {
        const [challenge] = await tx
          .update(auth.authMfaChallenges)
          .set({ consumedAt: input.issuedAt })
          .where(
            and(
              eq(auth.authMfaChallenges.id, input.challengeId),
              eq(auth.authMfaChallenges.identityId, input.identityId),
              isNull(auth.authMfaChallenges.consumedAt),
              gt(auth.authMfaChallenges.expiresAt, input.issuedAt),
            ),
          )
          .returning({ id: auth.authMfaChallenges.id });
        if (challenge === undefined) return result.err(mfaTransitionRejected);

        const [credential] = await tx
          .update(auth.authMfaCredentials)
          .set({ lastUsedCounter: input.counter, updatedAt: input.issuedAt })
          .where(
            and(
              eq(auth.authMfaCredentials.identityId, input.identityId),
              eq(auth.authMfaCredentials.status, 'enabled'),
              or(
                isNull(auth.authMfaCredentials.lastUsedCounter),
                lt(auth.authMfaCredentials.lastUsedCounter, input.counter),
              ),
            ),
          )
          .returning({ id: auth.authMfaCredentials.id });
        if (credential === undefined) return result.err(mfaTransitionRejected);

        await tx.insert(auth.authSessions).values({
          identityId: input.identityId,
          tokenHash: input.sessionTokenHash,
          assuranceLevel: 'mfa',
          issuedAt: input.issuedAt,
          lastUsedAt: input.issuedAt,
          expiresAt: input.expiresAt,
        });
        await tx.insert(auth.authAuditEvents).values({
          principalIdentityId: input.identityId,
          eventType: 'auth.mfa.challenge_completed',
          resourceType: 'auth_identity',
          resourceId: input.identityId,
          metadata: { method: 'totp' },
        });

        return result.ok({
          status: 'completed' as const,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
        });
      }),

    completeRecoveryChallenge: async (input) =>
      completeTransaction(async (tx) => {
        const [challenge] = await tx
          .update(auth.authMfaChallenges)
          .set({ consumedAt: input.issuedAt })
          .where(
            and(
              eq(auth.authMfaChallenges.id, input.challengeId),
              eq(auth.authMfaChallenges.identityId, input.identityId),
              isNull(auth.authMfaChallenges.consumedAt),
              gt(auth.authMfaChallenges.expiresAt, input.issuedAt),
            ),
          )
          .returning({ id: auth.authMfaChallenges.id });
        if (challenge === undefined) return result.err(mfaTransitionRejected);

        const [recoveryCode] = await tx
          .update(auth.authMfaRecoveryCodes)
          .set({ usedAt: input.issuedAt })
          .where(
            and(
              eq(auth.authMfaRecoveryCodes.identityId, input.identityId),
              eq(auth.authMfaRecoveryCodes.codeHash, input.recoveryCodeHash),
              isNull(auth.authMfaRecoveryCodes.usedAt),
            ),
          )
          .returning({ id: auth.authMfaRecoveryCodes.id });
        if (recoveryCode === undefined)
          return result.err(mfaTransitionRejected);

        await tx
          .update(auth.authSessions)
          .set({ revokedAt: input.issuedAt })
          .where(
            and(
              eq(auth.authSessions.identityId, input.identityId),
              isNull(auth.authSessions.revokedAt),
            ),
          );
        await tx
          .delete(auth.authMfaRecoveryCodes)
          .where(eq(auth.authMfaRecoveryCodes.identityId, input.identityId));
        await tx
          .delete(auth.authMfaChallenges)
          .where(eq(auth.authMfaChallenges.identityId, input.identityId));
        await tx
          .delete(auth.authMfaCredentials)
          .where(eq(auth.authMfaCredentials.identityId, input.identityId));
        await tx.insert(auth.authSessions).values({
          identityId: input.identityId,
          tokenHash: input.sessionTokenHash,
          assuranceLevel: 'password',
          issuedAt: input.issuedAt,
          lastUsedAt: input.issuedAt,
          expiresAt: input.expiresAt,
        });
        await tx.insert(auth.authAuditEvents).values({
          principalIdentityId: input.identityId,
          eventType: 'auth.mfa.recovery_used',
          resourceType: 'auth_identity',
          resourceId: input.identityId,
          metadata: { sessionsRevoked: true, mfaReset: true },
        });

        return result.ok({
          status: 'completed' as const,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
        });
      }),
  };
};
