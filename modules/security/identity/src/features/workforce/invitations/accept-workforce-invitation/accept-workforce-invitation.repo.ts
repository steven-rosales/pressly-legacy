import { type Database } from '@pressly/db/client';
import { and, eq, gt, isNull } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { recordAudit } from '../../../../foundations/adapters/postgres/workforce-audit/workforce-audit.repo.ts';
import { lockBusiness } from '../../../../foundations/adapters/postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../foundations/adapters/postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { recordTransition } from '../../../../foundations/adapters/postgres/workforce-transition/workforce-transition.repo.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { toWorkforceInvitationEntity } from '../../../../foundations/adapters/postgres/workforce-invitation-read/workforce-invitation.persistence.mapper.ts';
import { isWorkforceGrantEffective } from '../../../../foundations/language/workforce-authority/workforce-authority.policy.ts';
import {
  commandFingerprint,
  isWorkforceRole,
} from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import { readAcceptedInvitationReceipt } from './accept-workforce-invitation.persistence.mapper.ts';
import type {
  AcceptedInvitation,
  AcceptWorkforceInvitationStore,
} from './accept-workforce-invitation.port.ts';

export const makeAcceptWorkforceInvitationStore = (
  db: Database,
): AcceptWorkforceInvitationStore => ({
  accept: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        let receipt = await checkReceipt(
          tx,
          input.idempotencyKey,
          input.commandHash,
        );
        if (receipt.status === 'conflict')
          return { status: 'rejected', reason: 'idempotency_conflict' };
        if (receipt.status === 'replayed') {
          const metadata = readAcceptedInvitationReceipt(
            receipt.resultMetadata,
          );
          const [invitation] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          if (invitation === undefined || metadata === null)
            return { status: 'rejected', reason: 'not_found' };
          return {
            status: 'replayed',
            value: {
              invitation: toWorkforceInvitationEntity(invitation),
              identityId: metadata.identityId,
              membershipId: metadata.membershipId,
              identityCreated: metadata.identityCreated,
              privilegedAccessEffective: metadata.privilegedAccessEffective,
            },
          };
        }

        const [located] = await tx
          .select({
            id: auth.workforceInvitations.id,
            businessId: auth.workforceInvitations.businessId,
          })
          .from(auth.workforceInvitations)
          .where(eq(auth.workforceInvitations.tokenHash, input.tokenHash))
          .limit(1);
        if (located === undefined)
          return { status: 'rejected', reason: 'invalid_token' };
        await lockBusiness(tx, located.businessId);
        receipt = await checkReceipt(
          tx,
          input.idempotencyKey,
          input.commandHash,
        );
        if (receipt.status === 'conflict')
          return { status: 'rejected', reason: 'idempotency_conflict' };
        if (receipt.status === 'replayed') {
          const metadata = readAcceptedInvitationReceipt(
            receipt.resultMetadata,
          );
          const [invitation] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          if (invitation === undefined || metadata === null)
            return { status: 'rejected', reason: 'not_found' };
          return {
            status: 'replayed',
            value: {
              invitation: toWorkforceInvitationEntity(invitation),
              identityId: metadata.identityId,
              membershipId: metadata.membershipId,
              identityCreated: metadata.identityCreated,
              privilegedAccessEffective: metadata.privilegedAccessEffective,
            },
          };
        }
        const [current] = await tx
          .select()
          .from(auth.workforceInvitations)
          .where(eq(auth.workforceInvitations.id, located.id))
          .for('update')
          .limit(1);
        if (current === undefined)
          return { status: 'rejected', reason: 'invalid_token' };
        if (current.state !== 'pending')
          return { status: 'rejected', reason: 'invalid_state' };
        if (current.expiresAt <= input.now) {
          const version = current.version + 1;
          const idempotencyKey = `system:invitation-expire:${current.id}:${version}`;
          const commandHash = commandFingerprint('expire_invitation', {
            invitationId: current.id,
            version,
          });
          await tx
            .update(auth.workforceInvitations)
            .set({
              state: 'expired',
              version,
              expiredAt: input.now,
              updatedAt: input.now,
            })
            .where(eq(auth.workforceInvitations.id, current.id));
          await recordTransition(tx, {
            businessId: current.businessId,
            aggregateKind: 'invitation',
            aggregateId: current.id,
            fromState: 'pending',
            toState: 'expired',
            eventType: 'expire',
            aggregateVersion: version,
            idempotencyKey,
            commandHash,
            actorKind: 'system',
            reasonCode: 'expired_at_deadline',
            now: input.now,
          });
          return { status: 'rejected', reason: 'expired_token' };
        }
        if (!isWorkforceRole(current.intendedRole))
          return { status: 'rejected', reason: 'invalid_state' };

        const [existingIdentity] = await tx
          .select()
          .from(auth.authIdentities)
          .where(
            eq(auth.authIdentities.emailNormalized, current.emailNormalized),
          )
          .limit(1);

        let identityId: string;
        let identityCreated = false;
        if (existingIdentity !== undefined) {
          if (input.acceptance.kind === 'new_identity')
            return {
              status: 'rejected',
              reason: 'authentication_required',
            };
          if (
            existingIdentity.id !== input.acceptance.authenticatedIdentityId ||
            !existingIdentity.isActive
          )
            return {
              status: 'rejected',
              reason: 'wrong_authenticated_identity',
            };
          const [session] = await tx
            .select({ id: auth.authSessions.id })
            .from(auth.authSessions)
            .where(
              and(
                eq(
                  auth.authSessions.id,
                  input.acceptance.authenticatedSessionId,
                ),
                eq(auth.authSessions.identityId, existingIdentity.id),
                isNull(auth.authSessions.revokedAt),
                gt(auth.authSessions.expiresAt, input.now),
              ),
            )
            .limit(1);
          if (session === undefined)
            return {
              status: 'rejected',
              reason: 'authentication_required',
            };
          identityId = existingIdentity.id;
        } else {
          if (input.acceptance.kind === 'existing_identity')
            return {
              status: 'rejected',
              reason: 'wrong_authenticated_identity',
            };
          const [identity] = await tx
            .insert(auth.authIdentities)
            .values({
              kind: 'human',
              displayName: current.displayName,
              email: current.emailNormalized,
              emailNormalized: current.emailNormalized,
              isActive: true,
              createdAt: input.now,
              updatedAt: input.now,
            })
            .returning({ id: auth.authIdentities.id });
          if (identity === undefined)
            throw databaseFailure('invitation identity insert returned no row');
          identityId = identity.id;
          identityCreated = true;
          await tx.insert(auth.authPasswordCredentials).values({
            identityId,
            passwordHash: input.acceptance.passwordHash,
            passwordUpdatedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          });
        }

        const [currentMembership] = await tx
          .select({ id: auth.workforceMemberships.id })
          .from(auth.workforceMemberships)
          .where(
            and(
              eq(auth.workforceMemberships.businessId, current.businessId),
              eq(auth.workforceMemberships.identityId, identityId),
              isNull(auth.workforceMemberships.endedAt),
            ),
          )
          .limit(1);
        if (currentMembership !== undefined)
          return { status: 'rejected', reason: 'invalid_state' };

        const [membership] = await tx
          .insert(auth.workforceMemberships)
          .values({
            businessId: current.businessId,
            identityId,
            state: 'active',
            startedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        if (membership === undefined)
          throw databaseFailure('invitation membership insert returned no row');

        const scopeKind =
          current.intendedLocationId === null ? 'business' : 'location';
        const scopeId = current.intendedLocationId ?? current.businessId;
        const [grant] = await tx
          .insert(auth.authAccessGrants)
          .values({
            businessId: current.businessId,
            membershipId: membership.id,
            identityId,
            role: current.intendedRole,
            scopeKind,
            scopeId,
            locationId: current.intendedLocationId,
            startsAt: input.now,
            createdByIdentityId: current.createdByIdentityId,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        if (grant === undefined)
          throw databaseFailure('invitation access grant returned no row');

        const [mfa] = await tx
          .select({ status: auth.authMfaCredentials.status })
          .from(auth.authMfaCredentials)
          .where(eq(auth.authMfaCredentials.identityId, identityId))
          .limit(1);
        const privilegedAccessEffective = isWorkforceGrantEffective({
          state: grant.state,
          role: current.intendedRole,
          membershipState: membership.state,
          mfaEnabled: mfa?.status === 'enabled',
          now: input.now,
          startsAt: grant.startsAt,
          endsAt: grant.endsAt,
        });
        const version = current.version + 1;
        const [accepted] = await tx
          .update(auth.workforceInvitations)
          .set({
            state: 'accepted',
            version,
            acceptedAt: input.now,
            acceptedByIdentityId: identityId,
            updatedAt: input.now,
          })
          .where(eq(auth.workforceInvitations.id, current.id))
          .returning();
        if (accepted === undefined)
          throw databaseFailure('workforce invitation accept returned no row');
        await recordTransition(tx, {
          businessId: current.businessId,
          aggregateKind: 'invitation',
          aggregateId: current.id,
          fromState: 'pending',
          toState: 'accepted',
          eventType: 'accept',
          aggregateVersion: version,
          idempotencyKey: input.idempotencyKey,
          commandHash: input.commandHash,
          actorIdentityId: identityId,
          reasonCode: 'accepted_by_invitee',
          now: input.now,
        });
        const acceptedValue: AcceptedInvitation = {
          invitation: toWorkforceInvitationEntity(accepted),
          identityId,
          membershipId: membership.id,
          identityCreated,
          privilegedAccessEffective,
        };
        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: current.businessId,
          aggregateKind: 'invitation',
          aggregateId: current.id,
          commandHash: input.commandHash,
          actorIdentityId: identityId,
          resultMetadata: {
            identityId,
            membershipId: membership.id,
            identityCreated,
            privilegedAccessEffective,
          },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: current.businessId,
          actorIdentityId: identityId,
          eventType: 'auth.workforce_invitation_accepted',
          resourceType: 'workforce_invitation',
          resourceId: current.id,
          metadata: {
            membershipId: membership.id,
            role: current.intendedRole,
          },
          now: input.now,
        });
        return { status: 'applied', value: acceptedValue };
      }),
    ),
});
