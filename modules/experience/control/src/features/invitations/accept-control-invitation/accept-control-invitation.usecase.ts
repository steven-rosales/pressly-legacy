import { result, type Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlInvitationAcceptance } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlInvitationAcceptance } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type {
  AcceptControlInvitationCommand,
  AcceptControlInvitationPort,
} from './accept-control-invitation.port.ts';

export type AcceptControlInvitation = (
  input: AcceptControlInvitationCommand,
) => Promise<Result<ControlInvitationAcceptance, ControlWorkforceRejection>>;

export const makeAcceptControlInvitation =
  (acceptInvitation: AcceptControlInvitationPort): AcceptControlInvitation =>
  async (command) => {
    const accepted = await acceptInvitation(command);
    return result.isErr(accepted)
      ? accepted
      : result.ok(toControlInvitationAcceptance(accepted.value));
  };
