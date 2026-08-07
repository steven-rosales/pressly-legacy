import { type Database, type DatabaseTransaction } from '@pressly/db/client';
import { and, eq, gt, isNull, lte, or, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { UnitOfWork } from '@pressly/kernel';
import { recordAudit } from '../../../../foundations/adapters/postgres/workforce-audit/workforce-audit.repo.ts';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { lockBusiness } from '../../../../foundations/adapters/postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../foundations/adapters/postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { loadMemberDetail } from '../../../../foundations/adapters/postgres/workforce-member-read/workforce-member-read.repo.ts';
import { recordTransition } from '../../../../foundations/adapters/postgres/workforce-transition/workforce-transition.repo.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { authorizeWorkforceTarget } from '../../../../foundations/language/workforce-authority/workforce-authority.policy.ts';
import { decideWorkforceMembership } from '../../../../foundations/language/workforce-membership/workforce-membership.lifecycle.ts';
import {
  targetLocationForActor,
  targetRole,
} from '../../../../foundations/language/workforce-authority/workforce-membership-authorization.policy.ts';
import type { TransitionWorkforceMembershipStore } from './transition-workforce-membership.port.ts';

export const makeTransitionWorkforceMembershipStore = (
  db: Database,
  unitOfWork: UnitOfWork<DatabaseTransaction> = defineUnitOfWork(
    db,
    (transaction) => transaction,
  ),
): TransitionWorkforceMembershipStore => ({
  transition: async (input) =>
    runDatabaseOperation(async () =>
      unitOfWork.transaction(async (tx) => {
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
