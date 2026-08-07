import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlSessionRevocation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type RevokeControlMemberSessionsPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  membershipId: string;
  sessionId?: string;
  idempotencyKey: string;
}) => Promise<Result<ControlSessionRevocation, ControlWorkforceRejection>>;
