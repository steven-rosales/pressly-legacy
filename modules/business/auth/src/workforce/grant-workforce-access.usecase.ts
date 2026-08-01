import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import {
  commandFingerprint,
  requireIdentifier,
} from './workforce-validation.policy.ts';
import type {
  AccessGrantSummary,
  WorkforceActorRef,
  WorkforceRole,
  WorkforceScope,
} from './workforce.port.ts';
import type { WorkforceClock } from './workforce-invitation.port.ts';
import type { AccessGrantStore } from './access-grant.port.ts';

export type GrantWorkforceAccessCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: WorkforceRole;
  scope: WorkforceScope;
  startsAt?: Date;
  endsAt?: Date;
  idempotencyKey: string;
}>;

export type GrantWorkforceAccess = (
  command: GrantWorkforceAccessCommand,
) => Promise<Result<AccessGrantSummary, AppError>>;

export const makeGrantWorkforceAccess =
  (deps: {
    store: AccessGrantStore;
    clock: WorkforceClock;
  }): GrantWorkforceAccess =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const membershipId = requireIdentifier(
      command.membershipId,
      'membership_id',
    );
    if (result.isErr(membershipId)) return membershipId;
    const identityId = requireIdentifier(command.identityId, 'identity_id');
    if (result.isErr(identityId)) return identityId;
    const scopeId = requireIdentifier(command.scope.id, 'scope_id');
    if (result.isErr(scopeId)) return scopeId;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;
    if (
      command.startsAt !== undefined &&
      command.endsAt !== undefined &&
      command.endsAt <= command.startsAt
    )
      return result.err(workforceStoreFailure('invalid_state'));

    const startsAt = command.startsAt ?? null;
    const endsAt = command.endsAt ?? null;
    const scope: WorkforceScope = {
      kind: command.scope.kind,
      id: scopeId.value,
    };
    const granted = await deps.store.grant({
      actor: command.actor,
      businessId: businessId.value,
      membershipId: membershipId.value,
      identityId: identityId.value,
      role: command.role,
      scope,
      startsAt,
      endsAt,
      now: deps.clock.now(),
      idempotencyKey: idempotencyKey.value,
      commandHash: commandFingerprint('grant_workforce_access', {
        businessId: businessId.value,
        membershipId: membershipId.value,
        identityId: identityId.value,
        role: command.role,
        scope,
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: endsAt?.toISOString() ?? null,
      }),
    });
    if (result.isErr(granted)) return granted;
    if (granted.value.status === 'rejected')
      return result.err(
        workforceStoreFailure(
          granted.value.reason,
          granted.value.currentVersion,
        ),
      );

    return result.ok(granted.value.value);
  };
