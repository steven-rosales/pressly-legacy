import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { requireIdentifier } from './workforce-validation.policy.ts';
import { workforceStoreFailure } from './workforce.error.ts';
import type { WorkforceInvitationPreview } from './workforce.port.ts';
import type {
  InvitationTokenService,
  WorkforceClock,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

export type PreviewWorkforceInvitation = (
  rawToken: string,
) => Promise<Result<WorkforceInvitationPreview, AppError>>;

export const makePreviewWorkforceInvitation =
  (deps: {
    store: WorkforceInvitationStore;
    tokenService: InvitationTokenService;
    clock: WorkforceClock;
  }): PreviewWorkforceInvitation =>
  async (rawToken) => {
    const token = requireIdentifier(rawToken, 'invitation_token');
    if (result.isErr(token)) return token;

    const preview = await deps.store.preview(
      deps.tokenService.hash(token.value),
      deps.clock.now(),
    );
    if (result.isErr(preview)) return preview;
    if (preview.value.status === 'rejected')
      return result.err(workforceStoreFailure(preview.value.reason));

    return result.ok(preview.value.value);
  };
