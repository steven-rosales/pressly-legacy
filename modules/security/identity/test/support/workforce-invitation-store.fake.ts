import { vi } from 'vitest';
import type { WorkforceInvitationStore } from '../../src/foundations/ports/workforce-invitation-store/workforce-invitation-store.port.ts';

export const workforceInvitationNow = new Date('2026-07-29T12:00:00.000Z');
export const workforceActor = {
  identityId: 'owner-id',
  sessionId: 'owner-session',
};
export const workforceInvitation = {
  id: 'invitation-id',
  businessId: 'business-id',
  emailNormalized: 'operator@example.com',
  displayName: 'Operator One',
  intendedRole: 'operator' as const,
  intendedLocationId: 'location-id',
  state: 'pending' as const,
  version: 1,
  expiresAt: new Date('2026-08-01T12:00:00.000Z'),
  createdAt: workforceInvitationNow,
};

export const makeWorkforceInvitationStoreFake = (
  overrides: Partial<WorkforceInvitationStore> = {},
): WorkforceInvitationStore => ({
  issue: vi.fn(async () => ({
    status: 'applied' as const,
    value: workforceInvitation,
  })),
  reissue: vi.fn(async () => ({
    status: 'applied' as const,
    value: workforceInvitation,
  })),
  revoke: vi.fn(async () => ({
    status: 'applied' as const,
    value: workforceInvitation,
  })),
  preview: vi.fn(async () => ({
    status: 'available' as const,
    value: {
      invitationId: workforceInvitation.id,
      businessId: workforceInvitation.businessId,
      businessName: 'Pressly',
      emailNormalized: workforceInvitation.emailNormalized,
      displayName: workforceInvitation.displayName,
      intendedRole: workforceInvitation.intendedRole,
      intendedLocationId: workforceInvitation.intendedLocationId,
      expiresAt: workforceInvitation.expiresAt,
      existingIdentity: false,
    },
  })),
  accept: vi.fn(async () => ({
    status: 'applied' as const,
    value: {
      invitation: workforceInvitation,
      identityId: 'identity-id',
      membershipId: 'membership-id',
      identityCreated: true,
      privilegedAccessEffective: true,
    },
  })),
  list: vi.fn(async () => ({
    status: 'found' as const,
    invitations: [workforceInvitation],
    nextCursor: null,
  })),
  ...overrides,
});

export const makeInvitationTokenServiceFake = () => ({
  issue: vi.fn(() => 'raw-invitation-token'),
  hash: vi.fn((token: string) => `hashed:${token}`),
});
