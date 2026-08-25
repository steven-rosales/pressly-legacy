import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../model/language/workforce-failure/workforce-failure.failure.ts';
import {
  commandFingerprint,
  requireExpectedVersion,
  requireIdentifier,
} from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import type { WorkforceActorRef } from '../../../../model/language/workforce/workforce.model.ts';
import type { WorkforceInvitationEntity } from '../../../../model/language/workforce-invitation/workforce-invitation.entity.ts';
import type { InvitationTokenService } from '../../../../model/ports/workforce-invitation-token/workforce-invitation-token.port.ts';
import type { ReissueWorkforceInvitationStore } from './reissue-workforce-invitation.port.ts';
import { requireWorkforceInvitationTtlMinutes } from '../../../../model/language/workforce-invitation/workforce-invitation-config.policy.ts';

export type ReissueWorkforceInvitationCommand = Readonly<{
  actor: WorkforceActorRef;
  invitationId: string;
  businessId: string;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type ReissueWorkforceInvitationResult =
  | Readonly<{
      status: 'issued';
      invitation: WorkforceInvitationEntity;
      token: string;
    }>
  | Readonly<{
      status: 'replayed';
      invitation: WorkforceInvitationEntity;
    }>;

export type ReissueWorkforceInvitation = (
  command: ReissueWorkforceInvitationCommand,
) => Promise<Result<ReissueWorkforceInvitationResult, WorkforceFailure>>;

export const makeReissueWorkforceInvitation = (deps: {
  store: ReissueWorkforceInvitationStore;
  tokenService: InvitationTokenService;
  clock: Clock;
  invitationTtlMinutes: number;
}): ReissueWorkforceInvitation => {
  const invitationTtlMinutes = requireWorkforceInvitationTtlMinutes(
    deps.invitationTtlMinutes,
  );

  return async (command) => {
    const invitationId = requireIdentifier(
      command.invitationId,
      'invitation_id',
    );
    if (result.isErr(invitationId)) return invitationId;
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const actorIdentityId = requireIdentifier(
      command.actor.identityId,
      'actor_identity_id',
    );
    if (result.isErr(actorIdentityId)) return actorIdentityId;
    const actorSessionId = requireIdentifier(
      command.actor.sessionId,
      'actor_session_id',
    );
    if (result.isErr(actorSessionId)) return actorSessionId;
    const expectedVersion = requireExpectedVersion(command.expectedVersion);
    if (result.isErr(expectedVersion)) return expectedVersion;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;

    const now = deps.clock.now();
    const expiresAt = new Date(now.getTime() + invitationTtlMinutes * 60_000);
    const token = deps.tokenService.issue();
    const stored = await deps.store.reissue({
      actor: {
        identityId: actorIdentityId.value,
        sessionId: actorSessionId.value,
      },
      invitationId: invitationId.value,
      businessId: businessId.value,
      expectedVersion: expectedVersion.value,
      tokenHash: deps.tokenService.hash(token),
      expiresAt,
      now,
      idempotencyKey: idempotencyKey.value,
      commandHash: commandFingerprint('reissue_workforce_invitation', {
        invitationId: invitationId.value,
        businessId: businessId.value,
        expectedVersion: expectedVersion.value,
      }),
    });
    if (stored.status === 'rejected')
      return result.err(
        workforceStoreFailure(stored.reason, stored.currentVersion),
      );
    if (stored.status === 'replayed')
      return result.ok({
        status: 'replayed',
        invitation: stored.value,
      });

    return result.ok({
      status: 'issued',
      invitation: stored.value,
      token,
    });
  };
};
