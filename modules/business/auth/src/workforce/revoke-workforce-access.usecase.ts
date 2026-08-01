import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import {
  commandFingerprint,
  requireExpectedVersion,
  requireIdentifier,
} from './workforce-validation.policy.ts';
import type { WorkforceActorRef } from './workforce.port.ts';
import type { WorkforceClock } from './workforce-invitation.port.ts';
import type { AccessGrantStore, RevokedAccess } from './access-grant.port.ts';

export type RevokeWorkforceAccessCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  grantId: string;
  expectedVersion: number;
  reason?: string;
  idempotencyKey: string;
}>;

export type RevokeWorkforceAccess = (
  command: RevokeWorkforceAccessCommand,
) => Promise<Result<RevokedAccess, AppError>>;

export const makeRevokeWorkforceAccess =
  (deps: {
    store: AccessGrantStore;
    clock: WorkforceClock;
  }): RevokeWorkforceAccess =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const grantId = requireIdentifier(command.grantId, 'grant_id');
    if (result.isErr(grantId)) return grantId;
    const expectedVersion = requireExpectedVersion(command.expectedVersion);
    if (result.isErr(expectedVersion)) return expectedVersion;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;

    const reason = command.reason?.trim() || null;
    const revoked = await deps.store.revoke({
      actor: command.actor,
      businessId: businessId.value,
      grantId: grantId.value,
      expectedVersion: expectedVersion.value,
      reason,
      now: deps.clock.now(),
      idempotencyKey: idempotencyKey.value,
      commandHash: commandFingerprint('revoke_workforce_access', {
        businessId: businessId.value,
        grantId: grantId.value,
        expectedVersion: expectedVersion.value,
        reason,
      }),
    });
    if (result.isErr(revoked)) return revoked;
    if (revoked.value.status === 'rejected')
      return result.err(
        workforceStoreFailure(
          revoked.value.reason,
          revoked.value.currentVersion,
        ),
      );

    return result.ok(revoked.value.value);
  };
