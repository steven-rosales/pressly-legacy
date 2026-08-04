import { type Database } from '@pressly/db/client';
import { and, desc, eq, inArray, lt, or } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { loadAuthorizedActor } from '../identity-store/workforce-store.repo.ts';
import { runDatabaseOperation } from '../identity-store/database-result.adapter.ts';
import { encodeWorkforceCursor } from '../../../language/workforce-pagination/workforce-cursor.value.ts';
import { toWorkforceInvitationSummary } from './workforce-invitation.persistence.mapper.ts';
import type { WorkforceInvitationStore } from '../../../ports/workforce-invitation-store/workforce-invitation-store.port.ts';

type WorkforceInvitationQueryStore = Pick<WorkforceInvitationStore, 'list'>;

export const makeWorkforceInvitationQueryStore = (
  db: Database,
): WorkforceInvitationQueryStore => ({
  list: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: false,
        });
        if (actor.status === 'rejected') return actor;
        if (actor.role === 'manager' && actor.locationIds.length === 0)
          return {
            status: 'found',
            invitations: [],
            nextCursor: null,
          };
        const invitations = await tx
          .select()
          .from(auth.workforceInvitations)
          .where(
            and(
              eq(auth.workforceInvitations.businessId, input.businessId),
              input.includeTerminal
                ? undefined
                : eq(auth.workforceInvitations.state, 'pending'),
              actor.role === 'manager'
                ? and(
                    eq(auth.workforceInvitations.intendedRole, 'operator'),
                    inArray(
                      auth.workforceInvitations.intendedLocationId,
                      actor.locationIds,
                    ),
                  )
                : undefined,
              input.cursor === undefined
                ? undefined
                : or(
                    lt(
                      auth.workforceInvitations.createdAt,
                      input.cursor.createdAt,
                    ),
                    and(
                      eq(
                        auth.workforceInvitations.createdAt,
                        input.cursor.createdAt,
                      ),
                      lt(auth.workforceInvitations.id, input.cursor.id),
                    ),
                  ),
            ),
          )
          .orderBy(
            desc(auth.workforceInvitations.createdAt),
            desc(auth.workforceInvitations.id),
          )
          .limit(input.limit + 1);
        const page = invitations.slice(0, input.limit);
        const last = page.at(-1);
        return {
          status: 'found',
          invitations: page.map(toWorkforceInvitationSummary),
          nextCursor:
            invitations.length > input.limit && last !== undefined
              ? encodeWorkforceCursor({
                  createdAt: last.createdAt,
                  id: last.id,
                })
              : null,
        };
      }),
    ),
});
