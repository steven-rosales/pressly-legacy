import type { Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlSessionRevocation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { RevokeControlMemberSessionsPort } from './revoke-control-member-sessions.port.ts';

export type RevokeControlMemberSessions = (input: {
  context: ControlRequestContext;
  membershipId: string;
  sessionId?: string;
  idempotencyKey: string;
}) => Promise<Result<ControlSessionRevocation, ControlWorkforceRejection>>;

export const makeRevokeControlMemberSessions =
  (
    revokeMemberSessions: RevokeControlMemberSessionsPort,
  ): RevokeControlMemberSessions =>
  ({ context, ...command }) =>
    revokeMemberSessions({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
