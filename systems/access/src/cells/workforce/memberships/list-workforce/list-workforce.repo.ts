import { type PostgresDatabase } from '@pressly/postgres/client';
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
} from '@pressly/postgres/query';
import { loadAuthorizedActor } from '../../../../postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { loadMemberDetail } from '../../../../postgres/workforce-member-read/workforce-member-read.repo.ts';
import { runDatabaseOperation } from '../../../../postgres/database-operation/database-operation.adapter.ts';
import { encodeWorkforceCursor } from '../../../../model/language/workforce-pagination/workforce-cursor.value.ts';
import type {
  WorkforceMemberDetail,
  WorkforceMemberSummary,
} from '../../../../model/language/workforce-membership/workforce-membership.model.ts';
import type { ListWorkforceStore } from './list-workforce.port.ts';
import type { AccessSchema } from '../../../../schema/public.ts';

export const projectWorkforceMemberSummary = (
  member: WorkforceMemberDetail,
): WorkforceMemberSummary => ({
  membershipId: member.membershipId,
  businessId: member.businessId,
  identityId: member.identityId,
  displayName: member.displayName,
  email: member.email,
  state: member.state,
  version: member.version,
  mfaEnabled: member.mfaEnabled,
  grants: member.grants.map((grant) => ({
    id: grant.id,
    businessId: grant.businessId,
    membershipId: grant.membershipId,
    identityId: grant.identityId,
    role: grant.role,
    scope: { kind: grant.scope.kind, id: grant.scope.id },
    state: grant.state,
    version: grant.version,
    startsAt: grant.startsAt,
    endsAt: grant.endsAt,
    effective: grant.effective,
  })),
  startedAt: member.startedAt,
  suspendedAt: member.suspendedAt,
  endedAt: member.endedAt,
});

export const makeListWorkforceStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): ListWorkforceStore => ({
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
              loadMemberDetail(tx, auth, {
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
            members: details.map(projectWorkforceMemberSummary),
            nextCursor:
              rows.length > input.limit && last !== undefined
                ? encodeWorkforceCursor(last)
                : null,
          },
        };
      }),
    ),
});
