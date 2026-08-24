import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import { requireIdentifier } from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import {
  typedWorkforceStoreFailure,
  type WorkforceFailureForReason,
  type WorkforceValidationFailure,
} from '../../../../model/language/workforce-failure/workforce-failure.failure.ts';
import type { WorkforceInvitationPreview } from './model.ts';
import type { InvitationTokenService } from '../../../../model/ports/workforce-invitation-token/workforce-invitation-token.port.ts';
import type { PreviewWorkforceInvitationStore } from './preview-workforce-invitation.port.ts';

type PreviewStoreFailureReason = Extract<
  Awaited<ReturnType<PreviewWorkforceInvitationStore['preview']>>,
  { status: 'rejected' }
>['reason'];

export type PreviewWorkforceInvitationFailure =
  | WorkforceValidationFailure
  | WorkforceFailureForReason<PreviewStoreFailureReason>;

export type PreviewWorkforceInvitation = (
  rawToken: string,
) => Promise<
  Result<WorkforceInvitationPreview, PreviewWorkforceInvitationFailure>
>;

export const makePreviewWorkforceInvitation =
  (deps: {
    store: PreviewWorkforceInvitationStore;
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
      return result.err(typedWorkforceStoreFailure(preview.reason));

    return result.ok(preview.value);
  };
