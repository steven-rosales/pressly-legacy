import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlWorkforceSessionList } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type ListControlMemberSessionsPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  membershipId: string;
}) => Promise<Result<ControlWorkforceSessionList, ControlWorkforceRejection>>;
