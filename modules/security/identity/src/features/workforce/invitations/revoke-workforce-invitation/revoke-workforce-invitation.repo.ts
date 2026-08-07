import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { recordAudit } from '../../../../foundations/adapters/postgres/workforce-audit/workforce-audit.repo.ts';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { lockBusiness } from '../../../../foundations/adapters/postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../foundations/adapters/postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { recordTransition } from '../../../../foundations/adapters/postgres/workforce-transition/workforce-transition.repo.ts';
import { toWorkforceInvitationEntity } from '../../../../foundations/adapters/postgres/workforce-invitation-read/workforce-invitation.persistence.mapper.ts';
import { authorizeWorkforceTarget } from '../../../../foundations/language/workforce-authority/workforce-authority.policy.ts';
import { isWorkforceRole } from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import { decideWorkforceInvitation } from '../../../../foundations/language/workforce-invitation/workforce-invitation.lifecycle.ts';
import type { RevokeWorkforceInvitationStore } from './revoke-workforce-invitation.port.ts';

export const makeRevokeWorkforceInvitationStore = (
  db: Database,
): RevokeWorkforceInvitationStore => ({
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
          value: toWorkforceInvitationEntity(updated),
        };
      }),
    ),
});
