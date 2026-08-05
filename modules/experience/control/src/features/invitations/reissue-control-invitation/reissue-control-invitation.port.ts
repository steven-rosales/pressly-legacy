import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlIssuedInvitation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type ReissueControlInvitationPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  invitationId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) => Promise<Result<ControlIssuedInvitation, ControlWorkforceRejection>>;
