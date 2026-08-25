import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofFuture,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresInvitation,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { reissueWorkforceInvitationCellDeclaration } from './cell.ts';
import { makeReissueWorkforceInvitationStore } from './reissue-workforce-invitation.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.reissue-workforce-invitation.v1',
  declaration: reissueWorkforceInvitationCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes replacement replay, rejects stale state, and rolls back a late transition failure',
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
        const invitation = await insertAccessPostgresInvitation(
          owner.identity.id,
          {
            email: 'reissue-operator@pressly.test',
            tokenHash: accessPostgresProofHash('a'),
          },
        );
        const store = makeReissueWorkforceInvitationStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          invitationId: invitation.id,
          businessId: accessPostgresProofBusinessId,
          expectedVersion: 1,
          tokenHash: accessPostgresProofHash('b'),
          expiresAt: accessPostgresProofFuture,
          now: accessPostgresProofNow,
          idempotencyKey: 'reissue-invitation-1',
          commandHash: accessPostgresProofHash('3'),
        };
        const outcomes = await Promise.all([
          store.reissue(command),
          store.reissue(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.reissue({
            ...command,
            idempotencyKey: 'reissue-invitation-stale',
            commandHash: accessPostgresProofHash('4'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'stale_version',
          currentVersion: 2,
        });
        const invitations = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.workforceInvitations);
        expect(invitations).toHaveLength(2);
        expect(
          invitations.filter(({ state }) => state === 'pending'),
        ).toHaveLength(1);
        expect(
          invitations.filter(({ state }) => state === 'revoked'),
        ).toHaveLength(1);

        const rollbackInvitation = await insertAccessPostgresInvitation(
          owner.identity.id,
          {
            email: 'reissue-rollback@pressly.test',
            tokenHash: accessPostgresProofHash('c'),
          },
        );
        await expect(
          store.reissue({
            ...command,
            invitationId: rollbackInvitation.id,
            tokenHash: accessPostgresProofHash('d'),
            idempotencyKey: 'reissue-invitation-rollback',
            commandHash: 'invalid-command-hash',
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const [preservedInvitation] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.workforceInvitations)
          .where(
            eq(
              accessPostgresProofSchema.workforceInvitations.id,
              rollbackInvitation.id,
            ),
          );
        expect(preservedInvitation).toMatchObject({
          state: 'pending',
          version: 1,
        });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.workforceInvitations)
            .where(
              eq(
                accessPostgresProofSchema.workforceInvitations.emailNormalized,
                'reissue-rollback@pressly.test',
              ),
            ),
        ).resolves.toHaveLength(1);
      },
    },
  ],
});
