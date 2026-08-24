import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../model/language/workforce-failure/workforce-failure.failure.ts';
import {
  commandFingerprint,
  requireExpectedVersion,
  requireIdentifier,
} from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import type { WorkforceActorRef } from '../../../../model/language/workforce/workforce.model.ts';
import type { WorkforceMembershipEvent } from '../../../../model/language/workforce-membership/workforce-membership.lifecycle.ts';
import type {
  TransitionedMembership,
  TransitionWorkforceMembershipStore,
} from './transition-workforce-membership.port.ts';

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

export type TransitionWorkforceMembershipOperationCommand =
  TransitionWorkforceMembershipCommand &
    Readonly<{ event: WorkforceMembershipEvent }>;

export type TransitionWorkforceMembershipOperation = (
  command: TransitionWorkforceMembershipOperationCommand,
) => Promise<Result<TransitionedMembership, WorkforceFailure>>;

export const combineWorkforceMembershipTransitions =
  (
    operations: Readonly<{
      suspend: TransitionWorkforceMembership;
      reactivate: TransitionWorkforceMembership;
      end: TransitionWorkforceMembership;
    }>,
  ): TransitionWorkforceMembershipOperation =>
  async ({ event, ...command }) => {
    if (event === 'suspend') return operations.suspend(command);
    if (event === 'reactivate') return operations.reactivate(command);
    return operations.end(command);
  };

export const makeTransitionWorkforceMembership =
  (deps: {
    store: TransitionWorkforceMembershipStore;
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
