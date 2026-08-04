import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  makeEndWorkforceMembership,
  makeReactivateWorkforceMembership,
  makeSuspendWorkforceMembership,
} from '../../../../../src/features/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.ts';
import type { WorkforceMembershipStore } from '../../../../../src/foundations/ports/workforce-membership-store/workforce-membership-store.port.ts';

const now = new Date('2026-07-29T12:00:00.000Z');
const actor = { identityId: 'owner-id', sessionId: 'owner-session' };
const grant = {
  id: 'grant-id',
  businessId: 'business-id',
  membershipId: 'membership-id',
  identityId: 'operator-id',
  role: 'operator' as const,
  scope: { kind: 'location' as const, id: 'location-id' },
  state: 'active' as const,
  version: 1,
  startsAt: now,
  endsAt: null,
  effective: true,
};
const member = {
  membershipId: 'membership-id',
  businessId: 'business-id',
  identityId: 'operator-id',
  displayName: 'Operator',
  email: 'operator@example.com',
  state: 'active' as const,
  version: 2,
  mfaEnabled: false,
  grants: [grant],
  startedAt: now,
  suspendedAt: null,
  endedAt: null,
  activeSessionCount: 0,
  createdAt: now,
  updatedAt: now,
};

const makeMembershipStore = (
  overrides: Partial<WorkforceMembershipStore> = {},
): WorkforceMembershipStore => ({
  list: vi.fn(async () => ({
    status: 'found' as const,
    page: { members: [member], nextCursor: null },
  })),
  detail: vi.fn(async () => ({ status: 'found' as const, member })),
  transition: vi.fn(async () => ({
    status: 'applied' as const,
    value: { member, revokedSessionCount: 3 },
  })),
  ...overrides,
});

describe('transition workforce membership', () => {
  it.each([
    ['suspend', makeSuspendWorkforceMembership],
    ['reactivate', makeReactivateWorkforceMembership],
    ['end', makeEndWorkforceMembership],
  ] as const)(
    'sends a versioned, idempotent %s graph event',
    async (event, make) => {
      const store = makeMembershipStore();
      const transition = make({ store, clock: { now: () => now } });
      const response = await transition({
        actor,
        businessId: 'business-id',
        membershipId: 'membership-id',
        expectedVersion: 1,
        reason: 'manager confirmed',
        idempotencyKey: `${event}-1`,
      });

      expect(response).toEqual(result.ok({ member, revokedSessionCount: 3 }));
      expect(store.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          event,
          expectedVersion: 1,
          idempotencyKey: `${event}-1`,
          commandHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
    },
  );

  it('surfaces stale races with the current version', async () => {
    const store = makeMembershipStore({
      transition: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: 'stale_version' as const,
        currentVersion: 4,
      })),
    });
    const suspend = makeSuspendWorkforceMembership({
      store,
      clock: { now: () => now },
    });
    const response = await suspend({
      actor,
      businessId: 'business-id',
      membershipId: 'membership-id',
      expectedVersion: 1,
      idempotencyKey: 'suspend-race',
    });

    expect(response.tag).toBe('err');
    if (response.tag === 'err') {
      expect(response.error.code).toBe('workforce_stale_version');
      expect(response.error.details).toEqual({ currentVersion: 4 });
    }
  });

  it('preserves serialized last-owner denial as an expected conflict', async () => {
    const store = makeMembershipStore({
      transition: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: 'last_owner' as const,
      })),
    });
    const end = makeEndWorkforceMembership({
      store,
      clock: { now: () => now },
    });
    const response = await end({
      actor,
      businessId: 'business-id',
      membershipId: 'owner-membership',
      expectedVersion: 2,
      idempotencyKey: 'end-last-owner',
    });

    expect(response.tag).toBe('err');
    if (response.tag === 'err')
      expect(response.error.code).toBe('workforce_last_owner');
  });
});
