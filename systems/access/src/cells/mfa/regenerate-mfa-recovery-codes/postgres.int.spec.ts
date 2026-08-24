import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresIdentity,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { regenerateMfaRecoveryCodesCellDeclaration } from './cell.ts';
import { makeRegenerateMfaRecoveryCodesStore } from './regenerate-mfa-recovery-codes.repo.ts';

useAccessPostgresProof();

const seedEnabledMfa = async (email: string) => {
  await seedAccessPostgresScope();
  const identity = await insertAccessPostgresIdentity(email);
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
  return identity;
};

proveOperation({
  operationId: 'access.regenerate-mfa-recovery-codes.v1',
  declaration: regenerateMfaRecoveryCodesCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'atomically replaces the complete recovery-code set',
      proves: ['postgres-commit', 'state-message-atomicity'],
      run: async () => {
        const identity = await seedEnabledMfa('regenerate-mfa@pressly.test');
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaRecoveryCodes)
          .values({
            identityId: identity.id,
            codeHash: accessPostgresProofHash('8'),
          });
        const store = makeRegenerateMfaRecoveryCodesStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        await store.replaceRecoveryCodes({
          identityId: identity.id,
          recoveryCodeHashes: [
            accessPostgresProofHash('9'),
            accessPostgresProofHash('a'),
          ],
          now: accessPostgresProofNow,
        });
        const codes = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaRecoveryCodes);
        expect(codes.map(({ codeHash }) => codeHash).sort()).toEqual(
          [accessPostgresProofHash('9'), accessPostgresProofHash('a')].sort(),
        );
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(1);
      },
    },

    {
      name: 'rejects replacement without an enabled credential and writes nothing',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'regenerate-rejected@pressly.test',
        );
        const store = makeRegenerateMfaRecoveryCodesStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.replaceRecoveryCodes({
            identityId: identity.id,
            recoveryCodeHashes: [accessPostgresProofHash('d')],
            now: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({
          code: 'mfa_recovery_codes_identity_not_enabled',
        });
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

    {
      name: 'keeps a complete code set under the declared identity race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        const identity = await seedEnabledMfa(
          'regenerate-concurrent@pressly.test',
        );
        const store = makeRegenerateMfaRecoveryCodesStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const first = [
          accessPostgresProofHash('e'),
          accessPostgresProofHash('f'),
        ];
        const second = [
          accessPostgresProofHash('1'),
          accessPostgresProofHash('2'),
        ];

        const outcomes = await Promise.allSettled([
          store.replaceRecoveryCodes({
            identityId: identity.id,
            recoveryCodeHashes: first,
            now: accessPostgresProofNow,
          }),
          store.replaceRecoveryCodes({
            identityId: identity.id,
            recoveryCodeHashes: second,
            now: accessPostgresProofNow,
          }),
        ]);
        expect(outcomes.some(({ status }) => status === 'fulfilled')).toBe(
          true,
        );
        const codes = (
          await accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaRecoveryCodes)
        )
          .map(({ codeHash }) => codeHash)
          .sort();
        expect([first.slice().sort(), second.slice().sort()]).toContainEqual(
          codes,
        );
      },
    },

    {
      name: 'restores the prior code set after a late uniqueness failure',
      proves: ['unexpected-failure-rollback', 'state-message-atomicity'],
      run: async () => {
        const identity = await seedEnabledMfa(
          'regenerate-rollback@pressly.test',
        );
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaRecoveryCodes)
          .values({
            identityId: identity.id,
            codeHash: accessPostgresProofHash('b'),
          });
        const store = makeRegenerateMfaRecoveryCodesStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        await expect(
          store.replaceRecoveryCodes({
            identityId: identity.id,
            recoveryCodeHashes: [
              accessPostgresProofHash('c'),
              accessPostgresProofHash('c'),
            ],
            now: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const codes = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authMfaRecoveryCodes);
        expect(codes.map(({ codeHash }) => codeHash)).toEqual([
          accessPostgresProofHash('b'),
        ]);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
