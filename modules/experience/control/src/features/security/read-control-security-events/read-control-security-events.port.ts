import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlSecurityEventList } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type ReadControlSecurityEventsPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlSecurityEventList, ControlWorkforceRejection>>;
