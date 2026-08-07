import type { Result } from '@pressly/kernel';
import type { ControlGrantEntity } from '../../../foundations/language/control-workforce/control-workforce.entity.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type {
  ControlActorReference,
  ControlWorkforceRole,
  ControlWorkforceScope,
} from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type GrantControlAccessPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: ControlWorkforceRole;
  scope: ControlWorkforceScope;
  startsAt?: Date;
  endsAt?: Date;
  idempotencyKey: string;
}) => Promise<Result<ControlGrantEntity, ControlWorkforceRejection>>;
