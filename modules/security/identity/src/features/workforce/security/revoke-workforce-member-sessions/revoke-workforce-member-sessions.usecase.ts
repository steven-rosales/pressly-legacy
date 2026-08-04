import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import {
  commandFingerprint,
  requireIdentifier,
} from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import type { WorkforceActorRef } from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforceSecurityStore } from '../../../../foundations/ports/workforce-security-store/workforce-security-store.port.ts';

export type RevokeWorkforceMemberSessions = (command: {
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  sessionId?: string;
  idempotencyKey: string;
}) => Promise<
  Result<
    Readonly<{ revokedCount: number; replayed: boolean }>,
    WorkforceFailure
  >
>;

export const makeRevokeWorkforceMemberSessions =
  (deps: {
    store: WorkforceSecurityStore;
    clock: Clock;
  }): RevokeWorkforceMemberSessions =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const membershipId = requireIdentifier(
      command.membershipId,
      'membership_id',
    );
    if (result.isErr(membershipId)) return membershipId;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;
    const sessionId =
      command.sessionId === undefined
        ? result.ok(undefined)
        : requireIdentifier(command.sessionId, 'session_id');
    if (result.isErr(sessionId)) return sessionId;
    const commandHash = commandFingerprint('revoke_workforce_sessions', {
      businessId: businessId.value,
      membershipId: membershipId.value,
      sessionId: sessionId.value ?? null,
    });
    const revoked = await deps.store.revokeMemberSessions({
      actor: command.actor,
      businessId: businessId.value,
      membershipId: membershipId.value,
      ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value }),
      idempotencyKey: idempotencyKey.value,
      commandHash,
      now: deps.clock.now(),
    });
    if (revoked.status === 'rejected')
      return result.err(workforceStoreFailure(revoked.reason));
    return result.ok({
      revokedCount: revoked.value.revokedCount,
      replayed: revoked.status === 'replayed',
    });
  };
