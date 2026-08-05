import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { grantSummary } from '../../../../foundations/adapters/postgres/access-grant-read/access-grant.persistence.mapper.ts';
import { recordAudit } from '../../../../foundations/adapters/postgres/workforce-audit/workforce-audit.repo.ts';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { lockBusiness } from '../../../../foundations/adapters/postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../foundations/adapters/postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { locationBelongsToBusiness } from '../../../../foundations/adapters/postgres/workforce-location-read/workforce-location-read.repo.ts';
import { loadMemberDetail } from '../../../../foundations/adapters/postgres/workforce-member-read/workforce-member-read.repo.ts';
import { authorizeWorkforceTarget } from '../../../../foundations/language/workforce-authority/workforce-authority.policy.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import type { GrantWorkforceAccessStore } from './grant-workforce-access.port.ts';

export const makeGrantWorkforceAccessStore = (
  db: Database,
): GrantWorkforceAccessStore => ({
  grant: async (input) =>
    runDatabaseOperation(async () =>
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

        const denied = authorizeWorkforceTarget({
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
});
