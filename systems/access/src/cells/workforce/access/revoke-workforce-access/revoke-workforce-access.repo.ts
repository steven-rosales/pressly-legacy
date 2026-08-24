import {
  type PostgresDatabase,
  type PostgresTransaction,
} from '@pressly/postgres/client';
import {
  and,
  count,
  eq,
  gt,
  isNull,
  lte,
  ne,
  or,
} from '@pressly/postgres/query';
import { defineUnitOfWork } from '@pressly/postgres/unit-of-work';
import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import { grantSummary } from '../../../../postgres/access-grant-read/access-grant.postgres.ts';
import { recordAudit } from '../../../../postgres/workforce-audit/workforce-audit.repo.ts';
import { loadAuthorizedActor } from '../../../../postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { lockBusiness } from '../../../../postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { loadMemberDetail } from '../../../../postgres/workforce-member-read/workforce-member-read.repo.ts';
import { recordTransition } from '../../../../postgres/workforce-transition/workforce-transition.repo.ts';
import { decideAccessGrant } from '../../../../model/language/access-grant/access-grant.lifecycle.ts';
import { authorizeWorkforceTarget } from '../../../../model/language/workforce-authority/workforce-authority.policy.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../postgres/database-operation/database-operation.adapter.ts';
import type { RevokeWorkforceAccessStore } from './revoke-workforce-access.port.ts';
import type { AccessSchema } from '../../../../schema/public.ts';

export const makeRevokeWorkforceAccessStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
  unitOfWork: UnitOfWork<PostgresTransaction> = defineUnitOfWork(
    db,
    (transaction) => transaction,
  ),
): RevokeWorkforceAccessStore => ({
  revoke: async (input) =>
    runDatabaseOperation(async () =>
      unitOfWork.transaction(async (tx) => {
        await lockBusiness(tx, input.businessId);
        const receipt = await checkReceipt(
          tx,
          auth,
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

        const actor = await loadAuthorizedActor(tx, auth, {
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
        const member = await loadMemberDetail(tx, auth, {
          businessId: input.businessId,
          membershipId: current.membershipId,
          now: input.now,
        });
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const denied = authorizeWorkforceTarget({
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
        await recordTransition(tx, auth, {
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
        await recordReceipt(tx, auth, {
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
        await recordAudit(tx, auth, {
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
