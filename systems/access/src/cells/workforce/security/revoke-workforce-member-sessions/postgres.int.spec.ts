import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
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
import { revokeWorkforceMemberSessionsCellDeclaration } from './cell.ts';
import { makeRevokeWorkforceMemberSessionsStore } from './revoke-workforce-member-sessions.repo.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.revoke-workforce-member-sessions.v1',
  declaration: revokeWorkforceMemberSessionsCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes selected-session replay, rejects divergent reuse, and rolls back a late receipt failure',
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
          email: 'revoke-member-sessions@pressly.test',
          withGrant: true,
          sessionHashes: [
            accessPostgresProofHash('u'),
            accessPostgresProofHash('v'),
          ],
        });
        const selectedSession = requireAccessPostgresFixture(
          operator.sessions[0],
          'selected_session',
        );
        const store = makeRevokeWorkforceMemberSessionsStore(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const command = {
          actor: owner.actor,
          businessId: accessPostgresProofBusinessId,
          membershipId: operator.membership.id,
          sessionId: selectedSession.id,
          idempotencyKey: 'revoke-member-session-1',
          commandHash: accessPostgresProofHash('0'),
          now: accessPostgresProofNow,
        };
        const outcomes = await Promise.all([
          store.revokeMemberSessions(command),
          store.revokeMemberSessions(command),
        ]);
        expect(outcomes.map(({ status }) => status).sort()).toEqual([
          'applied',
          'replayed',
        ]);
        await expect(
          store.revokeMemberSessions({
            ...command,
            commandHash: accessPostgresProofHash('1'),
          }),
        ).resolves.toMatchObject({
          status: 'rejected',
          reason: 'idempotency_conflict',
        });
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
          sessions.find(({ id }) => id === selectedSession.id)?.revokedAt,
        ).toEqual(accessPostgresProofNow);
        expect(
          sessions.find(({ id }) => id !== selectedSession.id)?.revokedAt,
        ).toBeNull();

        const untouchedSession = requireAccessPostgresFixture(
          operator.sessions.find(({ id }) => id !== selectedSession.id),
          'untouched_session',
        );
        await expect(
          store.revokeMemberSessions({
            ...command,
            sessionId: untouchedSession.id,
            idempotencyKey: 'revoke-member-session-rollback',
            commandHash: 'invalid-command-hash',
          }),
        ).rejects.toMatchObject({ code: 'auth_database_failed' });
        const [preservedSession] = await accessPostgresProofDatabase.db
          .select()
          .from(accessPostgresProofSchema.authSessions)
          .where(
            eq(accessPostgresProofSchema.authSessions.id, untouchedSession.id),
          );
        expect(preservedSession?.revokedAt).toBeNull();
      },
    },
  ],
});
