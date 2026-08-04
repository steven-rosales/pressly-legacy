import { describe, expect, it, vi } from 'vitest';
import { makeAcceptWorkforceInvitation } from '../../../../../src/features/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceInvitationNow,
} from '../../../../support/workforce-invitation-store.fake.ts';

describe('accept workforce invitation', () => {
  it('requires a strong self-selected password for a new identity', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const accept = makeAcceptWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      passwordHasher: { hash: vi.fn(async () => 'password-hash') },
      clock: { now: () => workforceInvitationNow },
    });
    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-1',
      acceptance: { kind: 'new_identity', password: 'weak' },
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: { code: 'weak_invitation_password' },
    });
    expect(store.accept).not.toHaveBeenCalled();
  });

  it('requires the existing identity and its active session instead of auto-linking', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const passwordHasher = { hash: vi.fn(async () => 'password-hash') };
    const accept = makeAcceptWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      passwordHasher,
      clock: { now: () => workforceInvitationNow },
    });
    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-2',
      acceptance: {
        kind: 'existing_identity',
        authenticatedIdentityId: 'identity-id',
        authenticatedSessionId: 'session-id',
      },
    });

    expect(response.tag).toBe('ok');
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(store.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: 'hashed:invite',
        acceptance: {
          kind: 'existing_identity',
          authenticatedIdentityId: 'identity-id',
          authenticatedSessionId: 'session-id',
        },
      }),
    );
  });

  it('returns a safe failure when identity authentication is required', async () => {
    const accept = makeAcceptWorkforceInvitation({
      store: makeWorkforceInvitationStoreFake({
        accept: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'authentication_required' as const,
        })),
      }),
      tokenService: makeInvitationTokenServiceFake(),
      passwordHasher: { hash: vi.fn(async () => 'password-hash') },
      clock: { now: () => workforceInvitationNow },
    });
    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-3',
      acceptance: {
        kind: 'new_identity',
        password: 'Long-Enough-Password-123!',
      },
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: { code: 'invitation_identity_authentication_required' },
    });
  });
});
