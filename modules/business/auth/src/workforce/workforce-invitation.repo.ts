import {
  and,
  auth,
  business,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  type Database,
} from '@pressly/db';
import {
  authorizeWorkforceTarget,
  isWorkforceGrantEffective,
} from './workforce-authority.policy.ts';
import { commandFingerprint } from './workforce-validation.policy.ts';
import { encodeWorkforceCursor } from './workforce-pagination.policy.ts';
import type { WorkforceRole } from './workforce.port.ts';
import {
  checkReceipt,
  invitationSummary,
  loadAuthorizedActor,
  locationBelongsToBusiness,
  lockBusiness,
  recordAudit,
  recordReceipt,
  recordTransition,
} from './workforce-store.repo.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../persistence/database-result.ts';
import { decideWorkforceInvitation } from './workforce-invitation.policy.ts';
import type {
  AcceptedInvitation,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

const validRole = (role: string): role is WorkforceRole =>
  role === 'owner' || role === 'manager' || role === 'operator';

export const makeWorkforceInvitationStore = (
  db: Database,
): WorkforceInvitationStore => ({
  issue: async (input) =>
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
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          return existing === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: invitationSummary(existing),
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

        return { status: 'applied', value: invitationSummary(created) };
      }),
    ),

  reissue: async (input) =>
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
          const [replacement] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          return replacement === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: invitationSummary(replacement),
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
        if (!validRole(current.intendedRole))
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
          value: invitationSummary(replacement),
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
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          return existing === undefined
            ? { status: 'rejected', reason: 'not_found' }
            : {
                status: 'replayed',
                value: invitationSummary(existing),
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
        if (!validRole(current.intendedRole))
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
        return { status: 'applied', value: invitationSummary(updated) };
      }),
    ),

  preview: async (tokenHash, now) =>
    toDatabaseResult(async () =>
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
          await recordTransition(tx, {
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
            eq(auth.authIdentities.emailNormalized, invitation.emailNormalized),
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

  accept: async (input) =>
    toDatabaseResult(async () =>
      db.transaction(async (tx) => {
        let receipt = await checkReceipt(
          tx,
          input.idempotencyKey,
          input.commandHash,
        );
        if (receipt.status === 'conflict')
          return { status: 'rejected', reason: 'idempotency_conflict' };
        if (receipt.status === 'replayed') {
          const metadata =
            receipt.resultMetadata as Partial<AcceptedInvitation>;
          const [invitation] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          if (
            invitation === undefined ||
            typeof metadata.identityId !== 'string' ||
            typeof metadata.membershipId !== 'string'
          )
            return { status: 'rejected', reason: 'not_found' };
          return {
            status: 'replayed',
            value: {
              invitation: invitationSummary(invitation),
              identityId: metadata.identityId,
              membershipId: metadata.membershipId,
              identityCreated: metadata.identityCreated === true,
              privilegedAccessEffective:
                metadata.privilegedAccessEffective === true,
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
          const metadata =
            receipt.resultMetadata as Partial<AcceptedInvitation>;
          const [invitation] = await tx
            .select()
            .from(auth.workforceInvitations)
            .where(eq(auth.workforceInvitations.id, receipt.aggregateId))
            .limit(1);
          if (
            invitation === undefined ||
            typeof metadata.identityId !== 'string' ||
            typeof metadata.membershipId !== 'string'
          )
            return { status: 'rejected', reason: 'not_found' };
          return {
            status: 'replayed',
            value: {
              invitation: invitationSummary(invitation),
              identityId: metadata.identityId,
              membershipId: metadata.membershipId,
              identityCreated: metadata.identityCreated === true,
              privilegedAccessEffective:
                metadata.privilegedAccessEffective === true,
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
        if (!validRole(current.intendedRole))
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
          invitation: invitationSummary(accepted),
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
            invitations: [],
            nextCursor: null,
          };
        const invitations = await tx
          .select()
          .from(auth.workforceInvitations)
          .where(
            and(
              eq(auth.workforceInvitations.businessId, input.businessId),
              input.includeTerminal
                ? undefined
                : eq(auth.workforceInvitations.state, 'pending'),
              actor.role === 'manager'
                ? and(
                    eq(auth.workforceInvitations.intendedRole, 'operator'),
                    inArray(
                      auth.workforceInvitations.intendedLocationId,
                      actor.locationIds,
                    ),
                  )
                : undefined,
              input.cursor === undefined
                ? undefined
                : or(
                    lt(
                      auth.workforceInvitations.createdAt,
                      input.cursor.createdAt,
                    ),
                    and(
                      eq(
                        auth.workforceInvitations.createdAt,
                        input.cursor.createdAt,
                      ),
                      lt(auth.workforceInvitations.id, input.cursor.id),
                    ),
                  ),
            ),
          )
          .orderBy(
            desc(auth.workforceInvitations.createdAt),
            desc(auth.workforceInvitations.id),
          )
          .limit(input.limit + 1);
        const page = invitations.slice(0, input.limit);
        const last = page.at(-1);
        return {
          status: 'found',
          invitations: page.map(invitationSummary),
          nextCursor:
            invitations.length > input.limit && last !== undefined
              ? encodeWorkforceCursor({
                  createdAt: last.createdAt,
                  id: last.id,
                })
              : null,
        };
      }),
    ),
});
