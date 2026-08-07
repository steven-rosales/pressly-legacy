import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { makeReissueWorkforceInvitation } from '../../../../../src/features/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceActor,
  workforceInvitation,
  workforceInvitationNow,
} from '../../../../support/workforce-invitation-store.fake.ts';

const captureError = (action: () => unknown): unknown => {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
};

describe('reissue workforce invitation', () => {
  it('rejects invalid invitation TTL configuration', () => {
    expect(
      captureError(() =>
        makeReissueWorkforceInvitation({
          store: makeWorkforceInvitationStoreFake(),
          tokenService: makeInvitationTokenServiceFake(),
          clock: { now: () => workforceInvitationNow },
          invitationTtlMinutes: 0,
        }),
      ),
    ).toMatchObject({
      tag: 'AppError',
      kind: 'ConfigError',
      code: 'workforce_invitation_ttl_invalid',
      status: 500,
    });
  });

  it('does not disclose a replacement token when reissue is replayed', async () => {
    const store = makeWorkforceInvitationStoreFake({
      reissue: vi.fn(async () => ({
        status: 'replayed' as const,
        value: workforceInvitation,
      })),
    });
    const reissue = makeReissueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });
    const response = await reissue({
      actor: workforceActor,
      businessId: 'business-id',
      invitationId: workforceInvitation.id,
      expectedVersion: 1,
      idempotencyKey: 'reissue-1',
    });

    expect(response).toEqual(
      result.ok({ status: 'replayed', invitation: workforceInvitation }),
    );
    expect(JSON.stringify(response)).not.toContain('raw-invitation-token');
  });
});
