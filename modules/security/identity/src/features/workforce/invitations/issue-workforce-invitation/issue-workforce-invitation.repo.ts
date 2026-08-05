import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import {
  runDatabaseOperation,
  databaseFailure,
} from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { recordAudit } from '../../../../foundations/adapters/postgres/workforce-audit/workforce-audit.repo.ts';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { lockBusiness } from '../../../../foundations/adapters/postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../foundations/adapters/postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { locationBelongsToBusiness } from '../../../../foundations/adapters/postgres/workforce-location-read/workforce-location-read.repo.ts';
import { toWorkforceInvitationEntity } from '../../../../foundations/adapters/postgres/workforce-invitation-read/workforce-invitation.persistence.mapper.ts';
import { authorizeWorkforceTarget } from '../../../../foundations/language/workforce-authority/workforce-authority.policy.ts';
import type { IssueWorkforceInvitationStore } from './issue-workforce-invitation.port.ts';

export const makeIssueWorkforceInvitationStore = (
  db: Database,
): IssueWorkforceInvitationStore => ({
  issue: async (input) =>
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
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          return existing === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: toWorkforceInvitationEntity(existing),
              };
        }

        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: true,
        });
        if (actor.status === 'rejected') return actor;
        if (
          !(await locationBelongsToBusiness(
            tx,
            input.businessId,
            input.intendedLocationId,
          ))
        )
          return { status: 'rejected', reason: 'outside_location' };

        const [targetIdentity] = await tx
          .select({ id: auth.authIdentities.id })
          .from(auth.authIdentities)
          .where(eq(auth.authIdentities.emailNormalized, input.emailNormalized))
          .limit(1);
        const denied = authorizeWorkforceTarget({
          actor,
          actorRef: input.actor,
          businessId: input.businessId,
          ...(targetIdentity === undefined
            ? {}
            : { targetIdentityId: targetIdentity.id }),
          targetRole: input.intendedRole,
          targetLocationId: input.intendedLocationId,
        });
        if (denied !== null) return { status: 'rejected', reason: denied };

        const [pending] = await tx
          .select({ id: auth.workforceInvitations.id })
          .from(auth.workforceInvitations)
          .where(
            and(
              eq(auth.workforceInvitations.businessId, input.businessId),
              eq(
                auth.workforceInvitations.emailNormalized,
                input.emailNormalized,
              ),
              eq(auth.workforceInvitations.state, 'pending'),
            ),
          )
          .limit(1);
        if (pending !== undefined)
          return { status: 'rejected', reason: 'email_conflict' };

        const [created] = await tx
          .insert(auth.workforceInvitations)
          .values({
            businessId: input.businessId,
            emailNormalized: input.emailNormalized,
            displayName: input.displayName,
            intendedRole: input.intendedRole,
            intendedLocationId: input.intendedLocationId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            createdByIdentityId: input.actor.identityId,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        if (created === undefined)
          throw databaseFailure('workforce invitation insert returned no row');

        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'invitation',
          aggregateId: created.id,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: { invitationId: created.id },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType: 'auth.workforce_invitation_issued',
          resourceType: 'workforce_invitation',
          resourceId: created.id,
          metadata: {
            intendedRole: input.intendedRole,
            intendedLocationId: input.intendedLocationId,
          },
          now: input.now,
        });

        return {
          status: 'applied',
          value: toWorkforceInvitationEntity(created),
        };
      }),
    ),
});
