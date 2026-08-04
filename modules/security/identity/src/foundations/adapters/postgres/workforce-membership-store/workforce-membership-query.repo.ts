import { type Database } from '@pressly/db/client';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import {
  loadAuthorizedActor,
  loadMemberDetail,
} from '../identity-store/workforce-store.repo.ts';
import { runDatabaseOperation } from '../identity-store/database-result.adapter.ts';
import { encodeWorkforceCursor } from '../../../language/workforce-pagination/workforce-cursor.value.ts';
import type { WorkforceMemberDetail } from '../../../language/workforce-membership/workforce-membership.model.ts';
import {
  targetLocationForActor,
  targetRole,
} from '../../../language/workforce-authority/workforce-membership-authorization.policy.ts';
import type { WorkforceMembershipStore } from '../../../ports/workforce-membership-store/workforce-membership-store.port.ts';

type WorkforceMembershipQueryStore = Pick<
  WorkforceMembershipStore,
  'list' | 'detail'
>;

export const makeWorkforceMembershipQueryStore = (
  db: Database,
): WorkforceMembershipQueryStore => ({
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
            page: { members: [], nextCursor: null },
          };
        const escapedQuery = input.query?.trim().replace(/[\\%_]/g, '\\$&');
        const commonWhere = and(
          eq(auth.workforceMemberships.businessId, input.businessId),
          escapedQuery === undefined || escapedQuery.length === 0
            ? undefined
            : or(
                sql`${auth.authIdentities.displayName} ilike ${`%${escapedQuery}%`} escape '\\'`,
                sql`${auth.authIdentities.emailNormalized} ilike ${`%${escapedQuery}%`} escape '\\'`,
              ),
          input.states === undefined || input.states.length === 0
            ? undefined
            : inArray(auth.workforceMemberships.state, input.states),
          input.cursor === undefined
            ? undefined
            : or(
                lt(auth.workforceMemberships.createdAt, input.cursor.createdAt),
                and(
                  eq(
                    auth.workforceMemberships.createdAt,
                    input.cursor.createdAt,
                  ),
                  lt(auth.workforceMemberships.id, input.cursor.id),
                ),
              ),
        );
        const rows =
          actor.role === 'owner'
            ? await tx
                .select({
                  id: auth.workforceMemberships.id,
                  createdAt: auth.workforceMemberships.createdAt,
                })
                .from(auth.workforceMemberships)
                .innerJoin(
                  auth.authIdentities,
                  eq(
                    auth.authIdentities.id,
                    auth.workforceMemberships.identityId,
                  ),
                )
                .where(commonWhere)
                .orderBy(
                  desc(auth.workforceMemberships.createdAt),
                  desc(auth.workforceMemberships.id),
                )
                .limit(input.limit + 1)
            : await tx
                .selectDistinct({
                  id: auth.workforceMemberships.id,
                  createdAt: auth.workforceMemberships.createdAt,
                })
                .from(auth.workforceMemberships)
                .innerJoin(
                  auth.authIdentities,
                  eq(
                    auth.authIdentities.id,
                    auth.workforceMemberships.identityId,
                  ),
                )
                .innerJoin(
                  auth.authAccessGrants,
                  and(
                    eq(
                      auth.authAccessGrants.membershipId,
                      auth.workforceMemberships.id,
                    ),
                    eq(
                      auth.authAccessGrants.businessId,
                      auth.workforceMemberships.businessId,
                    ),
                  ),
                )
                .where(
                  and(
                    commonWhere,
                    eq(auth.authAccessGrants.role, 'operator'),
                    eq(auth.authAccessGrants.state, 'active'),
                    or(
                      isNull(auth.authAccessGrants.startsAt),
                      lte(auth.authAccessGrants.startsAt, input.now),
                    ),
                    or(
                      isNull(auth.authAccessGrants.endsAt),
                      gt(auth.authAccessGrants.endsAt, input.now),
                    ),
                    eq(auth.authAccessGrants.scopeKind, 'location'),
                    inArray(
                      auth.authAccessGrants.locationId,
                      actor.locationIds,
                    ),
                  ),
                )
                .orderBy(
                  desc(auth.workforceMemberships.createdAt),
                  desc(auth.workforceMemberships.id),
                )
                .limit(input.limit + 1);

        const details = (
          await Promise.all(
            rows.slice(0, input.limit).map((row) =>
              loadMemberDetail(tx, {
                businessId: input.businessId,
                membershipId: row.id,
                now: input.now,
              }),
            ),
          )
        ).filter((member): member is WorkforceMemberDetail => member !== null);
        const last = rows.slice(0, input.limit).at(-1);

        return {
          status: 'found',
          page: {
            members: details,
            nextCursor:
              rows.length > input.limit && last !== undefined
                ? encodeWorkforceCursor(last)
                : null,
          },
        };
      }),
    ),

  detail: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: false,
        });
        if (actor.status === 'rejected') return actor;
        const member = await loadMemberDetail(tx, input);
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        if (
          actor.role === 'manager' &&
          (targetRole(member) !== 'operator' ||
            targetLocationForActor(member, actor.locationIds) === null)
        )
          return {
            status: 'rejected',
            reason: 'manager_target_forbidden',
          };
        return { status: 'found', member };
      }),
    ),
});
