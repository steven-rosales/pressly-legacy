import type { JsonObject } from '@pressly/codec';
import { type PostgresDatabase } from '@pressly/postgres/client';
import { and, eq, gt, isNull } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import { runDatabaseOperation } from '../../../../postgres/database-operation/database-operation.adapter.ts';
import { recordAudit } from '../../../../postgres/workforce-audit/workforce-audit.repo.ts';
import { loadAuthorizedActor } from '../../../../postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { lockBusiness } from '../../../../postgres/workforce-business-lock/workforce-business-lock.repo.ts';
import {
  checkReceipt,
  recordReceipt,
} from '../../../../postgres/workforce-command-receipt/workforce-command-receipt.repo.ts';
import { loadMemberDetail } from '../../../../postgres/workforce-member-read/workforce-member-read.repo.ts';
import { workforceSessionTargetDenial } from '../../../../model/language/workforce-authority/workforce-session-authorization.policy.ts';
import type { RevokeWorkforceMemberSessionsStore } from './revoke-workforce-member-sessions.port.ts';
import type { AccessSchema } from '../../../../schema/public.ts';

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

export const makeRevokeWorkforceMemberSessionsStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): RevokeWorkforceMemberSessionsStore => ({
  revokeMemberSessions: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        await lockBusiness(tx, input.businessId);
        const receipt = await checkReceipt(
          tx,
          auth,
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

        const actor = await loadAuthorizedActor(tx, auth, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: true,
        });
        if (actor.status === 'rejected') return actor;
        const member = await loadMemberDetail(tx, auth, {
          businessId: input.businessId,
          membershipId: input.membershipId,
          now: input.now,
        });
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        const denied = workforceSessionTargetDenial(actor, member);
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

        await recordReceipt(tx, auth, {
          idempotencyKey: input.idempotencyKey,
          businessId: input.businessId,
          aggregateKind: 'workforce_session_revoke',
          aggregateId: member.membershipId,
          commandHash: input.commandHash,
          actorIdentityId: input.actor.identityId,
          resultMetadata: { revokedCount: revoked.length },
          now: input.now,
        });
        await recordAudit(tx, auth, {
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
