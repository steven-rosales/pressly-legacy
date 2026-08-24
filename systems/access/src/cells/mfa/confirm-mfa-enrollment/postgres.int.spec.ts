import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresIdentity,
  insertAccessPostgresSession,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { confirmMfaEnrollmentCellDeclaration } from './cell.ts';
import { makeConfirmMfaEnrollmentStore } from './confirm-mfa-enrollment.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.confirm-mfa-enrollment.v1',
  declaration: confirmMfaEnrollmentCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits one concurrent pending-to-enabled transition with codes and audit',
      proves: [
        'postgres-commit',
        'same-key-concurrency',
        'declared-concurrency-race',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'confirm-mfa@pressly.test',
        );
        const session = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('c'),
        );
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaCredentials)
          .values({
            identityId: identity.id,
            encryptedSecret: 'encrypted-secret',
            status: 'pending',
            createdAt: accessPostgresProofNow,
            updatedAt: accessPostgresProofNow,
          });
        const store = makeConfirmMfaEnrollmentStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const outcomes = await Promise.all([
          store.confirmEnrollment({
            identityId: identity.id,
            sessionId: session.id,
            counter: 101,
            recoveryCodeHashes: [
              accessPostgresProofHash('1'),
              accessPostgresProofHash('2'),
            ],
            now: accessPostgresProofNow,
          }),
          store.confirmEnrollment({
            identityId: identity.id,
            sessionId: session.id,
            counter: 102,
            recoveryCodeHashes: [
              accessPostgresProofHash('3'),
              accessPostgresProofHash('4'),
            ],
            now: accessPostgresProofNow,
          }),
        ]);
        expect(outcomes.sort()).toEqual([false, true]);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaRecoveryCodes),
        ).resolves.toHaveLength(2);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(1);
        const [storedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(storedSession?.assuranceLevel).toBe('mfa');
      },
    },

    {
      name: 'rolls back credential enablement for an invalid session and a late recovery-code conflict',
      proves: [
        'expected-rejection-no-partial-write',
        'unexpected-failure-rollback',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'confirm-rollback@pressly.test',
        );
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaCredentials)
          .values({
            identityId: identity.id,
            encryptedSecret: 'encrypted-secret',
            status: 'pending',
            createdAt: accessPostgresProofNow,
            updatedAt: accessPostgresProofNow,
          });
        const store = makeConfirmMfaEnrollmentStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        await expect(
          store.confirmEnrollment({
            identityId: identity.id,
            sessionId: '87000000-0000-4000-8000-000000000099',
            counter: 103,
            recoveryCodeHashes: [accessPostgresProofHash('5')],
            now: accessPostgresProofNow,
          }),
        ).resolves.toBe(false);

        const session = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('5'),
        );
        await expect(
          store.confirmEnrollment({
            identityId: identity.id,
            sessionId: session.id,
            counter: 104,
            recoveryCodeHashes: [
              accessPostgresProofHash('6'),
              accessPostgresProofHash('6'),
            ],
            now: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const [credential] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaCredentials);
        expect(credential).toMatchObject({
          status: 'pending',
          lastUsedCounter: null,
        });
        const [storedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(storedSession?.assuranceLevel).toBe('password');
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaRecoveryCodes),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
