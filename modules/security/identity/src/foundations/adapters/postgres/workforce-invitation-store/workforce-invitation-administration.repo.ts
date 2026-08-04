import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import {
  checkReceipt,
  loadAuthorizedActor,
  locationBelongsToBusiness,
  lockBusiness,
  recordAudit,
  recordReceipt,
  recordTransition,
} from '../identity-store/workforce-store.repo.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../identity-store/database-result.adapter.ts';
import { authorizeWorkforceTarget } from '../../../language/workforce-authority/workforce-authority.policy.ts';
import { decideWorkforceInvitation } from '../../../language/workforce-invitation/workforce-invitation.lifecycle.ts';
import { isWorkforceRole } from '../../../language/workforce-command/workforce-command.policy.ts';
import { toWorkforceInvitationSummary } from './workforce-invitation.persistence.mapper.ts';
import type { WorkforceInvitationStore } from '../../../ports/workforce-invitation-store/workforce-invitation-store.port.ts';

type WorkforceInvitationAdministrationStore = Pick<
  WorkforceInvitationStore,
  'issue' | 'reissue' | 'revoke'
>;

export const makeWorkforceInvitationAdministrationStore = (
  db: Database,
): WorkforceInvitationAdministrationStore => ({
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
                value: toWorkforceInvitationSummary(existing),
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
          value: toWorkforceInvitationSummary(created),
        };
      }),
    ),

  reissue: async (input) =>
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
          const [replacement] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          return replacement === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: toWorkforceInvitationSummary(replacement),
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
          .from(auth.workforceInvitations)
          .where(
            and(
              eq(auth.workforceInvitations.id, input.invitationId),
              eq(auth.workforceInvitations.businessId, input.businessId),
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
        if (!isWorkforceRole(current.intendedRole))
          return { status: 'rejected', reason: 'invalid_state' };
        const edge = decideWorkforceInvitation(current.state, 'revoke');
        if (edge.kind === 'denied')
          return { status: 'rejected', reason: 'invalid_state' };
        const denied = authorizeWorkforceTarget({
          actor,
          actorRef: input.actor,
          businessId: input.businessId,
          targetRole: current.intendedRole,
          targetLocationId: current.intendedLocationId,
        });
        if (denied !== null) return { status: 'rejected', reason: denied };

        const revokedVersion = current.version + 1;
        await tx
          .update(auth.workforceInvitations)
          .set({
            state: 'revoked',
            version: revokedVersion,
            revokedAt: input.now,
            revokedByIdentityId: input.actor.identityId,
            updatedAt: input.now,
          })
          .where(eq(auth.workforceInvitations.id, current.id));
        await recordTransition(tx, {
          businessId: input.businessId,
          aggregateKind: 'invitation',
          aggregateId: current.id,
          fromState: edge.from,
          toState: edge.to,
          eventType: edge.event,
          aggregateVersion: revokedVersion,
          idempotencyKey: input.idempotencyKey,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          reasonCode: 'reissued',
          now: input.now,
        });

        const [replacement] = await tx
          .insert(auth.workforceInvitations)
          .values({
            businessId: current.businessId,
            emailNormalized: current.emailNormalized,
            displayName: current.displayName,
            intendedRole: current.intendedRole,
            intendedLocationId: current.intendedLocationId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            createdByIdentityId: input.actor.identityId,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        if (replacement === undefined)
          throw databaseFailure(
            'workforce invitation replacement returned no row',
          );

        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'invitation',
          aggregateId: replacement.id,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: {
            invitationId: replacement.id,
            replacedInvitationId: current.id,
          },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType: 'auth.workforce_invitation_reissued',
          resourceType: 'workforce_invitation',
          resourceId: replacement.id,
          metadata: { replacedInvitationId: current.id },
          now: input.now,
        });

        return {
          status: 'applied',
          value: toWorkforceInvitationSummary(replacement),
        };
      }),
    ),

  revoke: async (input) =>
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
                value: toWorkforceInvitationSummary(existing),
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
          .from(auth.workforceInvitations)
          .where(
            and(
              eq(auth.workforceInvitations.id, input.invitationId),
              eq(auth.workforceInvitations.businessId, input.businessId),
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
        if (!isWorkforceRole(current.intendedRole))
          return { status: 'rejected', reason: 'invalid_state' };
        const edge = decideWorkforceInvitation(current.state, 'revoke');
        if (edge.kind === 'denied')
          return { status: 'rejected', reason: 'invalid_state' };
        const denied = authorizeWorkforceTarget({
          actor,
          actorRef: input.actor,
          businessId: input.businessId,
          targetRole: current.intendedRole,
          targetLocationId: current.intendedLocationId,
        });
        if (denied !== null) return { status: 'rejected', reason: denied };

        const version = current.version + 1;
        const [updated] = await tx
          .update(auth.workforceInvitations)
          .set({
            state: 'revoked',
            version,
            revokedAt: input.now,
            revokedByIdentityId: input.actor.identityId,
            updatedAt: input.now,
          })
          .where(eq(auth.workforceInvitations.id, current.id))
          .returning();
        if (updated === undefined)
          throw databaseFailure('workforce invitation revoke returned no row');
        await recordTransition(tx, {
          businessId: input.businessId,
          aggregateKind: 'invitation',
          aggregateId: current.id,
          fromState: edge.from,
          toState: edge.to,
          eventType: edge.event,
          aggregateVersion: version,
          idempotencyKey: input.idempotencyKey,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          reasonCode: 'revoked_by_manager',
          reasonNote: input.reason,
          now: input.now,
        });
        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'invitation',
          aggregateId: current.id,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: { invitationId: current.id },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType: 'auth.workforce_invitation_revoked',
          resourceType: 'workforce_invitation',
          resourceId: current.id,
          now: input.now,
        });
        return {
          status: 'applied',
          value: toWorkforceInvitationSummary(updated),
        };
      }),
    ),
});
