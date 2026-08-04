import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { makeIssueWorkforceInvitation } from '../../../../../src/features/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.ts';
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

describe('issue workforce invitation', () => {
  it('rejects invalid invitation TTL configuration', () => {
    expect(
      captureError(() =>
        makeIssueWorkforceInvitation({
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

  it('normalizes email, stores only the keyed hash, and returns the raw token once', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });
    const response = await issue({
      actor: workforceActor,
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
        invitation: workforceInvitation,
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

  it('does not disclose a newly generated token on idempotent replay', async () => {
    const store = makeWorkforceInvitationStoreFake({
      issue: vi.fn(async () => ({
        status: 'replayed' as const,
        value: workforceInvitation,
      })),
    });
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });
    const response = await issue({
      actor: workforceActor,
      businessId: 'business-id',
      email: workforceInvitation.emailNormalized,
      displayName: workforceInvitation.displayName,
      intendedRole: 'operator',
      intendedLocationId: 'location-id',
      idempotencyKey: 'issue-1',
    });

    expect(response).toEqual(
      result.ok({ status: 'replayed', invitation: workforceInvitation }),
    );
    expect(JSON.stringify(response)).not.toContain('raw-invitation-token');
  });
});
