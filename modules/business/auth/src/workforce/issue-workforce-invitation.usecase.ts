import { normalizeEmail } from '@pressly/auth/authentication';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import {
  commandFingerprint,
  requireDisplayName,
  requireEmail,
  requireIdentifier,
} from './workforce-validation.policy.ts';
import { workforceStoreFailure } from './workforce.error.ts';
import type {
  WorkforceActorRef,
  WorkforceInvitationSummary,
  WorkforceRole,
} from './workforce.port.ts';
import type {
  InvitationTokenService,
  WorkforceClock,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

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
      invitation: WorkforceInvitationSummary;
      token: string;
    }>
  | Readonly<{
      status: 'replayed';
      invitation: WorkforceInvitationSummary;
    }>;

export type IssueWorkforceInvitation = (
  command: IssueWorkforceInvitationCommand,
) => Promise<Result<IssueWorkforceInvitationResult, AppError>>;

export const makeIssueWorkforceInvitation =
  (deps: {
    store: WorkforceInvitationStore;
    tokenService: InvitationTokenService;
    clock: WorkforceClock;
    invitationTtlMinutes: number;
  }): IssueWorkforceInvitation =>
  async (command) => {
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

    if (
      !Number.isSafeInteger(deps.invitationTtlMinutes) ||
      deps.invitationTtlMinutes <= 0
    )
      throw new TypeError('invitationTtlMinutes must be a positive integer.');

    const now = deps.clock.now();
    const expiresAt = new Date(
      now.getTime() + deps.invitationTtlMinutes * 60_000,
    );
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
