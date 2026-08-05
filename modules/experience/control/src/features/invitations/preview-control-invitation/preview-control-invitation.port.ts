import type { Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlInvitationPreviewSnapshot } from '../../../foundations/language/control-workforce/control-workforce.model.ts';

export type PreviewControlInvitationPort = (
  acceptanceToken: string,
) => Promise<
  Result<ControlInvitationPreviewSnapshot, ControlWorkforceRejection>
>;
