import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlMemberDetail } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlMemberDetail } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { GetControlMemberPort } from './get-control-member.port.ts';

export type GetControlMember = (input: {
  context: ControlRequestContext;
  membershipId: string;
}) => Promise<Result<ControlMemberDetail, ControlWorkforceRejection>>;

export const makeGetControlMember =
  (getMember: GetControlMemberPort): GetControlMember =>
  async ({ context, membershipId }) => {
    const member = await getMember({
      actor: context.actor,
      businessId: context.access.business.id,
      membershipId,
    });
    return result.isErr(member)
      ? member
      : result.ok(toControlMemberDetail(member.value));
  };
