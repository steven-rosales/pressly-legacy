import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import {
  commandFingerprint,
  requireExpectedVersion,
  requireIdentifier,
} from './workforce-validation.policy.ts';
import type {
  WorkforceActorRef,
  WorkforceInvitationSummary,
} from './workforce.port.ts';
import type {
  InvitationTokenService,
  WorkforceClock,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

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
      invitation: WorkforceInvitationSummary;
      token: string;
    }>
  | Readonly<{
      status: 'replayed';
      invitation: WorkforceInvitationSummary;
    }>;

export type ReissueWorkforceInvitation = (
  command: ReissueWorkforceInvitationCommand,
) => Promise<Result<ReissueWorkforceInvitationResult, AppError>>;

export const makeReissueWorkforceInvitation =
  (deps: {
    store: WorkforceInvitationStore;
    tokenService: InvitationTokenService;
    clock: WorkforceClock;
    invitationTtlMinutes: number;
  }): ReissueWorkforceInvitation =>
  async (command) => {
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
    const expiresAt = new Date(
      now.getTime() + deps.invitationTtlMinutes * 60_000,
    );
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

    if (result.isErr(stored)) return stored;
    if (stored.value.status === 'rejected')
      return result.err(
        workforceStoreFailure(stored.value.reason, stored.value.currentVersion),
      );
    if (stored.value.status === 'replayed')
      return result.ok({
        status: 'replayed',
        invitation: stored.value.value,
      });

    return result.ok({
      status: 'issued',
      invitation: stored.value.value,
      token,
    });
  };
