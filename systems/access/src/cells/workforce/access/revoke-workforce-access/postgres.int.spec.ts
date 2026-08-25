import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresForcedRollbackUnitOfWork,
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  requireAccessPostgresFixture,
  seedAccessPostgresOperator,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { revokeWorkforceAccessCellDeclaration } from './cell.ts';
import { makeRevokeWorkforceAccessStore } from './revoke-workforce-access.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.revoke-workforce-access.v1',
  declaration: revokeWorkforceAccessCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes revoke replay, rejects a stale version, and rolls back session reduction after a forced late failure',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'unexpected-failure-rollback',
        'same-payload-replay',
        'divergent-key-conflict',
        'same-key-concurrency',
        'declared-concurrency-race',
        'state-message-atomicity',
      ],
      run: async () => {
        await seedAccessPostgresScope();
        const owner = await seedAccessPostgresOwnerActor();
        const operator = await seedAccessPostgresOperator({
          email: 'revoke-access@pressly.test',
          withGrant: true,
          sessionHashes: [accessPostgresProofHash('r')],
        });
        const grant = requireAccessPostgresFixture(
          operator.grant ?? undefined,
          'operator_grant',
        );
        const store = makeRevokeWorkforceAccessStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          businessId: accessPostgresProofBusinessId,
          grantId: grant.id,
          expectedVersion: 1,
          reason: 'location access removed',
          now: accessPostgresProofNow,
          idempotencyKey: 'revoke-access-1',
          commandHash: accessPostgresProofHash('c'),
        };
        const outcomes = await Promise.all([
          store.revoke(command),
          store.revoke(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.revoke({
            ...command,
            idempotencyKey: 'revoke-access-stale',
            commandHash: accessPostgresProofHash('d'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'stale_version',
          currentVersion: 2,
        });
        const [storedGrant] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authAccessGrants)
          .where(eq(accessPostgresProofSchema.authAccessGrants.id, grant.id));
        const [storedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions)
          .where(
            eq(
              accessPostgresProofSchema.authSessions.identityId,
              operator.identity.id,
            ),
          );
        expect(storedGrant).toMatchObject({ state: 'revoked', version: 2 });
        expect(storedSession?.revokedAt).toEqual(accessPostgresProofNow);

        const rollbackOperator = await seedAccessPostgresOperator({
          email: 'revoke-access-rollback@pressly.test',
          withGrant: true,
          sessionHashes: [accessPostgresProofHash('w')],
        });
        const rollbackGrant = requireAccessPostgresFixture(
          rollbackOperator.grant ?? undefined,
          'rollback_operator_grant',
        );
        const rollbackStore = makeRevokeWorkforceAccessStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
          accessPostgresForcedRollbackUnitOfWork,
        );
        await expect(
          rollbackStore.revoke({
            ...command,
            grantId: rollbackGrant.id,
            idempotencyKey: 'revoke-access-rollback',
            commandHash: accessPostgresProofHash('e'),
          }),
        ).rejects.toMatchObject({ code: 'access_write_forced_rollback' });
        const [preservedGrant] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authAccessGrants)
          .where(
            eq(accessPostgresProofSchema.authAccessGrants.id, rollbackGrant.id),
          );
        const [preservedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions)
          .where(
            eq(
              accessPostgresProofSchema.authSessions.identityId,
              rollbackOperator.identity.id,
            ),
          );
        expect(preservedGrant).toMatchObject({ state: 'active', version: 1 });
        expect(preservedSession?.revokedAt).toBeNull();
      },
    },
  ],
});
