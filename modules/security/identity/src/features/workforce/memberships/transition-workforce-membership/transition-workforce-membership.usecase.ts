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
import type { WorkforceMembershipEvent } from '../../../../foundations/language/workforce-membership/workforce-membership.lifecycle.ts';
import type { WorkforceMembershipStore } from '../../../../foundations/ports/workforce-membership-store/workforce-membership-store.port.ts';
import type { TransitionedMembership } from '../../../../foundations/ports/workforce-membership-store/workforce-membership-store.port.ts';

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
) => Promise<Result<TransitionedMembership, WorkforceFailure>>;

export const makeTransitionWorkforceMembership =
  (deps: {
    store: WorkforceMembershipStore;
    clock: Clock;
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
    if (transitioned.status === 'rejected')
      return result.err(
        workforceStoreFailure(transitioned.reason, transitioned.currentVersion),
      );

    return result.ok(transitioned.value);
  };

export const makeSuspendWorkforceMembership = (deps: {
  store: WorkforceMembershipStore;
  clock: Clock;
}): TransitionWorkforceMembership =>
  makeTransitionWorkforceMembership({ ...deps, event: 'suspend' });

export const makeReactivateWorkforceMembership = (deps: {
  store: WorkforceMembershipStore;
  clock: Clock;
}): TransitionWorkforceMembership =>
  makeTransitionWorkforceMembership({ ...deps, event: 'reactivate' });

export const makeEndWorkforceMembership = (deps: {
  store: WorkforceMembershipStore;
  clock: Clock;
}): TransitionWorkforceMembership =>
  makeTransitionWorkforceMembership({ ...deps, event: 'end' });
