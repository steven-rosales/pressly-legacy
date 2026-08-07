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
import type {
  RevokedAccess,
  RevokeWorkforceAccessStore,
} from './revoke-workforce-access.port.ts';

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
) => Promise<Result<RevokedAccess, WorkforceFailure>>;

export const makeRevokeWorkforceAccess =
  (deps: {
    store: RevokeWorkforceAccessStore;
    clock: Clock;
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
    if (revoked.status === 'rejected')
      return result.err(
        workforceStoreFailure(revoked.reason, revoked.currentVersion),
      );

    return result.ok(revoked.value);
  };
