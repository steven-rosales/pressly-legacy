import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  accessPostgresProofFuture,
  accessPostgresProofHash,
  accessPostgresProofLocationId,
  accessPostgresProofNow,
  seedAccessPostgresOwnerActor,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../../testing/schema.ts';
import { issueWorkforceInvitationCellDeclaration } from './cell.ts';
import { makeIssueWorkforceInvitationStore } from './issue-workforce-invitation.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.issue-workforce-invitation.v1',
  declaration: issueWorkforceInvitationCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes issue replay, rejects divergent reuse, and rolls back a late receipt failure',
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
        const store = makeIssueWorkforceInvitationStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          businessId: accessPostgresProofBusinessId,
          emailNormalized: 'issued-operator@pressly.test',
          displayName: 'Issued Operator',
          intendedRole: 'operator' as const,
          intendedLocationId: accessPostgresProofLocationId,
          tokenHash: accessPostgresProofHash('a'),
          expiresAt: accessPostgresProofFuture,
          now: accessPostgresProofNow,
          idempotencyKey: 'issue-invitation-1',
          commandHash: accessPostgresProofHash('1'),
        };
        const outcomes = await Promise.all([
          store.issue(command),
          store.issue(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.issue({
            ...command,
            commandHash: accessPostgresProofHash('2'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'idempotency_conflict',
        });
        await expect(
          store.issue({
            ...command,
            emailNormalized: 'rolled-back-issue@pressly.test',
            tokenHash: accessPostgresProofHash('b'),
            idempotencyKey: 'issue-invitation-rollback',
            commandHash: 'invalid-command-hash',
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.workforceInvitations)
            .where(
              eq(
                accessPostgresProofSchema.workforceInvitations.emailNormalized,
                'rolled-back-issue@pressly.test',
              ),
            ),
        ).resolves.toHaveLength(0);
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.workforceInvitations)
            .where(
              eq(
                accessPostgresProofSchema.workforceInvitations.emailNormalized,
                'issued-operator@pressly.test',
              ),
            ),
        ).resolves.toHaveLength(1);
      },
    },
  ],
});
