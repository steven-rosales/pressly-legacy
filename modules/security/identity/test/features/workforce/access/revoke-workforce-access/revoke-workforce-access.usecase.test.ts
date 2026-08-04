import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { makeRevokeWorkforceAccess } from '../../../../../src/features/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.ts';
import type { AccessGrantStore } from '../../../../../src/foundations/ports/workforce-access-store/workforce-access-store.port.ts';

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

describe('revoke workforce access', () => {
  it('returns the atomic session-revocation count after access reduction', async () => {
    const store: AccessGrantStore = {
      grant: vi.fn(async () => ({ status: 'applied' as const, value: grant })),
      revoke: vi.fn(async () => ({
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
      })),
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
