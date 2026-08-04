import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, gt, isNull, lt, lte, ne, or, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { defineResultUnitOfWork } from '@pressly/db/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type {
  CompletedMfaSession,
  CompleteMfaChallengeStore,
  MfaCompletionResult,
} from '../../../ports/mfa-store/mfa-challenge-store.port.ts';
import type { MfaEnrollmentStore } from '../../../ports/mfa-store/mfa-enrollment-store.port.ts';
import type { MfaManagementStore } from '../../../ports/mfa-store/mfa-management-store.port.ts';
import { mapStoredRoles } from '../identity-store/stored-roles.persistence.mapper.ts';
import { runDatabaseOperation } from '../identity-store/database-result.adapter.ts';

type MfaTransitionFailure = Readonly<{ kind: 'rejected' }>;
const mfaTransitionRejected: MfaTransitionFailure = Object.freeze({
  kind: 'rejected',
});

const makeCompleteTransaction = (db: Database) => {
  const unitOfWork = defineResultUnitOfWork(db, (transaction) => transaction);

  return (
    work: (
      transaction: DatabaseExecutor,
    ) => Promise<Result<CompletedMfaSession, MfaTransitionFailure>>,
  ): Promise<MfaCompletionResult> =>
    runDatabaseOperation(async () => {
      const outcome = await unitOfWork.transaction(work);
      return result.isErr(outcome)
        ? ({ status: 'rejected' } as const)
        : outcome.value;
    });
};

type MfaRepository = CompleteMfaChallengeStore &
  MfaEnrollmentStore &
  MfaManagementStore;

export const makeMfaStore = (db: Database): MfaRepository => {
  const completeTransaction = makeCompleteTransaction(db);

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

    beginEnrollment: async (input) =>
      runDatabaseOperation(async () => {
        const [existing] = await db
          .select({ status: auth.authMfaCredentials.status })
          .from(auth.authMfaCredentials)
          .where(eq(auth.authMfaCredentials.identityId, input.identityId))
          .limit(1);
        if (existing?.status === 'enabled') return 'already_enabled' as const;

        await db
          .insert(auth.authMfaCredentials)
          .values({
            identityId: input.identityId,
            encryptedSecret: input.encryptedSecret,
            status: 'pending',
            updatedAt: input.now,
          })
          .onConflictDoUpdate({
            target: auth.authMfaCredentials.identityId,
            set: {
              encryptedSecret: input.encryptedSecret,
              status: 'pending',
              lastUsedCounter: null,
              enabledAt: null,
              updatedAt: input.now,
            },
          });
        return 'pending' as const;
      }),

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
      completeTransaction(async (tx) => {
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
        if (credential === undefined) return result.err(mfaTransitionRejected);

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
        if (session === undefined) return result.err(mfaTransitionRejected);

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

        return result.ok({
          status: 'completed' as const,
          issuedAt: input.now,
          expiresAt: input.now,
        });
      }).then((completion) => completion.status === 'completed'),

    replaceRecoveryCodes: async (input) =>
      runDatabaseOperation(async () => {
        await db.transaction(async (tx) => {
          const [credential] = await tx
            .select({ id: auth.authMfaCredentials.id })
            .from(auth.authMfaCredentials)
            .where(
              and(
                eq(auth.authMfaCredentials.identityId, input.identityId),
                eq(auth.authMfaCredentials.status, 'enabled'),
              ),
            )
            .limit(1);
          if (credential === undefined)
            throw invariantViolationError({
              code: 'mfa_recovery_codes_identity_not_enabled',
              message:
                'MFA recovery codes cannot be replaced without an enabled credential.',
            });

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
            eventType: 'auth.mfa.recovery_codes_regenerated',
            resourceType: 'auth_identity',
            resourceId: input.identityId,
          });
        });
      }),

    removeMfa: async (input) =>
      runDatabaseOperation(async () => {
        await db.transaction(async (tx) => {
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
  };
};
