import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { requireIdentifier } from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import type { WorkforceInvitationPreview } from '../../../../foundations/language/workforce-invitation/workforce-invitation.model.ts';
import type {
  InvitationTokenService,
  WorkforceInvitationStore,
} from '../../../../foundations/ports/workforce-invitation-store/workforce-invitation-store.port.ts';

export type PreviewWorkforceInvitation = (
  rawToken: string,
) => Promise<Result<WorkforceInvitationPreview, WorkforceFailure>>;

export const makePreviewWorkforceInvitation =
  (deps: {
    store: WorkforceInvitationStore;
    tokenService: InvitationTokenService;
    clock: Clock;
  }): PreviewWorkforceInvitation =>
  async (rawToken) => {
    const token = requireIdentifier(rawToken, 'invitation_token');
    if (result.isErr(token)) return token;

    const preview = await deps.store.preview(
      deps.tokenService.hash(token.value),
      deps.clock.now(),
    );
    if (preview.status === 'rejected')
      return result.err(workforceStoreFailure(preview.reason));

    return result.ok(preview.value);
  };
