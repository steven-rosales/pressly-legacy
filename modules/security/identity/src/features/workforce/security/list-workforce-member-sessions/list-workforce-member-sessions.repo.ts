import { type Database } from '@pressly/db/client';
import { desc, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { runDatabaseOperation } from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { loadMemberDetail } from '../../../../foundations/adapters/postgres/workforce-member-read/workforce-member-read.repo.ts';
import { workforceSessionTargetDenial } from '../../../../foundations/language/workforce-authority/workforce-session-authorization.policy.ts';
import type { ListWorkforceMemberSessionsStore } from './list-workforce-member-sessions.port.ts';

export const makeListWorkforceMemberSessionsStore = (
  db: Database,
): ListWorkforceMemberSessionsStore => ({
  listMemberSessions: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: true,
        });
        if (actor.status === 'rejected') return actor;
        const member = await loadMemberDetail(tx, {
          businessId: input.businessId,
          membershipId: input.membershipId,
          now: input.now,
        });
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const denied = workforceSessionTargetDenial(actor, member);
        if (denied !== null)
          return {
            status: 'rejected',
            reason: denied,
          };

        const sessions = await tx
          .select({
            id: auth.authSessions.id,
            issuedAt: auth.authSessions.issuedAt,
            lastUsedAt: auth.authSessions.lastUsedAt,
            expiresAt: auth.authSessions.expiresAt,
            revokedAt: auth.authSessions.revokedAt,
          })
          .from(auth.authSessions)
          .where(eq(auth.authSessions.identityId, member.identityId))
          .orderBy(
            desc(auth.authSessions.issuedAt),
            desc(auth.authSessions.id),
          );
        return {
          status: 'found',
          sessions: sessions.map((session) => ({
            ...session,
            current: session.id === input.actor.sessionId,
          })),
        };
      }),
    ),
});
