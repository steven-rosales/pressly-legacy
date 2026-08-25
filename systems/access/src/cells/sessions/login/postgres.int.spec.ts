import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofPassword,
  accessPostgresProofSystem,
  requireAccessPostgresSuccess,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { loginCellDeclaration } from './cell.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.login.v1',
  declaration: loginCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'records an expected credential denial without a session then commits login',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.bootstrapOwner.execute({
            businessId: accessPostgresProofBusinessId,
            businessSlug: 'access-write-proof',
            businessDisplayName: 'Access Write Proof',
            email: 'login-owner@pressly.test',
            password: accessPostgresProofPassword,
            confirmation: 'bootstrap-first-owner',
          }),
        );
        const rejected = await accessPostgresProofSystem.cells.login.execute({
          email: 'login-owner@pressly.test',
          password: 'wrong-password',
        });
        expect(rejected).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_credentials' },
        });
        requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.login.execute({
            email: 'login-owner@pressly.test',
            password: accessPostgresProofPassword,
          }),
        );
        const attempts = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authLoginAttempts);
        expect(attempts.map(({ success }) => success).sort()).toEqual([
          false,
          true,
        ]);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authSessions),
        ).resolves.toHaveLength(1);
      },
    },

    {
      name: 'does not create login effects when credential verification throws',
      proves: ['unexpected-failure-no-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const owner = requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.bootstrapOwner.execute({
            businessId: accessPostgresProofBusinessId,
            businessSlug: 'access-write-proof',
            businessDisplayName: 'Access Write Proof',
            email: 'login-corrupt@pressly.test',
            password: accessPostgresProofPassword,
            confirmation: 'bootstrap-first-owner',
          }),
        );
        await accessPostgresProofDatabase.db
          .update(accessPostgresProofSchema.authPasswordCredentials)
          .set({ passwordHash: 'invalid-password-hash' })
          .where(
            eq(
              accessPostgresProofSchema.authPasswordCredentials.identityId,
              owner.identityId,
            ),
          );
        await expect(
          accessPostgresProofSystem.cells.login.execute({
            email: 'login-corrupt@pressly.test',
            password: accessPostgresProofPassword,
          }),
        ).rejects.toMatchObject({ code: 'password_verification_failed' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authSessions),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authLoginAttempts),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
