import type { Result } from '@pressly/kernel';
import type { ControlInvitationEntity } from '../../../foundations/language/control-workforce/control-workforce.entity.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlActorReference } from '../../../foundations/language/control-workforce/control-workforce.value.ts';

export type ListControlInvitationsPort = (input: {
  actor: ControlActorReference;
  businessId: string;
  includeTerminal: boolean;
  cursor?: string;
  limit: number;
}) => Promise<
  Result<
    Readonly<{
      invitations: readonly ControlInvitationEntity[];
      nextCursor: string | null;
    }>,
    ControlWorkforceRejection
  >
>;
