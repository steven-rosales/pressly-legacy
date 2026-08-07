import type { Result } from '@pressly/kernel';
import type { ControlMembershipEntity } from '../../../foundations/language/control-workforce/control-workforce.entity.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type {
  ControlActorReference,
  ControlMembershipState,
} from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type ListControlMembersPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  states?: readonly ControlMembershipState[];
  query?: string;
  cursor?: string;
  limit: number;
}) => Promise<
  Result<
    Readonly<{
      members: readonly ControlMembershipEntity[];
      nextCursor: string | null;
    }>,
    ControlWorkforceRejection
  >
>;
