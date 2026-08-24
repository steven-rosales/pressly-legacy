import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresForcedRollbackUnitOfWork,
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofLocationId,
  accessPostgresProofNow,
  seedAccessPostgresOperator,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { grantWorkforceAccessCellDeclaration } from './cell.ts';
import { makeGrantWorkforceAccessStore } from './grant-workforce-access.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.grant-workforce-access.v1',
  declaration: grantWorkforceAccessCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes grant replay, rejects divergent reuse, and rolls back a forced late failure',
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
          email: 'grant-operator@pressly.test',
        });
        const store = makeGrantWorkforceAccessStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          businessId: accessPostgresProofBusinessId,
          membershipId: operator.membership.id,
          identityId: operator.identity.id,
          role: 'operator' as const,
          scope: {
            kind: 'location' as const,
            id: accessPostgresProofLocationId,
          },
          startsAt: null,
          endsAt: null,
          now: accessPostgresProofNow,
          idempotencyKey: 'grant-access-1',
          commandHash: accessPostgresProofHash('9'),
        };
        const outcomes = await Promise.all([
          store.grant(command),
          store.grant(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.grant({
            ...command,
            commandHash: accessPostgresProofHash('a'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'idempotency_conflict',
        });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAccessGrants)
            .where(
              eq(
                accessPostgresProofSchema.authAccessGrants.identityId,
                operator.identity.id,
              ),
            ),
        ).resolves.toHaveLength(1);

        const rollbackOperator = await seedAccessPostgresOperator({
          email: 'grant-rollback@pressly.test',
        });
        const rollbackStore = makeGrantWorkforceAccessStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
          accessPostgresForcedRollbackUnitOfWork,
        );
        await expect(
          rollbackStore.grant({
            ...command,
            membershipId: rollbackOperator.membership.id,
            identityId: rollbackOperator.identity.id,
            idempotencyKey: 'grant-access-rollback',
            commandHash: accessPostgresProofHash('b'),
          }),
        ).rejects.toMatchObject({ code: 'access_write_forced_rollback' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authAccessGrants)
            .where(
              eq(
                accessPostgresProofSchema.authAccessGrants.identityId,
                rollbackOperator.identity.id,
              ),
            ),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
