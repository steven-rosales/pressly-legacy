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
} from './workforce.model.ts';
import type {
  WorkforceClock,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

export type RevokeWorkforceInvitationCommand = Readonly<{
  actor: WorkforceActorRef;
  invitationId: string;
  businessId: string;
  expectedVersion: number;
  reason?: string;
  idempotencyKey: string;
}>;

export type RevokeWorkforceInvitation = (
  command: RevokeWorkforceInvitationCommand,
) => Promise<Result<WorkforceInvitationSummary, AppError>>;

export const makeRevokeWorkforceInvitation =
  (deps: {
    store: WorkforceInvitationStore;
    clock: WorkforceClock;
  }): RevokeWorkforceInvitation =>
  async (command) => {
    const invitationId = requireIdentifier(
      command.invitationId,
      'invitation_id',
    );
    if (result.isErr(invitationId)) return invitationId;
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const expectedVersion = requireExpectedVersion(command.expectedVersion);
    if (result.isErr(expectedVersion)) return expectedVersion;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;

    const reason = command.reason?.trim() || null;
    const now = deps.clock.now();
    const stored = await deps.store.revoke({
      actor: command.actor,
      invitationId: invitationId.value,
      businessId: businessId.value,
      expectedVersion: expectedVersion.value,
      reason,
      now,
      idempotencyKey: idempotencyKey.value,
      commandHash: commandFingerprint('revoke_workforce_invitation', {
        invitationId: invitationId.value,
        businessId: businessId.value,
        expectedVersion: expectedVersion.value,
        reason,
      }),
    });

    if (result.isErr(stored)) return stored;
    if (stored.value.status === 'rejected')
      return result.err(
        workforceStoreFailure(stored.value.reason, stored.value.currentVersion),
      );

    return result.ok(stored.value.value);
  };
