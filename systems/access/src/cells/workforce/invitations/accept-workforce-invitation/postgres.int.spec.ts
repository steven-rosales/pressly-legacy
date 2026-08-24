import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofDatabase,
  accessPostgresProofHash,
  accessPostgresProofNow,
  insertAccessPostgresInvitation,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { makeAcceptWorkforceInvitationStore } from './accept-workforce-invitation.repo.ts';
import { acceptWorkforceInvitationCellDeclaration } from './cell.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.accept-workforce-invitation.v1',
  declaration: acceptWorkforceInvitationCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes acceptance replay, rejects divergent reuse, and rolls back a late receipt failure',
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
        await insertAccessPostgresInvitation(owner.identity.id, {
          email: 'accepted-operator@pressly.test',
          tokenHash: accessPostgresProofHash('d'),
        });
        const store = makeAcceptWorkforceInvitationStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          tokenHash: accessPostgresProofHash('d'),
          now: accessPostgresProofNow,
          idempotencyKey: 'accept-invitation-1',
          commandHash: accessPostgresProofHash('7'),
          acceptance: {
            kind: 'new_identity' as const,
            passwordHash: 'accepted-password-hash',
          },
        };
        const outcomes = await Promise.all([
          store.accept(command),
          store.accept(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.accept({
            ...command,
            commandHash: accessPostgresProofHash('8'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'idempotency_conflict',
        });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authIdentities)
            .where(
              eq(
                accessPostgresProofSchema.authIdentities.emailNormalized,
                'accepted-operator@pressly.test',
              ),
            ),
        ).resolves.toHaveLength(1);

        await insertAccessPostgresInvitation(owner.identity.id, {
          email: 'accept-rollback@pressly.test',
          tokenHash: accessPostgresProofHash('e'),
        });
        await expect(
          store.accept({
            ...command,
            tokenHash: accessPostgresProofHash('e'),
            idempotencyKey: 'accept-invitation-rollback',
            commandHash: 'invalid-command-hash',
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.authIdentities)
            .where(
              eq(
                accessPostgresProofSchema.authIdentities.emailNormalized,
                'accept-rollback@pressly.test',
              ),
            ),
        ).resolves.toHaveLength(0);
        const [rolledBackInvitation] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.workforceInvitations)
          .where(
            eq(
              accessPostgresProofSchema.workforceInvitations.tokenHash,
              accessPostgresProofHash('e'),
            ),
          );
        expect(rolledBackInvitation).toMatchObject({
          state: 'pending',
          version: 1,
        });
      },
    },
  ],
});
