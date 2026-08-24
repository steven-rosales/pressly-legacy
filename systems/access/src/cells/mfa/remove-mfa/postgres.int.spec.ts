import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresForcedRollbackUnitOfWork,
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresIdentity,
  insertAccessPostgresSession,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { removeMfaCellDeclaration } from './cell.ts';
import { makeRemoveMfaStore } from './remove-mfa.repo.ts';

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
    });
  return identity;
};

proveOperation({
  operationId: 'access.remove-mfa.v1',
  declaration: removeMfaCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'removes MFA, downgrades the current session, and revokes peers in one commit',
      proves: ['postgres-commit', 'state-message-atomicity'],
      run: async () => {
        const identity = await seedEnabledMfa('remove-mfa@pressly.test');
        const currentSession = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('d'),
          'mfa',
        );
        const otherSession = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('e'),
          'mfa',
        );
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authMfaRecoveryCodes)
          .values({
            identityId: identity.id,
            codeHash: accessPostgresProofHash('f'),
          });
        await makeRemoveMfaStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        ).removeMfa({
          identityId: identity.id,
          sessionId: currentSession.id,
          now: accessPostgresProofNow,
        });

        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaCredentials),
        ).resolves.toHaveLength(0);
        const sessions = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(
          sessions.find(({ id }) => id === currentSession.id),
        ).toMatchObject({
          assuranceLevel: 'password',
          revokedAt: null,
        });
        expect(
          sessions.find(({ id }) => id === otherSession.id)?.revokedAt,
        ).toEqual(accessPostgresProofNow);
      },
    },

    {
      name: 'rejects an unknown identity without leaving partial MFA or audit state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const store = makeRemoveMfaStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.removeMfa({
            identityId: '87000000-0000-4000-8000-000000000099',
            sessionId: '87000000-0000-4000-8000-000000000098',
            now: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaCredentials),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },

    {
      name: 'converges concurrent removal on the declared identity partition',
      proves: ['declared-concurrency-race'],
      run: async () => {
        const identity = await seedEnabledMfa('remove-race@pressly.test');
        const session = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('3'),
          'mfa',
        );
        const store = makeRemoveMfaStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const input = {
          identityId: identity.id,
          sessionId: session.id,
          now: accessPostgresProofNow,
        };

        await expect(
          Promise.all([store.removeMfa(input), store.removeMfa(input)]),
        ).resolves.toEqual([undefined, undefined]);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaCredentials),
        ).resolves.toHaveLength(0);
        const [storedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(storedSession).toMatchObject({ assuranceLevel: 'password' });
      },
    },

    {
      name: 'restores credentials and sessions after a forced late failure',
      proves: ['unexpected-failure-rollback', 'state-message-atomicity'],
      run: async () => {
        const identity = await seedEnabledMfa('remove-rollback@pressly.test');
        const session = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('0'),
          'mfa',
        );
        const store = makeRemoveMfaStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
          accessPostgresForcedRollbackUnitOfWork,
        );
        await expect(
          store.removeMfa({
            identityId: identity.id,
            sessionId: session.id,
            now: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'access_write_forced_rollback' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authMfaCredentials),
        ).resolves.toHaveLength(1);
        const [storedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(storedSession).toMatchObject({
          assuranceLevel: 'mfa',
          revokedAt: null,
        });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
