import { type PostgresDatabase } from '@pressly/postgres/client';
import { and, desc, eq, inArray, lt, or } from '@pressly/postgres/query';
import { loadAuthorizedActor } from '../../../../postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { runDatabaseOperation } from '../../../../postgres/database-operation/database-operation.adapter.ts';
import { toWorkforceInvitationEntity } from '../../../../postgres/workforce-invitation-read/workforce-invitation.postgres.ts';
import { encodeWorkforceCursor } from '../../../../model/language/workforce-pagination/workforce-cursor.value.ts';
import type { ListWorkforceInvitationsStore } from './list-workforce-invitations.port.ts';
import type { AccessSchema } from '../../../../schema/public.ts';

export const makeListWorkforceInvitationsStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): ListWorkforceInvitationsStore => ({
  list: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, auth, {
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
          invitations: page.map(toWorkforceInvitationEntity),
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
