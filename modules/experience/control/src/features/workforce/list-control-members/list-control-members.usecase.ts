import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlMemberPage } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlMember } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { ControlMembershipState } from '../../../foundations/language/control-workforce/control-workforce.value.ts';
import type { ListControlMembersPort } from './list-control-members.port.ts';

export type ListControlMembers = (input: {
  context: ControlRequestContext;
  states?: readonly ControlMembershipState[];
  query?: string;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlMemberPage, ControlWorkforceRejection>>;

export const makeListControlMembers =
  (listMembers: ListControlMembersPort): ListControlMembers =>
  async ({ context, ...query }) => {
    const page = await listMembers({
      ...query,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          members: page.value.members.map(toControlMember),
          nextCursor: page.value.nextCursor,
        });
  };
