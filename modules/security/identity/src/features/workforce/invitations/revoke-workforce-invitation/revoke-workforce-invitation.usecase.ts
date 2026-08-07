import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import {
  commandFingerprint,
  requireExpectedVersion,
  requireIdentifier,
} from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import type { WorkforceActorRef } from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforceInvitationEntity } from '../../../../foundations/language/workforce-invitation/workforce-invitation.entity.ts';
import type { RevokeWorkforceInvitationStore } from './revoke-workforce-invitation.port.ts';

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
) => Promise<Result<WorkforceInvitationEntity, WorkforceFailure>>;

export const makeRevokeWorkforceInvitation =
  (deps: {
    store: RevokeWorkforceInvitationStore;
    clock: Clock;
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
    if (stored.status === 'rejected')
      return result.err(
        workforceStoreFailure(stored.reason, stored.currentVersion),
      );

    return result.ok(stored.value);
  };
