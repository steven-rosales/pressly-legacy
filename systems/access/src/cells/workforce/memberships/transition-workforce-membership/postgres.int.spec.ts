import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresForcedRollbackUnitOfWork,
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  seedAccessPostgresOperator,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { transitionWorkforceMembershipCellDeclaration } from './cell.ts';
import { makeTransitionWorkforceMembershipStore } from './transition-workforce-membership.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.transition-workforce-membership.v1',
  declaration: transitionWorkforceMembershipCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes suspension replay, rejects stale state, and rolls back session reduction after a forced late failure',
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
          email: 'transition-member@pressly.test',
          withGrant: true,
          sessionHashes: [
            accessPostgresProofHash('s'),
            accessPostgresProofHash('t'),
          ],
        });
        const store = makeTransitionWorkforceMembershipStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          membershipId: operator.membership.id,
          businessId: accessPostgresProofBusinessId,
          expectedVersion: 1,
          event: 'suspend' as const,
          reason: 'access review',
          now: accessPostgresProofNow,
          idempotencyKey: 'transition-membership-1',
          commandHash: accessPostgresProofHash('e'),
        };
        const outcomes = await Promise.all([
          store.transition(command),
          store.transition(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.transition({
            ...command,
            idempotencyKey: 'transition-membership-stale',
            commandHash: accessPostgresProofHash('f'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'stale_version',
          currentVersion: 2,
        });
        const [membership] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.workforceMemberships)
          .where(
            eq(
              accessPostgresProofSchema.workforceMemberships.id,
              operator.membership.id,
            ),
          );
        expect(membership).toMatchObject({ state: 'suspended', version: 2 });
        const sessions = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions)
          .where(
            eq(
              accessPostgresProofSchema.authSessions.identityId,
              operator.identity.id,
            ),
          );
        expect(
          sessions.every(
            ({ revokedAt }) =>
              revokedAt?.getTime() === accessPostgresProofNow.getTime(),
          ),
        ).toBe(true);

        const rollbackOperator = await seedAccessPostgresOperator({
          email: 'transition-rollback@pressly.test',
          withGrant: true,
          sessionHashes: [accessPostgresProofHash('x')],
        });
        const rollbackStore = makeTransitionWorkforceMembershipStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
          accessPostgresForcedRollbackUnitOfWork,
        );
        await expect(
          rollbackStore.transition({
            ...command,
            membershipId: rollbackOperator.membership.id,
            idempotencyKey: 'transition-membership-rollback',
            commandHash: accessPostgresProofHash('a'),
          }),
        ).rejects.toMatchObject({ code: 'access_write_forced_rollback' });
        const [preservedMembership] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.workforceMemberships)
          .where(
            eq(
              accessPostgresProofSchema.workforceMemberships.id,
              rollbackOperator.membership.id,
            ),
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
        expect(preservedMembership).toMatchObject({
          state: 'active',
          version: 1,
        });
        expect(preservedSession?.revokedAt).toBeNull();
      },
    },
  ],
});
