import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlIssuedInvitation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type {
  ControlActorReference,
  ControlWorkforceRole,
} from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type IssueControlInvitationPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  email: string;
  displayName: string;
  intendedRole: ControlWorkforceRole;
  intendedLocationId: string | null;
  idempotencyKey: string;
}) => Promise<Result<ControlIssuedInvitation, ControlWorkforceRejection>>;
