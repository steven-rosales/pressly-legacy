import { describe, expect, it } from 'vitest';
import { listWorkforceContract } from './contract.ts';
import { projectWorkforceMemberSummary } from './list-workforce.repo.ts';

describe('list workforce PostgreSQL projection', () => {
  it('removes detail-only fields before returning the declared summary page', () => {
    const instant = new Date('2026-08-22T19:30:00.000Z');
    const summary = projectWorkforceMemberSummary({
      membershipId: 'membership-1',
      businessId: 'business-1',
      identityId: 'identity-1',
      displayName: 'Grace Hopper',
      email: 'grace@example.com',
      state: 'active',
      version: 1,
      mfaEnabled: true,
      grants: [],
      startedAt: instant,
      suspendedAt: null,
      endedAt: null,
      activeSessionCount: 1,
      createdAt: instant,
      updatedAt: instant,
    });

    expect(summary).not.toHaveProperty('activeSessionCount');
    expect(summary).not.toHaveProperty('createdAt');
    expect(summary).not.toHaveProperty('updatedAt');
    expect(
      listWorkforceContract.output.encode({
        members: [summary],
        nextCursor: null,
      }),
    ).toEqual({
      members: [
        {
          membershipId: 'membership-1',
          businessId: 'business-1',
          identityId: 'identity-1',
          displayName: 'Grace Hopper',
          email: 'grace@example.com',
          state: 'active',
          version: 1,
          mfaEnabled: true,
          grants: [],
          startedAt: instant.toISOString(),
          suspendedAt: null,
          endedAt: null,
        },
      ],
      nextCursor: null,
    });
  });
});
