import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlIssueInvitation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlIssueInvitation } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { ReissueControlInvitationPort } from './reissue-control-invitation.port.ts';

export type ReissueControlInvitation = (input: {
  context: ControlRequestContext;
  invitationId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) => Promise<Result<ControlIssueInvitation, ControlWorkforceRejection>>;

export const makeReissueControlInvitation =
  (reissueInvitation: ReissueControlInvitationPort): ReissueControlInvitation =>
  async ({ context, ...command }) => {
    const issued = await reissueInvitation({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(issued)
      ? issued
      : result.ok(toControlIssueInvitation(issued.value));
  };
