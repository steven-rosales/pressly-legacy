import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import {
  commandFingerprint,
  requireExpectedVersion,
  requireIdentifier,
} from './workforce-validation.policy.ts';
import type { WorkforceActorRef } from './workforce.model.ts';
import type { WorkforceClock } from './workforce-invitation.port.ts';
import type { WorkforceMembershipEvent } from './workforce-membership.policy.ts';
import type {
  TransitionedMembership,
  WorkforceMembershipStore,
} from './workforce-membership.port.ts';

export type TransitionWorkforceMembershipCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  expectedVersion: number;
  reason?: string;
  idempotencyKey: string;
}>;

export type TransitionWorkforceMembership = (
  command: TransitionWorkforceMembershipCommand,
) => Promise<Result<TransitionedMembership, AppError>>;

export const makeTransitionWorkforceMembership =
  (deps: {
    store: WorkforceMembershipStore;
    clock: WorkforceClock;
    event: WorkforceMembershipEvent;
  }): TransitionWorkforceMembership =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const membershipId = requireIdentifier(
      command.membershipId,
      'membership_id',
    );
    if (result.isErr(membershipId)) return membershipId;
    const expectedVersion = requireExpectedVersion(command.expectedVersion);
    if (result.isErr(expectedVersion)) return expectedVersion;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;

    const reason = command.reason?.trim() || null;
    const transitioned = await deps.store.transition({
      actor: command.actor,
      businessId: businessId.value,
      membershipId: membershipId.value,
      expectedVersion: expectedVersion.value,
      event: deps.event,
      reason,
      now: deps.clock.now(),
      idempotencyKey: idempotencyKey.value,
      commandHash: commandFingerprint(`${deps.event}_workforce_membership`, {
        businessId: businessId.value,
        membershipId: membershipId.value,
        expectedVersion: expectedVersion.value,
        reason,
      }),
    });

    if (result.isErr(transitioned)) return transitioned;
    if (transitioned.value.status === 'rejected')
      return result.err(
        workforceStoreFailure(
          transitioned.value.reason,
          transitioned.value.currentVersion,
        ),
      );

    return result.ok(transitioned.value.value);
  };

export const makeSuspendWorkforceMembership = (deps: {
  store: WorkforceMembershipStore;
  clock: WorkforceClock;
}): TransitionWorkforceMembership =>
  makeTransitionWorkforceMembership({ ...deps, event: 'suspend' });

export const makeReactivateWorkforceMembership = (deps: {
  store: WorkforceMembershipStore;
  clock: WorkforceClock;
}): TransitionWorkforceMembership =>
  makeTransitionWorkforceMembership({ ...deps, event: 'reactivate' });

export const makeEndWorkforceMembership = (deps: {
  store: WorkforceMembershipStore;
  clock: WorkforceClock;
}): TransitionWorkforceMembership =>
  makeTransitionWorkforceMembership({ ...deps, event: 'end' });
