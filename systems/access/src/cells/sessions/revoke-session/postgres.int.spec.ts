import { eq } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofNow,
  accessPostgresProofPassword,
  accessPostgresProofSystem,
  requireAccessPostgresSuccess,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import { revokeSessionCellDeclaration } from './cell.ts';
import { makeRevokeSessionStore } from './revoke-session.repo.ts';
import { makeRevokeSession } from './revoke-session.usecase.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.revoke-session.v1',
  declaration: revokeSessionCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'revokes one bearer session once while repeated logout stays successful',
      proves: [
        'postgres-commit',
        'same-payload-replay',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.bootstrapOwner.execute({
            businessId: accessPostgresProofBusinessId,
            businessSlug: 'access-write-proof',
            businessDisplayName: 'Access Write Proof',
            email: 'revoke-session@pressly.test',
            password: accessPostgresProofPassword,
            confirmation: 'bootstrap-first-owner',
          }),
        );
        const login = requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.login.execute({
            email: 'revoke-session@pressly.test',
            password: accessPostgresProofPassword,
          }),
        );
        if (!('accessToken' in login))
          throw invariantViolationError({
            code: 'access_write_session_expected',
            message: 'Expected password login to produce an Access session.',
          });
        await expect(
          accessPostgresProofSystem.cells.revokeSession.execute({
            bearerToken: login.accessToken,
          }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: { revoked: true },
        });
        await expect(
          accessPostgresProofSystem.cells.revokeSession.execute({
            bearerToken: login.accessToken,
          }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: { revoked: true },
        });
        const [session] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(session?.revokedAt).not.toBeNull();
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents)
            .where(
              eq(
                accessPostgresProofSchema.authAuditEvents.eventType,
                'auth.logout',
              ),
            ),
        ).resolves.toHaveLength(1);
      },
    },
    {
      name: 'rejects an expired session match without changing session or audit state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const identity = await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authIdentities)
          .values({
            kind: 'human',
            displayName: 'Expired Session',
            email: 'expired-session@pressly.test',
            emailNormalized: 'expired-session@pressly.test',
            isActive: true,
          })
          .returning();
        const identityId = identity[0]?.id;
        if (identityId === undefined)
          throw invariantViolationError({
            code: 'access_revoke_session_identity_expected',
            message: 'Expected the PostgreSQL fixture identity.',
          });
        const tokenHash = 'expired-session-token-hash';
        await accessPostgresProofDatabase.db
          .insert(accessPostgresProofSchema.authSessions)
          .values({
            identityId,
            tokenHash,
            issuedAt: new Date(accessPostgresProofNow.getTime() - 120_000),
            expiresAt: new Date(accessPostgresProofNow.getTime() - 60_000),
            lastUsedAt: new Date(accessPostgresProofNow.getTime() - 120_000),
            assuranceLevel: 'password',
          });
        const store = makeRevokeSessionStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );

        await expect(
          store.revokeByTokenHash(tokenHash, accessPostgresProofNow),
        ).resolves.toEqual({});
        const [session] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(session?.revokedAt).toBeNull();
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents),
        ).resolves.toHaveLength(0);
      },
    },
    {
      name: 'leaves PostgreSQL untouched when token hashing fails before the write',
      proves: ['unexpected-failure-no-write'],
      run: async () => {
        await seedAccessPostgresScope();
        requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.bootstrapOwner.execute({
            businessId: accessPostgresProofBusinessId,
            businessSlug: 'access-write-proof',
            businessDisplayName: 'Access Write Proof',
            email: 'revoke-prewrite@pressly.test',
            password: accessPostgresProofPassword,
            confirmation: 'bootstrap-first-owner',
          }),
        );
        const login = requireAccessPostgresSuccess(
          await accessPostgresProofSystem.cells.login.execute({
            email: 'revoke-prewrite@pressly.test',
            password: accessPostgresProofPassword,
          }),
        );
        if (!('accessToken' in login))
          throw invariantViolationError({
            code: 'access_write_session_expected',
            message: 'Expected password login to produce an Access session.',
          });
        const failure = invariantViolationError({
          code: 'revoke_session_hash_forced_failure',
          message: 'Force a pre-write token hashing failure.',
        });
        const revoke = makeRevokeSession({
          store: makeRevokeSessionStore(
            accessPostgresProofDatabase.db,
            accessPostgresProofSchema,
          ),
          tokenHasher: {
            hash: () => {
              throw failure;
            },
          },
          clock: { now: () => accessPostgresProofNow },
        });
        const [before] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);

        await expect(revoke({ bearerToken: login.accessToken })).rejects.toBe(
          failure,
        );
        const [after] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions);
        expect(after).toEqual(before);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAuditEvents)
            .where(
              eq(
                accessPostgresProofSchema.authAuditEvents.eventType,
                'auth.logout',
              ),
            ),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
