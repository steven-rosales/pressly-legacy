import {
  and,
  auth,
  desc,
  eq,
  gt,
  isNull,
  lt,
  or,
  type Database,
} from '@pressly/db';
import {
  checkReceipt,
  loadAuthorizedActor,
  loadMemberDetail,
  lockBusiness,
  recordAudit,
  recordReceipt,
  strongestRole,
} from '../persistence/workforce.shared.ts';
import { decideWorkforceSessionAdministration } from '../workforce-authority.policy.ts';
import { encodeWorkforceCursor } from '../workforce-pagination.policy.ts';
import type { WorkforceMemberDetail } from '../workforce.port.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../persistence/database-result.ts';
import type { WorkforceSecurityStore } from './workforce-security.port.ts';

const effectiveTargetRole = (member: WorkforceMemberDetail) =>
  strongestRole(
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

const replayedCount = (metadata: unknown): number => {
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    'revokedCount' in metadata &&
    typeof metadata.revokedCount === 'number' &&
    Number.isSafeInteger(metadata.revokedCount) &&
    metadata.revokedCount >= 0
  )
    return metadata.revokedCount;
  throw databaseFailure('workforce session receipt metadata is invalid');
};

export const makeWorkforceSecurityStore = (
  db: Database,
): WorkforceSecurityStore => ({
  listMemberSessions: async (input) =>
    toDatabaseResult(async () =>
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

  listSecurityEvents: async (input) =>
    toDatabaseResult(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: true,
        });
        if (actor.status === 'rejected') return actor;

        const rows = await tx
          .select({
            id: auth.authAuditEvents.id,
            eventType: auth.authAuditEvents.eventType,
            resourceType: auth.authAuditEvents.resourceType,
            actorDisplayName: auth.authIdentities.displayName,
            createdAt: auth.authAuditEvents.createdAt,
          })
          .from(auth.authAuditEvents)
          .leftJoin(
            auth.authIdentities,
            eq(
              auth.authIdentities.id,
              auth.authAuditEvents.principalIdentityId,
            ),
          )
          .where(
            and(
              eq(auth.authAuditEvents.businessId, input.businessId),
              input.cursor === undefined
                ? undefined
                : or(
                    lt(auth.authAuditEvents.createdAt, input.cursor.createdAt),
                    and(
                      eq(
                        auth.authAuditEvents.createdAt,
                        input.cursor.createdAt,
                      ),
                      lt(auth.authAuditEvents.id, input.cursor.id),
                    ),
                  ),
            ),
          )
          .orderBy(
            desc(auth.authAuditEvents.createdAt),
            desc(auth.authAuditEvents.id),
          )
          .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        const last = page.at(-1);
        return {
          status: 'found',
          events: page,
          nextCursor:
            rows.length > input.limit && last !== undefined
              ? encodeWorkforceCursor(last)
              : null,
        };
      }),
    ),
});
