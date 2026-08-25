import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofDatabase,
  accessPostgresProofFuture,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresIdentity,
  requireAccessPostgresFixture,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { completeMfaChallengeCellDeclaration } from './cell.ts';
import { makeCompleteMfaChallengeStore } from './complete-mfa-challenge.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.complete-mfa-challenge.v1',
  declaration: completeMfaChallengeCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'consumes one challenge once under concurrent replay and rolls back a late session conflict',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'unexpected-failure-rollback',
        'same-payload-replay',
        'same-key-concurrency',
        'declared-concurrency-race',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'complete-mfa@pressly.test',
        );
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaCredentials)
          .values({
            identityId: identity.id,
            encryptedSecret: 'encrypted-secret',
            status: 'enabled',
            enabledAt: accessPostgresProofNow,
            createdAt: accessPostgresProofNow,
            updatedAt: accessPostgresProofNow,
          });
        const [challenge] = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaChallenges)
          .values({
            identityId: identity.id,
            tokenHash: accessPostgresProofHash('m'),
            expiresAt: accessPostgresProofFuture,
            createdAt: accessPostgresProofNow,
          })
          .returning();
        const challengeId = requireAccessPostgresFixture(
          challenge,
          'mfa_challenge',
        ).id;
        const store = makeCompleteMfaChallengeStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const outcomes = await Promise.all([
          store.completeTotpChallenge({
            challengeId,
            identityId: identity.id,
            counter: 201,
            sessionTokenHash: accessPostgresProofHash('6'),
            issuedAt: accessPostgresProofNow,
            expiresAt: accessPostgresProofFuture,
          }),
          store.completeTotpChallenge({
            challengeId,
            identityId: identity.id,
            counter: 201,
            sessionTokenHash: accessPostgresProofHash('7'),
            issuedAt: accessPostgresProofNow,
            expiresAt: accessPostgresProofFuture,
          }),
        ]);
        expect(
          outcomes.filter(({ status }) => status === 'completed'),
        ).toHaveLength(1);
        expect(
          outcomes.filter(({ status }) => status === 'rejected'),
        ).toHaveLength(1);
        const [storedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents)
            .where(
              eq(
                accessPostgresProofSchema.authAuditEvents.eventType,
                'auth.mfa.challenge_completed',
              ),
            ),
        ).resolves.toHaveLength(1);

        const [secondChallenge] = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaChallenges)
          .values({
            identityId: identity.id,
            tokenHash: accessPostgresProofHash('x'),
            expiresAt: accessPostgresProofFuture,
            createdAt: accessPostgresProofNow,
          })
          .returning();
        const secondChallengeId = requireAccessPostgresFixture(
          secondChallenge,
          'second_mfa_challenge',
        ).id;
        await expect(
          store.completeTotpChallenge({
            challengeId: secondChallengeId,
            identityId: identity.id,
            counter: 202,
            sessionTokenHash: requireAccessPostgresFixture(
              storedSession,
              'completed_session',
            ).tokenHash,
            issuedAt: accessPostgresProofNow,
            expiresAt: accessPostgresProofFuture,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const [rolledBackChallenge] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaChallenges)
          .where(
            eq(
              accessPostgresProofSchema.authMfaChallenges.id,
              secondChallengeId,
            ),
          );
        expect(rolledBackChallenge?.consumedAt).toBeNull();
        const [credential] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaCredentials);
        expect(credential?.lastUsedCounter).toBe(201);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authSessions),
        ).resolves.toHaveLength(1);
      },
    },
  ],
});

proveOperation({
  operationId: 'access.complete-mfa-challenge.v1',
  declaration: completeMfaChallengeCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'atomically reserves a bounded number of challenge attempts and durably consumes the exhausted challenge',
      proves: [
        'postgres-commit',
        'same-key-concurrency',
        'declared-concurrency-race',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'bounded-mfa-attempts@pressly.test',
        );
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaCredentials)
          .values({
            identityId: identity.id,
            encryptedSecret: 'encrypted-secret',
            status: 'enabled',
            enabledAt: accessPostgresProofNow,
            createdAt: accessPostgresProofNow,
            updatedAt: accessPostgresProofNow,
          });
        const [challenge] = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaChallenges)
          .values({
            identityId: identity.id,
            tokenHash: accessPostgresProofHash('bounded'),
            expiresAt: accessPostgresProofFuture,
            createdAt: accessPostgresProofNow,
          })
          .returning();
        const challengeId = requireAccessPostgresFixture(
          challenge,
          'bounded_mfa_challenge',
        ).id;
        const store = makeCompleteMfaChallengeStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        const outcomes = await Promise.all(
          Array.from({ length: 5 }, () =>
            store.reserveChallengeAttempt({
              tokenHash: accessPostgresProofHash('bounded'),
              now: accessPostgresProofNow,
              maxAttempts: 2,
            }),
          ),
        );

        expect(
          outcomes.filter(({ status }) => status === 'reserved'),
        ).toHaveLength(2);
        expect(
          outcomes.filter(({ status }) => status === 'exhausted'),
        ).toHaveLength(1);
        expect(
          outcomes.filter(({ status }) => status === 'invalid'),
        ).toHaveLength(2);
        const attempts = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authAuditEvents)
          .where(
            eq(
              accessPostgresProofSchema.authAuditEvents.eventType,
              'auth.mfa.challenge_attempted',
            ),
          );
        expect(attempts).toHaveLength(2);
        const [storedChallenge] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaChallenges)
          .where(
            eq(accessPostgresProofSchema.authMfaChallenges.id, challengeId),
          );
        expect(storedChallenge?.consumedAt).toEqual(accessPostgresProofNow);

        const [failureBoundedChallenge] = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaChallenges)
          .values({
            identityId: identity.id,
            tokenHash: accessPostgresProofHash('failure-bounded'),
            expiresAt: accessPostgresProofFuture,
            createdAt: accessPostgresProofNow,
          })
          .returning();
        const failureBoundedChallengeId = requireAccessPostgresFixture(
          failureBoundedChallenge,
          'failure_bounded_mfa_challenge',
        ).id;
        for (const attempt of [1, 2]) {
          await expect(
            store.reserveChallengeAttempt({
              tokenHash: accessPostgresProofHash('failure-bounded'),
              now: accessPostgresProofNow,
              maxAttempts: 2,
            }),
          ).resolves.toMatchObject({ status: 'reserved' });
          await store.rejectReservedChallengeAttempt({
            challengeId: failureBoundedChallengeId,
            identityId: identity.id,
            now: accessPostgresProofNow,
            maxAttempts: 2,
          });
          const [afterFailure] = await accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaChallenges)
            .where(
              eq(
                accessPostgresProofSchema.authMfaChallenges.id,
                failureBoundedChallengeId,
              ),
            );
          expect(afterFailure?.consumedAt).toEqual(
            attempt === 1 ? null : accessPostgresProofNow,
          );
        }
        await expect(
          store.reserveChallengeAttempt({
            tokenHash: accessPostgresProofHash('failure-bounded'),
            now: accessPostgresProofNow,
            maxAttempts: 2,
          }),
        ).resolves.toEqual({ status: 'invalid' });
      },
    },
  ],
});
