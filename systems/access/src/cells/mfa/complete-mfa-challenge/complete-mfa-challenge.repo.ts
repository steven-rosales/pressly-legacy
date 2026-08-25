import {
  type PostgresDatabase,
  type PostgresTransaction,
} from '@pressly/postgres/client';
import {
  and,
  count,
  eq,
  gt,
  isNull,
  lt,
  lte,
  or,
} from '@pressly/postgres/query';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { ResultUnitOfWork } from '@pressly/cells/unit-of-work';
import type {
  CompletedMfaSession,
  CompleteMfaChallengeStore,
  MfaChallengeReservation,
  MfaCompletionResult,
} from './complete-mfa-challenge.port.ts';
import { customerAudience } from '../../../model/authentication/public.ts';
import { mapStoredWorkforceRoles } from '../../../postgres/workforce-role-read/workforce-roles.postgres.ts';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { AccessSchema } from '../../../schema/public.ts';

type MfaTransitionFailure = Readonly<{ kind: 'rejected' }>;
const mfaTransitionRejected: MfaTransitionFailure = Object.freeze({
  kind: 'rejected',
});

const makeCompleteTransaction = (
  db: PostgresDatabase,
  providedUnitOfWork?: ResultUnitOfWork<PostgresTransaction>,
) => {
  const unitOfWork =
    providedUnitOfWork ??
    defineResultUnitOfWork(db, (transaction) => transaction);

  return (
    work: (
      transaction: PostgresTransaction,
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
  db: PostgresDatabase,
  auth: AccessSchema,
  unitOfWork?: ResultUnitOfWork<PostgresTransaction>,
): CompleteMfaChallengeStore => {
  const transactional =
    unitOfWork ?? defineResultUnitOfWork(db, (transaction) => transaction);
  const completeTransaction = makeCompleteTransaction(db, transactional);

  const reserveChallengeAttempt = async (input: {
    tokenHash: string;
    now: Date;
    maxAttempts: number;
  }): Promise<MfaChallengeReservation> =>
    runDatabaseOperation(async () => {
      const outcome = await transactional.transaction<
        MfaChallengeReservation,
        never
      >(async (tx) => {
        const [row] = await tx
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
          .where(eq(auth.authMfaChallenges.tokenHash, input.tokenHash))
          .for('update')
          .limit(1);

        if (
          row === undefined ||
          row.credential.status !== 'enabled' ||
          row.challenge.consumedAt !== null ||
          !row.identity.isActive
        )
          return result.ok({ status: 'invalid' as const });

        if (row.challenge.expiresAt.getTime() <= input.now.getTime())
          return result.ok({ status: 'expired' as const });

        const [attempts] = await tx
          .select({ value: count() })
          .from(auth.authAuditEvents)
          .where(
            and(
              eq(
                auth.authAuditEvents.eventType,
                'auth.mfa.challenge_attempted',
              ),
              eq(auth.authAuditEvents.resourceType, 'auth_mfa_challenge'),
              eq(auth.authAuditEvents.resourceId, row.challenge.id),
            ),
          );
        const attemptCount = attempts?.value ?? 0;
        if (attemptCount >= input.maxAttempts) {
          await tx
            .update(auth.authMfaChallenges)
            .set({ consumedAt: input.now })
            .where(
              and(
                eq(auth.authMfaChallenges.id, row.challenge.id),
                isNull(auth.authMfaChallenges.consumedAt),
              ),
            );
          await tx.insert(auth.authAuditEvents).values({
            principalIdentityId: row.identity.id,
            eventType: 'auth.mfa.challenge_attempts_exhausted',
            resourceType: 'auth_mfa_challenge',
            resourceId: row.challenge.id,
            metadata: { maxAttempts: input.maxAttempts },
          });
          return result.ok({ status: 'exhausted' as const });
        }

        await tx.insert(auth.authAuditEvents).values({
          principalIdentityId: row.identity.id,
          eventType: 'auth.mfa.challenge_attempted',
          resourceType: 'auth_mfa_challenge',
          resourceId: row.challenge.id,
          metadata: { attemptNumber: attemptCount + 1 },
        });

        const workforceRoles = await tx
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
                lte(auth.authAccessGrants.startsAt, input.now),
              ),
              or(
                isNull(auth.authAccessGrants.endsAt),
                gt(auth.authAccessGrants.endsAt, input.now),
              ),
            ),
          );

        return result.ok({
          status: 'reserved' as const,
          challenge: {
            challengeId: row.challenge.id,
            identityId: row.identity.id,
            kind: row.identity.kind === 'service' ? 'service' : 'human',
            displayName: row.identity.displayName,
            ...(row.identity.email === null
              ? {}
              : { email: row.identity.email }),
            ...customerAudience(row.identity.customerId),
            isActive: row.identity.isActive,
            roles: mapStoredWorkforceRoles(workforceRoles),
            encryptedSecret: row.credential.encryptedSecret,
            lastUsedCounter: row.credential.lastUsedCounter,
            expiresAt: row.challenge.expiresAt,
          },
        });
      });
      if (result.isErr(outcome)) return outcome.error;
      return outcome.value;
    });

  const rejectReservedChallengeAttempt = async (input: {
    challengeId: string;
    identityId: string;
    now: Date;
    maxAttempts: number;
  }): Promise<void> =>
    runDatabaseOperation(async () => {
      const outcome = await transactional.transaction<void, never>(
        async (tx) => {
          const [challenge] = await tx
            .select({
              id: auth.authMfaChallenges.id,
              consumedAt: auth.authMfaChallenges.consumedAt,
            })
            .from(auth.authMfaChallenges)
            .where(
              and(
                eq(auth.authMfaChallenges.id, input.challengeId),
                eq(auth.authMfaChallenges.identityId, input.identityId),
              ),
            )
            .for('update')
            .limit(1);
          if (challenge === undefined || challenge.consumedAt !== null)
            return result.ok(undefined);

          const [attempts] = await tx
            .select({ value: count() })
            .from(auth.authAuditEvents)
            .where(
              and(
                eq(
                  auth.authAuditEvents.eventType,
                  'auth.mfa.challenge_attempted',
                ),
                eq(auth.authAuditEvents.resourceType, 'auth_mfa_challenge'),
                eq(auth.authAuditEvents.resourceId, challenge.id),
              ),
            );
          if ((attempts?.value ?? 0) < input.maxAttempts)
            return result.ok(undefined);

          await tx
            .update(auth.authMfaChallenges)
            .set({ consumedAt: input.now })
            .where(
              and(
                eq(auth.authMfaChallenges.id, challenge.id),
                isNull(auth.authMfaChallenges.consumedAt),
              ),
            );
          await tx.insert(auth.authAuditEvents).values({
            principalIdentityId: input.identityId,
            eventType: 'auth.mfa.challenge_attempts_exhausted',
            resourceType: 'auth_mfa_challenge',
            resourceId: challenge.id,
            metadata: { maxAttempts: input.maxAttempts },
          });
          return result.ok(undefined);
        },
      );
      if (result.isErr(outcome)) return outcome.error;
    });

  return {
    reserveChallengeAttempt,
    rejectReservedChallengeAttempt,

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
