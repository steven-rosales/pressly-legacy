import {
  and,
  auth,
  count,
  eq,
  gt,
  isNull,
  lte,
  ne,
  or,
  type Database,
} from '@pressly/db';
import {
  authorizeTarget,
  checkReceipt,
  grantSummary,
  loadAuthorizedActor,
  loadMemberDetail,
  locationBelongsToBusiness,
  lockBusiness,
  recordAudit,
  recordReceipt,
  recordTransition,
} from '../persistence/workforce.shared.ts';
import { decideAccessGrant } from './access-grant.policy.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../persistence/database-result.ts';
import type { AccessGrantStore } from './access-grant.port.ts';

export const makeAccessGrantStore = (db: Database): AccessGrantStore => ({
  grant: async (input) =>
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
          const [existing] = await tx
            .select()
            .from(auth.authAccessGrants)
            .where(eq(auth.authAccessGrants.id, receipt.aggregateId))
            .limit(1);
          return existing === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: grantSummary(existing, false),
              };
        }

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
        if (member === null || member.identityId !== input.identityId)
          return { status: 'rejected', reason: 'not_found' };
        if (member.state !== 'active')
          return {
            status: 'rejected',
            reason: 'invalid_state',
          };
        if (
          input.scope.kind === 'location' &&
          !(await locationBelongsToBusiness(
            tx,
            input.businessId,
            input.scope.id,
          ))
        )
          return {
            status: 'rejected',
            reason: 'outside_location',
          };
        if (
          (input.role === 'owner' && input.scope.kind !== 'business') ||
          (input.role === 'operator' && input.scope.kind !== 'location')
        )
          return { status: 'rejected', reason: 'invalid_state' };
        if (
          input.scope.kind === 'business' &&
          input.scope.id !== input.businessId
        )
          return { status: 'rejected', reason: 'outside_business' };

        const denied = authorizeTarget({
          actor,
          actorRef: input.actor,
          businessId: input.businessId,
          targetIdentityId: input.identityId,
          targetRole: input.role,
          targetLocationId:
            input.scope.kind === 'location' ? input.scope.id : null,
        });
        if (denied !== null) return { status: 'rejected', reason: denied };
        const [duplicate] = await tx
          .select({ id: auth.authAccessGrants.id })
          .from(auth.authAccessGrants)
          .where(
            and(
              eq(auth.authAccessGrants.membershipId, input.membershipId),
              eq(auth.authAccessGrants.role, input.role),
              eq(auth.authAccessGrants.scopeKind, input.scope.kind),
              eq(auth.authAccessGrants.scopeId, input.scope.id),
              eq(auth.authAccessGrants.state, 'active'),
            ),
          )
          .limit(1);
        if (duplicate !== undefined)
          return { status: 'rejected', reason: 'invalid_state' };

        const [created] = await tx
          .insert(auth.authAccessGrants)
          .values({
            businessId: input.businessId,
            membershipId: input.membershipId,
            identityId: input.identityId,
            role: input.role,
            scopeKind: input.scope.kind,
            scopeId: input.scope.id,
            locationId: input.scope.kind === 'location' ? input.scope.id : null,
            startsAt: input.startsAt ?? input.now,
            endsAt: input.endsAt,
            createdByIdentityId: input.actor.identityId,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        if (created === undefined)
          throw databaseFailure('workforce access grant returned no row');
        const effective =
          member.state === 'active' &&
          created.state === 'active' &&
          (created.role === 'operator' || member.mfaEnabled) &&
          created.startsAt !== null &&
          created.startsAt <= input.now &&
          (created.endsAt === null || created.endsAt > input.now);
        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'access_grant',
          aggregateId: created.id,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: { grantId: created.id },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType: 'auth.workforce_access_granted',
          resourceType: 'auth_access_grant',
          resourceId: created.id,
          metadata: {
            role: input.role,
            scopeKind: input.scope.kind,
            scopeId: input.scope.id,
            effective,
          },
          now: input.now,
        });
        return {
          status: 'applied',
          value: grantSummary(created, effective),
        };
      }),
    ),

  revoke: async (input) =>
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
          const [existing] = await tx
            .select()
            .from(auth.authAccessGrants)
            .where(eq(auth.authAccessGrants.id, receipt.aggregateId))
            .limit(1);
          return existing === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: {
                  grant: grantSummary(existing, false),
                  revokedSessionCount: 0,
                },
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
          .from(auth.authAccessGrants)
          .where(
            and(
              eq(auth.authAccessGrants.id, input.grantId),
              eq(auth.authAccessGrants.businessId, input.businessId),
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
        if (
          current.role !== 'owner' &&
          current.role !== 'manager' &&
          current.role !== 'operator'
        )
          return { status: 'rejected', reason: 'invalid_state' };
        const member = await loadMemberDetail(tx, {
          businessId: input.businessId,
          membershipId: current.membershipId,
          now: input.now,
        });
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const denied = authorizeTarget({
          actor,
          actorRef: input.actor,
          businessId: input.businessId,
          targetIdentityId: current.identityId,
          targetRole: current.role,
          targetLocationId: current.locationId,
        });
        if (denied !== null) return { status: 'rejected', reason: denied };
        const edge = decideAccessGrant(current.state, 'revoke');
        if (edge.kind === 'denied')
          return { status: 'rejected', reason: 'invalid_state' };

        if (current.role === 'owner') {
          const [otherOwners] = await tx
            .select({ value: count() })
            .from(auth.authAccessGrants)
            .innerJoin(
              auth.workforceMemberships,
              and(
                eq(
                  auth.workforceMemberships.id,
                  auth.authAccessGrants.membershipId,
                ),
                eq(
                  auth.workforceMemberships.businessId,
                  auth.authAccessGrants.businessId,
                ),
              ),
            )
            .where(
              and(
                eq(auth.authAccessGrants.businessId, input.businessId),
                eq(auth.authAccessGrants.role, 'owner'),
                eq(auth.authAccessGrants.state, 'active'),
                ne(auth.authAccessGrants.id, current.id),
                or(
                  isNull(auth.authAccessGrants.startsAt),
                  lte(auth.authAccessGrants.startsAt, input.now),
                ),
                or(
                  isNull(auth.authAccessGrants.endsAt),
                  gt(auth.authAccessGrants.endsAt, input.now),
                ),
                eq(auth.workforceMemberships.state, 'active'),
              ),
            );
          if ((otherOwners?.value ?? 0) === 0)
            return { status: 'rejected', reason: 'last_owner' };
        }

        const reason = input.reason ?? 'access_changed';
        const version = current.version + 1;
        const [updated] = await tx
          .update(auth.authAccessGrants)
          .set({
            state: 'revoked',
            version,
            revokedAt: input.now,
            revokedByIdentityId: input.actor.identityId,
            revocationReason: reason,
            updatedAt: input.now,
          })
          .where(eq(auth.authAccessGrants.id, current.id))
          .returning();
        if (updated === undefined)
          throw databaseFailure('access grant revoke returned no row');
        const revokedSessions = await tx
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
          aggregateKind: 'access_grant',
          aggregateId: current.id,
          fromState: edge.from,
          toState: edge.to,
          eventType: edge.event,
          aggregateVersion: version,
          idempotencyKey: input.idempotencyKey,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          reasonCode: 'access_revoked',
          reasonNote: input.reason,
          now: input.now,
        });
        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'access_grant',
          aggregateId: current.id,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: {
            grantId: current.id,
            revokedSessionCount: revokedSessions.length,
          },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType: 'auth.workforce_access_revoked',
          resourceType: 'auth_access_grant',
          resourceId: current.id,
          metadata: { revokedSessionCount: revokedSessions.length },
          now: input.now,
        });
        return {
          status: 'applied',
          value: {
            grant: grantSummary(updated, false),
            revokedSessionCount: revokedSessions.length,
          },
        };
      }),
    ),
});
