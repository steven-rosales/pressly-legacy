import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { WorkforceInvitationStore } from '../../src/workforce/workforce-invitation.port.ts';
import { makeIssueWorkforceInvitation } from '../../src/workforce/issue-workforce-invitation.usecase.ts';
import { makeReissueWorkforceInvitation } from '../../src/workforce/reissue-workforce-invitation.usecase.ts';
import { makeAcceptWorkforceInvitation } from '../../src/workforce/accept-workforce-invitation.usecase.ts';
import { makePreviewWorkforceInvitation } from '../../src/workforce/preview-workforce-invitation.usecase.ts';

const now = new Date('2026-07-29T12:00:00.000Z');
const actor = { identityId: 'owner-id', sessionId: 'owner-session' };
const invitation = {
  id: 'invitation-id',
  businessId: 'business-id',
  emailNormalized: 'operator@example.com',
  displayName: 'Operator One',
  intendedRole: 'operator' as const,
  intendedLocationId: 'location-id',
  state: 'pending' as const,
  version: 1,
  expiresAt: new Date('2026-08-01T12:00:00.000Z'),
  createdAt: now,
};

const makeStore = (
  overrides: Partial<WorkforceInvitationStore> = {},
): WorkforceInvitationStore => ({
  issue: vi.fn(async () =>
    result.ok({ status: 'applied' as const, value: invitation }),
  ),
  reissue: vi.fn(async () =>
    result.ok({ status: 'applied' as const, value: invitation }),
  ),
  revoke: vi.fn(async () =>
    result.ok({ status: 'applied' as const, value: invitation }),
  ),
  preview: vi.fn(async () =>
    result.ok({
      status: 'available' as const,
      value: {
        invitationId: invitation.id,
        businessId: invitation.businessId,
        businessName: 'Pressly',
        emailNormalized: invitation.emailNormalized,
        displayName: invitation.displayName,
        intendedRole: invitation.intendedRole,
        intendedLocationId: invitation.intendedLocationId,
        expiresAt: invitation.expiresAt,
        existingIdentity: false,
      },
    }),
  ),
  accept: vi.fn(async () =>
    result.ok({
      status: 'applied' as const,
      value: {
        invitation,
        identityId: 'identity-id',
        membershipId: 'membership-id',
        identityCreated: true,
        privilegedAccessEffective: true,
      },
    }),
  ),
  list: vi.fn(async () =>
    result.ok({
      status: 'found' as const,
      invitations: [invitation],
      nextCursor: null,
    }),
  ),
  ...overrides,
});

const tokenService = {
  issue: vi.fn(() => 'raw-invitation-token'),
  hash: vi.fn((token: string) => `hashed:${token}`),
};
const clock = { now: () => now };

describe('workforce invitation use cases', () => {
  it('normalizes email, stores only the keyed hash, and returns the raw token once', async () => {
    const store = makeStore();
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService,
      clock,
      invitationTtlMinutes: 60,
    });
    const response = await issue({
      actor,
      businessId: 'business-id',
      email: ' Operator@Example.COM ',
      displayName: ' Operator One ',
      intendedRole: 'operator',
      intendedLocationId: 'location-id',
      idempotencyKey: 'issue-1',
    });

    expect(response).toEqual(
      result.ok({
        status: 'issued',
        invitation,
        token: 'raw-invitation-token',
      }),
    );
    expect(store.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        emailNormalized: 'operator@example.com',
        displayName: 'Operator One',
        tokenHash: 'hashed:raw-invitation-token',
      }),
    );
    expect(JSON.stringify(vi.mocked(store.issue).mock.calls)).not.toContain(
      '"token":"raw-invitation-token"',
    );
  });

  it('does not disclose a newly generated token when issue is an idempotent replay', async () => {
    const store = makeStore({
      issue: vi.fn(async () =>
        result.ok({ status: 'replayed' as const, value: invitation }),
      ),
    });
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService,
      clock,
      invitationTtlMinutes: 60,
    });
    const response = await issue({
      actor,
      businessId: 'business-id',
      email: invitation.emailNormalized,
      displayName: invitation.displayName,
      intendedRole: 'operator',
      intendedLocationId: 'location-id',
      idempotencyKey: 'issue-1',
    });

    expect(response).toEqual(result.ok({ status: 'replayed', invitation }));
    expect(JSON.stringify(response)).not.toContain('raw-invitation-token');
  });

  it('does not disclose a replacement token when reissue is replayed', async () => {
    const store = makeStore({
      reissue: vi.fn(async () =>
        result.ok({ status: 'replayed' as const, value: invitation }),
      ),
    });
    const reissue = makeReissueWorkforceInvitation({
      store,
      tokenService,
      clock,
      invitationTtlMinutes: 60,
    });
    const response = await reissue({
      actor,
      businessId: 'business-id',
      invitationId: invitation.id,
      expectedVersion: 1,
      idempotencyKey: 'reissue-1',
    });

    expect(response).toEqual(result.ok({ status: 'replayed', invitation }));
    expect(JSON.stringify(response)).not.toContain('raw-invitation-token');
  });

  it('requires a strong self-selected password for a new identity', async () => {
    const store = makeStore();
    const accept = makeAcceptWorkforceInvitation({
      store,
      tokenService,
      passwordHasher: {
        hash: vi.fn(async () => result.ok('password-hash')),
      },
      clock,
    });
    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-1',
      acceptance: { kind: 'new_identity', password: 'weak' },
    });

    expect(response.tag).toBe('err');
    if (response.tag === 'err')
      expect(response.error.code).toBe('weak_invitation_password');
    expect(store.accept).not.toHaveBeenCalled();
  });

  it('requires the existing identity and its active session instead of auto-linking', async () => {
    const store = makeStore();
    const passwordHasher = {
      hash: vi.fn(async () => result.ok('password-hash')),
    };
    const accept = makeAcceptWorkforceInvitation({
      store,
      tokenService,
      passwordHasher,
      clock,
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

  it('returns safe expected failures for existing-email and expired-token paths', async () => {
    const acceptStore = makeStore({
      accept: vi.fn(async () =>
        result.ok({
          status: 'rejected' as const,
          reason: 'authentication_required' as const,
        }),
      ),
    });
    const accept = makeAcceptWorkforceInvitation({
      store: acceptStore,
      tokenService,
      passwordHasher: {
        hash: vi.fn(async () => result.ok('password-hash')),
      },
      clock,
    });
    const accepted = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-3',
      acceptance: {
        kind: 'new_identity',
        password: 'Long-Enough-Password-123!',
      },
    });
    expect(accepted.tag).toBe('err');
    if (accepted.tag === 'err')
      expect(accepted.error.code).toBe(
        'invitation_identity_authentication_required',
      );

    const preview = makePreviewWorkforceInvitation({
      store: makeStore({
        preview: vi.fn(async () =>
          result.ok({
            status: 'rejected' as const,
            reason: 'expired_token' as const,
          }),
        ),
      }),
      tokenService,
      clock,
    });
    const expired = await preview('invite');
    expect(expired.tag).toBe('err');
    if (expired.tag === 'err')
      expect(expired.error.code).toBe('workforce_expired_token');
  });
});
