import {
  and,
  auth,
  eq,
  gt,
  isNull,
  lt,
  ne,
  or,
  type Database,
} from '@pressly/db';
import { result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  MfaCompletionResult,
  MfaStore,
} from '../../../features/mfa/mfa.port.ts';
import { mapStoredRoles } from '../../common/roles.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../../common/database-result.ts';

class MfaTransitionRejected extends Error {}

const completeTransaction = async (
  run: () => Promise<MfaCompletionResult>,
): Promise<Result<MfaCompletionResult, AppError>> => {
  try {
    return result.ok(await run());
  } catch (error) {
    if (error instanceof MfaTransitionRejected)
      return result.ok({ status: 'rejected' } as const);
    return result.err(databaseFailure(error));
  }
};

export const makeMfaStore = (db: Database): MfaStore => ({
  findChallengeByTokenHash: async (tokenHash) =>
    toDatabaseResult(async () => {
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

      const roles = await db
        .select({ role: auth.authRoleAssignments.role })
        .from(auth.authRoleAssignments)
        .where(eq(auth.authRoleAssignments.identityId, row.identity.id));

      return {
        challengeId: row.challenge.id,
        identityId: row.identity.id,
        kind: row.identity.kind === 'service' ? 'service' : 'human',
        displayName: row.identity.displayName,
        ...(row.identity.email === null ? {} : { email: row.identity.email }),
        isActive: row.identity.isActive,
        roles: mapStoredRoles(roles),
        encryptedSecret: row.credential.encryptedSecret,
        lastUsedCounter: row.credential.lastUsedCounter,
        expiresAt: row.challenge.expiresAt,
        consumedAt: row.challenge.consumedAt,
      };
    }),

  completeTotpChallenge: async (input) =>
    completeTransaction(() =>
      db.transaction(async (tx) => {
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
        if (challenge === undefined) throw new MfaTransitionRejected();

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
        if (credential === undefined) throw new MfaTransitionRejected();

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

        return {
          status: 'completed' as const,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
        };
      }),
    ),

  completeRecoveryChallenge: async (input) =>
    completeTransaction(() =>
      db.transaction(async (tx) => {
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
        if (challenge === undefined) throw new MfaTransitionRejected();

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
        if (recoveryCode === undefined) throw new MfaTransitionRejected();

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

        return {
          status: 'completed' as const,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
        };
      }),
    ),

  beginEnrollment: async (input) =>
    toDatabaseResult(async () => {
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
    toDatabaseResult(async () => {
      const [credential] = await db
        .select()
        .from(auth.authMfaCredentials)
        .where(eq(auth.authMfaCredentials.identityId, identityId))
        .limit(1);
      return credential;
    }),

  confirmEnrollment: async (input) =>
    completeTransaction(() =>
      db.transaction(async (tx) => {
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
        if (credential === undefined) throw new MfaTransitionRejected();

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
        if (session === undefined) throw new MfaTransitionRejected();

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

        return {
          status: 'completed' as const,
          issuedAt: input.now,
          expiresAt: input.now,
        };
      }),
    ).then((completion) =>
      result.isErr(completion)
        ? completion
        : result.ok(completion.value.status === 'completed'),
    ),

  replaceRecoveryCodes: async (input) =>
    toDatabaseResult(async () => {
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
        if (credential === undefined) throw new MfaTransitionRejected();

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
    toDatabaseResult(async () => {
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
});
