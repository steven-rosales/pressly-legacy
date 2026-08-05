import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlInvitation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlInvitation } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { RevokeControlInvitationPort } from './revoke-control-invitation.port.ts';

export type RevokeControlInvitation = (input: {
  context: ControlRequestContext;
  invitationId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}) => Promise<Result<ControlInvitation, ControlWorkforceRejection>>;

export const makeRevokeControlInvitation =
  (revokeInvitation: RevokeControlInvitationPort): RevokeControlInvitation =>
  async ({ context, ...command }) => {
    const revoked = await revokeInvitation({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(revoked)
      ? revoked
      : result.ok(toControlInvitation(revoked.value));
  };
