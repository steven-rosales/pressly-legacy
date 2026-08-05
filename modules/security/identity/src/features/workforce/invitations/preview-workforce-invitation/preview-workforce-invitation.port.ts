import type { WorkforceInvitationPreview } from '../../../../foundations/language/workforce-invitation/workforce-invitation.model.ts';

export type PreviewWorkforceInvitationStoreResult =
  | Readonly<{
      status: 'available';
      value: WorkforceInvitationPreview;
    }>
  | Readonly<{
      status: 'rejected';
      reason: 'invalid_token' | 'expired_token' | 'invalid_state';
    }>;

export type PreviewWorkforceInvitationStore = Readonly<{
  preview: (
    tokenHash: string,
    now: Date,
  ) => Promise<PreviewWorkforceInvitationStoreResult>;
}>;
