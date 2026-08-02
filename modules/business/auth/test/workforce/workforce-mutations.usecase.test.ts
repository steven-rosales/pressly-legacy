import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { WorkforceMembershipStore } from '../../src/workforce/workforce-membership.port.ts';
import {
  makeEndWorkforceMembership,
  makeReactivateWorkforceMembership,
  makeSuspendWorkforceMembership,
} from '../../src/workforce/transition-workforce-membership.usecase.ts';
import type { AccessGrantStore } from '../../src/workforce/access-grant.port.ts';
import { makeRevokeWorkforceAccess } from '../../src/workforce/revoke-workforce-access.usecase.ts';

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
  list: vi.fn(async () =>
    result.ok({
      status: 'found' as const,
      page: { members: [member], nextCursor: null },
    }),
  ),
  detail: vi.fn(async () => result.ok({ status: 'found' as const, member })),
  transition: vi.fn(async () =>
    result.ok({
      status: 'applied' as const,
      value: { member, revokedSessionCount: 3 },
    }),
  ),
  ...overrides,
});

describe('workforce membership and access mutation use cases', () => {
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
      transition: vi.fn(async () =>
        result.ok({
          status: 'rejected' as const,
          reason: 'stale_version' as const,
          currentVersion: 4,
        }),
      ),
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
      expect(response.error.publicDetails).toEqual({ currentVersion: 4 });
      expect(response.error.details).toBeUndefined();
    }
  });

  it('preserves serialized last-owner denial as an expected conflict', async () => {
    const store = makeMembershipStore({
      transition: vi.fn(async () =>
        result.ok({
          status: 'rejected' as const,
          reason: 'last_owner' as const,
        }),
      ),
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

  it('returns the atomic session-revocation count after access reduction', async () => {
    const store: AccessGrantStore = {
      grant: vi.fn(async () =>
        result.ok({ status: 'applied' as const, value: grant }),
      ),
      revoke: vi.fn(async () =>
        result.ok({
          status: 'applied' as const,
          value: {
            grant: {
              ...grant,
              state: 'revoked' as const,
              version: 2,
              effective: false,
            },
            revokedSessionCount: 2,
          },
        }),
      ),
    };
    const revoke = makeRevokeWorkforceAccess({
      store,
      clock: { now: () => now },
    });
    const response = await revoke({
      actor,
      businessId: 'business-id',
      grantId: 'grant-id',
      expectedVersion: 1,
      reason: 'location access removed',
      idempotencyKey: 'revoke-grant-1',
    });

    expect(response).toEqual(
      result.ok({
        grant: { ...grant, state: 'revoked', version: 2, effective: false },
        revokedSessionCount: 2,
      }),
    );
  });
});
