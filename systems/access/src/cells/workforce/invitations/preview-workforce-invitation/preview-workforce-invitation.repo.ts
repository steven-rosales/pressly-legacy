import { type PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import { runDatabaseOperation } from '../../../../postgres/database-operation/database-operation.adapter.ts';
import { lockBusiness } from '../../../../postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import { recordTransition } from '../../../../postgres/workforce-transition/workforce-transition.repo.ts';
import { commandFingerprint } from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import type { WorkforceRole } from '../../../../model/language/workforce/workforce.model.ts';
import type { PreviewWorkforceInvitationStore } from './preview-workforce-invitation.port.ts';
import type { AccessSchema } from '../../../../schema/public.ts';

export const makePreviewWorkforceInvitationStore = (
  db: PostgresDatabase,
  access: AccessSchema,
): PreviewWorkforceInvitationStore => {
  const auth = access;
  const business = access;
  return {
    preview: async (tokenHash, now) =>
      runDatabaseOperation(async () =>
        db.transaction(async (tx) => {
          const [located] = await tx
            .select({
              id: auth.workforceInvitations.id,
              businessId: auth.workforceInvitations.businessId,
            })
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.tokenHash, tokenHash))
            .limit(1);
          if (located === undefined)
            return { status: 'rejected', reason: 'invalid_token' };
          await lockBusiness(tx, located.businessId);
          const [invitation] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, located.id))
            .for('update')
            .limit(1);
          if (invitation === undefined)
            return { status: 'rejected', reason: 'invalid_token' };

          if (invitation.state !== 'pending')
            return { status: 'rejected', reason: 'invalid_state' };
          if (invitation.expiresAt <= now) {
            const version = invitation.version + 1;
            const idempotencyKey = `system:invitation-expire:${invitation.id}:${version}`;
            const commandHash = commandFingerprint('expire_invitation', {
              invitationId: invitation.id,
              version,
            });
            await tx
              .update(auth.workforceInvitations)
              .set({
                state: 'expired',
                version,
                expiredAt: now,
                updatedAt: now,
              })
              .where(
                and(
                  eq(auth.workforceInvitations.id, invitation.id),
                  eq(auth.workforceInvitations.state, 'pending'),
                ),
              );
            await recordTransition(tx, auth, {
              businessId: invitation.businessId,
              aggregateKind: 'invitation',
              aggregateId: invitation.id,
              fromState: 'pending',
              toState: 'expired',
              eventType: 'expire',
              aggregateVersion: version,
              idempotencyKey,
              commandHash,
              actorKind: 'system',
              reasonCode: 'expired_at_deadline',
              now,
            });
            return { status: 'rejected', reason: 'expired_token' };
          }

          const [identity] = await tx
            .select({ id: auth.authIdentities.id })
            .from(auth.authIdentities)
            .where(
              eq(
                auth.authIdentities.emailNormalized,
                invitation.emailNormalized,
              ),
            )
            .limit(1);
          const [businessRecord] = await tx
            .select({ name: business.businessAccounts.displayName })
            .from(business.businessAccounts)
            .where(eq(business.businessAccounts.id, invitation.businessId))
            .limit(1);

          return {
            status: 'available',
            value: {
              invitationId: invitation.id,
              businessId: invitation.businessId,
              businessName: businessRecord?.name ?? 'Pressly',
              emailNormalized: invitation.emailNormalized,
              displayName: invitation.displayName,
              intendedRole: invitation.intendedRole as WorkforceRole,
              intendedLocationId: invitation.intendedLocationId,
              expiresAt: invitation.expiresAt,
              existingIdentity: identity !== undefined,
            },
          };
        }),
      ),
  };
};
