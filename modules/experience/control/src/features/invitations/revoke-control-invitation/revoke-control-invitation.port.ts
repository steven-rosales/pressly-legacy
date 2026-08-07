import type { Result } from '@pressly/kernel';
import type { ControlInvitationEntity } from '../../../foundations/language/control-workforce/control-workforce.entity.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type RevokeControlInvitationPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  invitationId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}) => Promise<Result<ControlInvitationEntity, ControlWorkforceRejection>>;
