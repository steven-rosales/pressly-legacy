import { result, type Result } from '@pressly/kernel';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlInvitationPreview } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlInvitationPreview } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { PreviewControlInvitationPort } from './preview-control-invitation.port.ts';

export type PreviewControlInvitation = (
  acceptanceToken: string,
) => Promise<Result<ControlInvitationPreview, ControlWorkforceRejection>>;

export const makePreviewControlInvitation =
  (previewInvitation: PreviewControlInvitationPort): PreviewControlInvitation =>
  async (acceptanceToken) => {
    const preview = await previewInvitation(acceptanceToken);
    return result.isErr(preview)
      ? preview
      : result.ok(toControlInvitationPreview(preview.value));
  };
