import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofDatabase,
  accessPostgresProofNow,
  insertAccessPostgresIdentity,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { makeBeginMfaEnrollmentStore } from './begin-mfa-enrollment.repo.ts';
import { beginMfaEnrollmentCellDeclaration } from './cell.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.begin-mfa-enrollment.v1',
  declaration: beginMfaEnrollmentCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'converges concurrent pending enrollment and preserves enabled credentials',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'declared-concurrency-race',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'begin-mfa@pressly.test',
        );
        const store = makeBeginMfaEnrollmentStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        await expect(
          Promise.all([
            store.beginEnrollment({
              identityId: identity.id,
              encryptedSecret: 'encrypted-one',
              now: accessPostgresProofNow,
            }),
            store.beginEnrollment({
              identityId: identity.id,
              encryptedSecret: 'encrypted-two',
              now: accessPostgresProofNow,
            }),
          ]),
        ).resolves.toEqual(['pending', 'pending']);
        const [credential] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaCredentials);
        expect(credential).toMatchObject({
          identityId: identity.id,
          status: 'pending',
        });
        expect(['encrypted-one', 'encrypted-two']).toContain(
          credential?.encryptedSecret,
        );

        await accessPostgresProofDatabase.db
          .update(accessPostgresProofSchema.authMfaCredentials)
          .set({ status: 'enabled', enabledAt: accessPostgresProofNow })
          .where(
            eq(
              accessPostgresProofSchema.authMfaCredentials.identityId,
              identity.id,
            ),
          );
        await expect(
          store.beginEnrollment({
            identityId: identity.id,
            encryptedSecret: 'must-not-replace',
            now: accessPostgresProofNow,
          }),
        ).resolves.toBe('already_enabled');
        const [enabled] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaCredentials);
        expect(enabled?.encryptedSecret).not.toBe('must-not-replace');
      },
    },
    {
      name: 'leaves no credential when an unknown identity fails before persistence',
      proves: ['unexpected-failure-no-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const store = makeBeginMfaEnrollmentStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.beginEnrollment({
            identityId: '87000000-0000-4000-8000-000000000099',
            encryptedSecret: 'must-not-persist',
            now: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaCredentials),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
