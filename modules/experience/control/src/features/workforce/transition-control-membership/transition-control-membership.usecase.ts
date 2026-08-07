import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlMemberDetail } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlMemberDetail } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { TransitionControlMembershipPort } from './transition-control-membership.port.ts';

export type TransitionControlMembership = (input: {
  context: ControlRequestContext;
  transition: 'suspend' | 'reactivate' | 'end';
  membershipId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}) => Promise<
  Result<
    Readonly<{
      member: ControlMemberDetail;
      revokedSessionCount: number;
    }>,
    ControlWorkforceRejection
  >
>;

export const makeTransitionControlMembership =
  (
    transitionMembership: TransitionControlMembershipPort,
  ): TransitionControlMembership =>
  async ({ context, ...command }) => {
    const transitioned = await transitionMembership({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(transitioned)
      ? transitioned
      : result.ok({
          member: toControlMemberDetail(transitioned.value.member),
          revokedSessionCount: transitioned.value.revokedSessionCount,
        });
  };
