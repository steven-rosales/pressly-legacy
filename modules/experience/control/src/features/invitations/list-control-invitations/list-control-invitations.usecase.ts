import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlInvitationPage } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlInvitation } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { ListControlInvitationsPort } from './list-control-invitations.port.ts';

export type ListControlInvitations = (input: {
  context: ControlRequestContext;
  includeTerminal: boolean;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlInvitationPage, ControlWorkforceRejection>>;

export const makeListControlInvitations =
  (listInvitations: ListControlInvitationsPort): ListControlInvitations =>
  async ({ context, ...query }) => {
    const page = await listInvitations({
      ...query,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          invitations: page.value.invitations.map(toControlInvitation),
          nextCursor: page.value.nextCursor,
        });
  };
