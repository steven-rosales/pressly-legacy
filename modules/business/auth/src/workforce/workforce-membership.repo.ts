import {
  and,
  auth,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type Database,
} from '@pressly/db';
import {
  checkReceipt,
  loadAuthorizedActor,
  loadMemberDetail,
  lockBusiness,
  recordAudit,
  recordReceipt,
  recordTransition,
} from './workforce-store.repo.ts';
import type { WorkforceMemberDetail, WorkforceRole } from './workforce.port.ts';
import { encodeWorkforceCursor } from './workforce-pagination.policy.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../persistence/database-result.ts';
import { decideWorkforceMembership } from './workforce-membership.policy.ts';
import {
  authorizeWorkforceTarget,
  strongestWorkforceRole,
} from './workforce-authority.policy.ts';
import type { WorkforceMembershipStore } from './workforce-membership.port.ts';

const targetLocationForActor = (
  member: WorkforceMemberDetail,
  actorLocationIds: readonly string[],
): string | null =>
  member.grants.find(
    (grant) =>
      grant.effective &&
      grant.role === 'operator' &&
      grant.scope.kind === 'location' &&
      actorLocationIds.includes(grant.scope.id),
  )?.scope.id ?? null;

const targetRole = (member: WorkforceMemberDetail): WorkforceRole | null =>
  strongestWorkforceRole(
    member.grants
      .filter((grant) => grant.effective)
      .map((grant) => ({ role: grant.role })),
  );

export const makeWorkforceMembershipStore = (
  db: Database,
): WorkforceMembershipStore => ({
  list: async (input) =>
    toDatabaseResult(async () =>
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
    toDatabaseResult(async () =>
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

  transition: async (input) =>
    toDatabaseResult(async () =>
      db.transaction(async (tx) => {
        await lockBusiness(tx, input.businessId);
        const receipt = await checkReceipt(
          tx,
          input.idempotencyKey,
          input.commandHash,
        );
        if (receipt.status === 'conflict')
          return { status: 'rejected', reason: 'idempotency_conflict' };
        if (receipt.status === 'replayed') {
          const member = await loadMemberDetail(tx, {
            businessId: input.businessId,
            membershipId: receipt.aggregateId,
            now: input.now,
          });
          return member === null
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: { member, revokedSessionCount: 0 },
              };
        }

        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: true,
        });
        if (actor.status === 'rejected') return actor;

        const [current] = await tx
          .select()
          .from(auth.workforceMemberships)
          .where(
            and(
              eq(auth.workforceMemberships.id, input.membershipId),
              eq(auth.workforceMemberships.businessId, input.businessId),
            ),
          )
          .for('update')
          .limit(1);
        if (current === undefined)
          return { status: 'rejected', reason: 'not_found' };
        if (current.version !== input.expectedVersion)
          return {
            status: 'rejected',
            reason: 'stale_version',
            currentVersion: current.version,
          };
        const member = await loadMemberDetail(tx, {
          businessId: input.businessId,
          membershipId: current.id,
          now: input.now,
        });
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const role = targetRole(member);
        if (role === null)
          return { status: 'rejected', reason: 'invalid_state' };
        const denied = authorizeWorkforceTarget({
          actor,
          actorRef: input.actor,
          businessId: input.businessId,
          targetIdentityId: current.identityId,
          targetRole: role,
          targetLocationId:
            role === 'operator'
              ? targetLocationForActor(member, actor.locationIds)
              : null,
        });
        if (denied !== null) return { status: 'rejected', reason: denied };

        const edge = decideWorkforceMembership(current.state, input.event);
        if (edge.kind === 'denied')
          return { status: 'rejected', reason: 'invalid_state' };

        if (
          role === 'owner' &&
          (input.event === 'suspend' || input.event === 'end')
        ) {
          const [owners] = await tx
            .select({
              value: sql<number>`count(distinct ${auth.workforceMemberships.id})::int`,
            })
            .from(auth.workforceMemberships)
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
                eq(auth.workforceMemberships.businessId, input.businessId),
                eq(auth.workforceMemberships.state, 'active'),
                eq(auth.authAccessGrants.role, 'owner'),
                eq(auth.authAccessGrants.state, 'active'),
                or(
                  isNull(auth.authAccessGrants.startsAt),
                  lte(auth.authAccessGrants.startsAt, input.now),
                ),
                or(
                  isNull(auth.authAccessGrants.endsAt),
                  gt(auth.authAccessGrants.endsAt, input.now),
                ),
              ),
            );
          if ((owners?.value ?? 0) <= 1)
            return { status: 'rejected', reason: 'last_owner' };
        }

        const version = current.version + 1;
        const reason = input.reason ?? 'access_changed';
        const [updated] = await tx
          .update(auth.workforceMemberships)
          .set(
            input.event === 'suspend'
              ? {
                  state: edge.to,
                  version,
                  suspendedAt: input.now,
                  suspendedByIdentityId: input.actor.identityId,
                  suspensionReason: reason,
                  updatedAt: input.now,
                }
              : input.event === 'reactivate'
                ? {
                    state: edge.to,
                    version,
                    suspendedAt: null,
                    suspendedByIdentityId: null,
                    suspensionReason: null,
                    updatedAt: input.now,
                  }
                : {
                    state: edge.to,
                    version,
                    endedAt: input.now,
                    endedByIdentityId: input.actor.identityId,
                    endReason: reason,
                    updatedAt: input.now,
                  },
          )
          .where(eq(auth.workforceMemberships.id, current.id))
          .returning();
        if (updated === undefined)
          throw databaseFailure(
            'workforce membership transition returned no row',
          );

        const revokedSessions =
          input.event === 'reactivate'
            ? []
            : await tx
                .update(auth.authSessions)
                .set({ revokedAt: input.now })
                .where(
                  and(
                    eq(auth.authSessions.identityId, current.identityId),
                    isNull(auth.authSessions.revokedAt),
                  ),
                )
                .returning({ id: auth.authSessions.id });
        await recordTransition(tx, {
          businessId: input.businessId,
          aggregateKind: 'membership',
          aggregateId: current.id,
          fromState: edge.from,
          toState: edge.to,
          eventType: edge.event,
          aggregateVersion: version,
          idempotencyKey: input.idempotencyKey,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          reasonCode: `membership_${input.event}`,
          reasonNote: input.reason,
          now: input.now,
        });
        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'membership',
          aggregateId: current.id,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: {
            membershipId: current.id,
            revokedSessionCount: revokedSessions.length,
          },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType: `auth.workforce_membership_${input.event}`,
          resourceType: 'workforce_membership',
          resourceId: current.id,
          metadata: { revokedSessionCount: revokedSessions.length },
          now: input.now,
        });
        const detail = await loadMemberDetail(tx, {
          businessId: input.businessId,
          membershipId: current.id,
          now: input.now,
        });
        if (detail === null)
          throw databaseFailure(
            'workforce membership detail missing after transition',
          );
        return {
          status: 'applied',
          value: {
            member: detail,
            revokedSessionCount: revokedSessions.length,
          },
        };
      }),
    ),
});
