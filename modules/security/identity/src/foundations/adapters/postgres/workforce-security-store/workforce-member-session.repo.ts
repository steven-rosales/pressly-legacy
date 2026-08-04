import { type Database } from '@pressly/db/client';
import { and, desc, eq, gt, isNull } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import {
  checkReceipt,
  loadAuthorizedActor,
  loadMemberDetail,
  lockBusiness,
  recordAudit,
  recordReceipt,
} from '../identity-store/workforce-store.repo.ts';
import { runDatabaseOperation } from '../identity-store/database-result.adapter.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  decideWorkforceSessionAdministration,
  strongestWorkforceRole,
} from '../../../language/workforce-authority/workforce-authority.policy.ts';
import type { WorkforceMemberDetail } from '../../../language/workforce-membership/workforce-membership.model.ts';
import type { WorkforceSecurityStore } from '../../../ports/workforce-security-store/workforce-security-store.port.ts';
import type { JsonObject } from '@pressly/codec';

type WorkforceMemberSessionStore = Pick<
  WorkforceSecurityStore,
  'listMemberSessions' | 'revokeMemberSessions'
>;

const effectiveTargetRole = (member: WorkforceMemberDetail) =>
  strongestWorkforceRole(
    member.grants
      .filter((grant) => grant.effective)
      .map((grant) => ({ role: grant.role })),
  );

const effectiveTargetLocations = (
  member: WorkforceMemberDetail,
): readonly string[] =>
  member.grants
    .filter(
      (grant) =>
        grant.effective &&
        grant.role === 'operator' &&
        grant.scope.kind === 'location',
    )
    .map((grant) => grant.scope.id);

const sessionTargetDenied = (
  actor: Readonly<{
    role: 'owner' | 'manager';
    locationIds: readonly string[];
  }>,
  member: WorkforceMemberDetail,
) => {
  const decision = decideWorkforceSessionAdministration({
    actor: {
      identityActive: true,
      membershipState: 'active',
      businessId: member.businessId,
      role: actor.role,
      locationIds: actor.locationIds,
      assuranceLevel: 'mfa',
    },
    targetBusinessId: member.businessId,
    targetRole: effectiveTargetRole(member),
    targetLocationIds: effectiveTargetLocations(member),
  });
  return decision.kind === 'denied' ? decision.reason : null;
};

const replayedCount = (metadata: JsonObject): number => {
  const revokedCount = metadata['revokedCount'];
  if (
    typeof revokedCount === 'number' &&
    Number.isSafeInteger(revokedCount) &&
    revokedCount >= 0
  )
    return revokedCount;
  throw invariantViolationError({
    code: 'workforce_session_receipt_metadata_invalid',
    message: 'Stored workforce session receipt metadata is invalid.',
  });
};

export const makeWorkforceMemberSessionStore = (
  db: Database,
): WorkforceMemberSessionStore => ({
  listMemberSessions: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
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
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const denied = sessionTargetDenied(actor, member);
        if (denied !== null)
          return {
            status: 'rejected',
            reason: denied,
          };

        const sessions = await tx
          .select({
            id: auth.authSessions.id,
            issuedAt: auth.authSessions.issuedAt,
            lastUsedAt: auth.authSessions.lastUsedAt,
            expiresAt: auth.authSessions.expiresAt,
            revokedAt: auth.authSessions.revokedAt,
          })
          .from(auth.authSessions)
          .where(eq(auth.authSessions.identityId, member.identityId))
          .orderBy(
            desc(auth.authSessions.issuedAt),
            desc(auth.authSessions.id),
          );
        return {
          status: 'found',
          sessions: sessions.map((session) => ({
            ...session,
            current: session.id === input.actor.sessionId,
          })),
        };
      }),
    ),

  revokeMemberSessions: async (input) =>
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
        if (receipt.status === 'replayed')
          return {
            status: 'replayed',
            value: { revokedCount: replayedCount(receipt.resultMetadata) },
          };

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
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const denied = sessionTargetDenied(actor, member);
        if (denied !== null)
          return {
            status: 'rejected',
            reason: denied,
          };

        const selectedSession =
          input.sessionId === undefined
            ? undefined
            : eq(auth.authSessions.id, input.sessionId);
        const revoked = await tx
          .update(auth.authSessions)
          .set({ revokedAt: input.now })
          .where(
            and(
              eq(auth.authSessions.identityId, member.identityId),
              isNull(auth.authSessions.revokedAt),
              gt(auth.authSessions.expiresAt, input.now),
              selectedSession,
            ),
          )
          .returning({ id: auth.authSessions.id });

        await recordReceipt(tx, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'workforce_session_revoke',
          aggregateId: member.membershipId,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: { revokedCount: revoked.length },
          now: input.now,
        });
        await recordAudit(tx, {
          businessId: input.businessId,
          actorIdentityId: input.actor.identityId,
          eventType:
            input.sessionId === undefined
              ? 'auth.workforce_sessions_revoked'
              : 'auth.workforce_session_revoked',
          resourceType: 'workforce_membership',
          resourceId: member.membershipId,
          metadata: { revokedCount: revoked.length },
          now: input.now,
        });
        return {
          status: 'applied',
          value: { revokedCount: revoked.length },
        };
      }),
    ),
});
