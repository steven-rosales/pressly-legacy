import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlGrantRevocation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type RevokeControlAccessPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  grantId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}) => Promise<Result<ControlGrantRevocation, ControlWorkforceRejection>>;
