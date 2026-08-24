import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresInvitation,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { revokeWorkforceInvitationCellDeclaration } from './cell.ts';
import { makeRevokeWorkforceInvitationStore } from './revoke-workforce-invitation.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.revoke-workforce-invitation.v1',
  declaration: revokeWorkforceInvitationCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes revocation replay, rejects stale state, and rolls back a late transition failure',
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
            email: 'revoke-invitation@pressly.test',
            tokenHash: accessPostgresProofHash('c'),
          },
        );
        const store = makeRevokeWorkforceInvitationStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          invitationId: invitation.id,
          businessId: accessPostgresProofBusinessId,
          expectedVersion: 1,
          reason: 'access changed',
          now: accessPostgresProofNow,
          idempotencyKey: 'revoke-invitation-1',
          commandHash: accessPostgresProofHash('5'),
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
            idempotencyKey: 'revoke-invitation-stale',
            commandHash: accessPostgresProofHash('6'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'stale_version',
          currentVersion: 2,
        });
        const [stored] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.workforceInvitations);
        expect(stored).toMatchObject({ state: 'revoked', version: 2 });

        const rollbackInvitation = await insertAccessPostgresInvitation(
          owner.identity.id,
          {
            email: 'revoke-invitation-rollback@pressly.test',
            tokenHash: accessPostgresProofHash('d'),
          },
        );
        await expect(
          store.revoke({
            ...command,
            invitationId: rollbackInvitation.id,
            idempotencyKey: 'revoke-invitation-rollback',
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
      },
    },
  ],
});
