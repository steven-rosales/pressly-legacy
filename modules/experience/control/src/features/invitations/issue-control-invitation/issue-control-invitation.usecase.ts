import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlIssueInvitation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlIssueInvitation } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { ControlWorkforceRole } from '../../../foundations/language/control-workforce/control-workforce.value.ts';
import type { IssueControlInvitationPort } from './issue-control-invitation.port.ts';

export type IssueControlInvitation = (input: {
  context: ControlRequestContext;
  email: string;
  displayName: string;
  intendedRole: ControlWorkforceRole;
  intendedLocationId: string | null;
  idempotencyKey: string;
}) => Promise<Result<ControlIssueInvitation, ControlWorkforceRejection>>;

export const makeIssueControlInvitation =
  (issueInvitation: IssueControlInvitationPort): IssueControlInvitation =>
  async ({ context, ...command }) => {
    const issued = await issueInvitation({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(issued)
      ? issued
      : result.ok(toControlIssueInvitation(issued.value));
  };
