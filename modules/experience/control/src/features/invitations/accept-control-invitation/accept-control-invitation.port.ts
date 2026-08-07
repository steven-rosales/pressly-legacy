import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlAcceptedInvitation } from '../../../foundations/language/control-workforce/control-workforce.model.ts';

export type AcceptControlInvitationCommand = Readonly<{
  acceptanceToken: string;
  idempotencyKey: string;
  acceptance:
    | Readonly<{ kind: 'new_identity'; password: string }>
    | Readonly<{
        kind: 'existing_identity';
        authenticatedIdentityId: string;
        authenticatedSessionId: string;
      }>;
}>;

export type AcceptControlInvitationPort = (
  input: AcceptControlInvitationCommand,
) => Promise<Result<ControlAcceptedInvitation, ControlWorkforceRejection>>;
