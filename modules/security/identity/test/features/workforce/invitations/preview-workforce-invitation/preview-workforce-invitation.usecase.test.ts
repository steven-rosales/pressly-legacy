import { describe, expect, it, vi } from 'vitest';
import { makePreviewWorkforceInvitation } from '../../../../../src/features/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceInvitationNow,
} from '../../../../support/workforce-invitation-store.fake.ts';

describe('preview workforce invitation', () => {
  it('returns a safe expected failure for an expired token', async () => {
    const preview = makePreviewWorkforceInvitation({
      store: makeWorkforceInvitationStoreFake({
        preview: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'expired_token' as const,
        })),
      }),
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
    });

    const response = await preview('invite');

    expect(response).toMatchObject({
      tag: 'err',
      error: { code: 'workforce_expired_token' },
    });
  });
});
