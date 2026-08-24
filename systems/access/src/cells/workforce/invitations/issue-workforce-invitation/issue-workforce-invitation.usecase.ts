import { normalizeEmail } from '../../../../model/authentication/public.ts';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import {
  commandFingerprint,
  requireDisplayName,
  requireEmail,
  requireIdentifier,
} from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../model/language/workforce-failure/workforce-failure.failure.ts';
import type {
  WorkforceActorRef,
  WorkforceRole,
} from '../../../../model/language/workforce/workforce.model.ts';
import type { WorkforceInvitationEntity } from '../../../../model/language/workforce-invitation/workforce-invitation.entity.ts';
import type { InvitationTokenService } from '../../../../model/ports/workforce-invitation-token/workforce-invitation-token.port.ts';
import type { IssueWorkforceInvitationStore } from './issue-workforce-invitation.port.ts';
import { requireWorkforceInvitationTtlMinutes } from '../../../../model/language/workforce-invitation/workforce-invitation-config.policy.ts';

export type IssueWorkforceInvitationCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  email: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  idempotencyKey: string;
}>;

export type IssueWorkforceInvitationResult =
  | Readonly<{
      status: 'issued';
      invitation: WorkforceInvitationEntity;
      token: string;
    }>
  | Readonly<{
      status: 'replayed';
      invitation: WorkforceInvitationEntity;
    }>;

export type IssueWorkforceInvitation = (
  command: IssueWorkforceInvitationCommand,
) => Promise<Result<IssueWorkforceInvitationResult, WorkforceFailure>>;

export const makeIssueWorkforceInvitation = (deps: {
  store: IssueWorkforceInvitationStore;
  tokenService: InvitationTokenService;
  clock: Clock;
  invitationTtlMinutes: number;
}): IssueWorkforceInvitation => {
  const invitationTtlMinutes = requireWorkforceInvitationTtlMinutes(
    deps.invitationTtlMinutes,
  );

  return async (command) => {
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
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;
    const displayName = requireDisplayName(command.displayName);
    if (result.isErr(displayName)) return displayName;

    const emailNormalized = normalizeEmail(command.email);
    const email = requireEmail(emailNormalized);
    if (result.isErr(email)) return email;

    const now = deps.clock.now();
    const expiresAt = new Date(now.getTime() + invitationTtlMinutes * 60_000);
    const token = deps.tokenService.issue();
    const commandHash = commandFingerprint('issue_workforce_invitation', {
      businessId: businessId.value,
      emailNormalized: email.value,
      displayName: displayName.value,
      intendedRole: command.intendedRole,
      intendedLocationId: command.intendedLocationId,
    });
    const stored = await deps.store.issue({
      actor: {
        identityId: actorIdentityId.value,
        sessionId: actorSessionId.value,
      },
      businessId: businessId.value,
      emailNormalized: email.value,
      displayName: displayName.value,
      intendedRole: command.intendedRole,
      intendedLocationId: command.intendedLocationId,
      tokenHash: deps.tokenService.hash(token),
      expiresAt,
      now,
      idempotencyKey: idempotencyKey.value,
      commandHash,
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
