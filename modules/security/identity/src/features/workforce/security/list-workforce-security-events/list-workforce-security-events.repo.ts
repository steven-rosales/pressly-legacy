import { type Database } from '@pressly/db/client';
import { and, desc, eq, lt, or } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { runDatabaseOperation } from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { encodeWorkforceCursor } from '../../../../foundations/language/workforce-pagination/workforce-cursor.value.ts';
import type { ListWorkforceSecurityEventsStore } from './list-workforce-security-events.port.ts';

export const makeListWorkforceSecurityEventsStore = (
  db: Database,
): ListWorkforceSecurityEventsStore => ({
  listSecurityEvents: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: true,
        });
        if (actor.status === 'rejected') return actor;

        const rows = await tx
          .select({
            id: auth.authAuditEvents.id,
            eventType: auth.authAuditEvents.eventType,
            resourceType: auth.authAuditEvents.resourceType,
            actorDisplayName: auth.authIdentities.displayName,
            createdAt: auth.authAuditEvents.createdAt,
          })
          .from(auth.authAuditEvents)
          .leftJoin(
            auth.authIdentities,
            eq(
              auth.authIdentities.id,
              auth.authAuditEvents.principalIdentityId,
            ),
          )
          .where(
            and(
              eq(auth.authAuditEvents.businessId, input.businessId),
              input.cursor === undefined
                ? undefined
                : or(
                    lt(auth.authAuditEvents.createdAt, input.cursor.createdAt),
                    and(
                      eq(
                        auth.authAuditEvents.createdAt,
                        input.cursor.createdAt,
                      ),
                      lt(auth.authAuditEvents.id, input.cursor.id),
                    ),
                  ),
            ),
          )
          .orderBy(
            desc(auth.authAuditEvents.createdAt),
            desc(auth.authAuditEvents.id),
          )
          .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        const last = page.at(-1);
        return {
          status: 'found',
          events: page,
          nextCursor:
            rows.length > input.limit && last !== undefined
              ? encodeWorkforceCursor(last)
              : null,
        };
      }),
    ),
});
