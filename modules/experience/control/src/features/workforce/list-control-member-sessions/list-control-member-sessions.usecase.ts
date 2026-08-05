import type { Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlWorkforceSessionList } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ListControlMemberSessionsPort } from './list-control-member-sessions.port.ts';

export type ListControlMemberSessions = (input: {
  context: ControlRequestContext;
  membershipId: string;
}) => Promise<Result<ControlWorkforceSessionList, ControlWorkforceRejection>>;

export const makeListControlMemberSessions =
  (
    listMemberSessions: ListControlMemberSessionsPort,
  ): ListControlMemberSessions =>
  ({ context, membershipId }) =>
    listMemberSessions({
      actor: context.actor,
      businessId: context.access.business.id,
      membershipId,
    });
