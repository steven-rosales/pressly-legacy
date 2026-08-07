import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlMembershipTransition } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type TransitionControlMembershipPort = (input: {
  transition: 'suspend' | 'reactivate' | 'end';
  actor: ControlActorReference;
  businessId: string;
  membershipId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}) => Promise<Result<ControlMembershipTransition, ControlWorkforceRejection>>;
