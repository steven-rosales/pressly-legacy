import { eq } from '@pressly/postgres/query';
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
import { revokeIdentitySessionsCellDeclaration } from './cell.ts';
import { makeRevokeIdentitySessionsStore } from './revoke-identity-sessions.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.revoke-identity-sessions.v1',
  declaration: revokeIdentitySessionsCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'revokes all sessions, replays as a no-op, and rolls back when audit persistence fails',
      proves: [
        'postgres-commit',
        'unexpected-failure-rollback',
        'same-payload-replay',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'revoke-identity@pressly.test',
        );
        await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('g'),
        );
        await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('h'),
        );
        const store = makeRevokeIdentitySessionsStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        await expect(
          store.revokeIdentitySessions({
            principalIdentityId: identity.id,
            identityId: identity.id,
            revokedAt: accessPostgresProofNow,
          }),
        ).resolves.toBe(2);
        await expect(
          store.revokeIdentitySessions({
            principalIdentityId: identity.id,
            identityId: identity.id,
            revokedAt: accessPostgresProofNow,
          }),
        ).resolves.toBe(0);
        const sessions = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(
          sessions.every(
            ({ revokedAt }) =>
              revokedAt?.getTime() === accessPostgresProofNow.getTime(),
          ),
        ).toBe(true);

        const rollbackSession = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('z'),
        );
        await expect(
          store.revokeIdentitySessions({
            principalIdentityId: '87000000-0000-4000-8000-000000000099',
            identityId: identity.id,
            revokedAt: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const [preservedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions)
          .where(
            eq(accessPostgresProofSchema.authSessions.id, rollbackSession.id),
          );
        expect(preservedSession?.revokedAt).toBeNull();
      },
    },
    {
      name: 'rejects an unknown principal reference without partially revoking sessions',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'revoke-rejected@pressly.test',
        );
        const session = await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('i'),
        );
        const store = makeRevokeIdentitySessionsStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.revokeIdentitySessions({
            principalIdentityId: '87000000-0000-4000-8000-000000000099',
            identityId: identity.id,
            revokedAt: accessPostgresProofNow,
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const [preserved] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions)
          .where(eq(accessPostgresProofSchema.authSessions.id, session.id));
        expect(preserved?.revokedAt).toBeNull();
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },
    {
      name: 'serializes concurrent revocation on the declared identity partition',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await insertAccessPostgresIdentity(
          'revoke-race@pressly.test',
        );
        await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('j'),
        );
        await insertAccessPostgresSession(
          identity.id,
          accessPostgresProofHash('k'),
        );
        const store = makeRevokeIdentitySessionsStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const input = {
          principalIdentityId: identity.id,
          identityId: identity.id,
          revokedAt: accessPostgresProofNow,
        };

        const counts = await Promise.all([
          store.revokeIdentitySessions(input),
          store.revokeIdentitySessions(input),
        ]);
        expect(counts.sort()).toEqual([0, 2]);
        const sessions = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(sessions.every(({ revokedAt }) => revokedAt !== null)).toBe(
          true,
        );
      },
    },
  ],
});
