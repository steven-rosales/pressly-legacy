import { describe, expect, it } from 'vitest';
import {
  decideWorkforceAdministration,
  decideWorkforceSessionAdministration,
  isWorkforceGrantEffective,
  type WorkforceAuthority,
} from '../../src/workforce/workforce-authority.policy.ts';

const owner: WorkforceAuthority = {
  identityActive: true,
  membershipState: 'active',
  businessId: 'business-a',
  role: 'owner',
  locationIds: [],
  assuranceLevel: 'mfa',
};

const manager: WorkforceAuthority = {
  ...owner,
  role: 'manager',
  locationIds: ['location-a'],
};

const decide = (
  actor: WorkforceAuthority,
  input: Partial<{
    targetBusinessId: string;
    targetIdentityId: string;
    actorIdentityId: string;
    targetRole: 'owner' | 'manager' | 'operator';
    targetLocationId: string | null;
  }> = {},
) =>
  decideWorkforceAdministration({
    actor,
    targetBusinessId: 'business-a',
    actorIdentityId: 'actor',
    targetIdentityId: 'target',
    targetRole: 'operator',
    targetLocationId: 'location-a',
    ...input,
  });

describe('workforce authority policy', () => {
  it.each([
    [{ ...owner, identityActive: false }, 'actor_inactive'],
    [
      { ...owner, membershipState: 'suspended' as const },
      'actor_membership_inactive',
    ],
    [
      { ...owner, assuranceLevel: 'password' as const },
      'insufficient_assurance',
    ],
  ])(
    'separates the deployment lock, membership, and assurance gates',
    (actor, reason) => {
      expect(decide(actor)).toEqual({ kind: 'denied', reason });
    },
  );

  it('allows an MFA-assured owner to manage another member in its business', () => {
    expect(decide(owner)).toEqual({ kind: 'allowed' });
  });

  it('allows managers to manage operators only inside their own locations', () => {
    expect(decide(manager)).toEqual({ kind: 'allowed' });
    expect(decide(manager, { targetRole: 'manager' })).toEqual({
      kind: 'denied',
      reason: 'manager_target_forbidden',
    });
    expect(decide(manager, { targetLocationId: 'location-b' })).toEqual({
      kind: 'denied',
      reason: 'outside_location',
    });
  });

  it('denies self access changes and cross-business changes', () => {
    expect(
      decide(owner, {
        targetIdentityId: 'actor',
      }),
    ).toEqual({ kind: 'denied', reason: 'self_access_change' });
    expect(
      decide(owner, {
        targetBusinessId: 'business-b',
      }),
    ).toEqual({ kind: 'denied', reason: 'outside_business' });
  });

  it('limits manager session administration to operators wholly inside their locations', () => {
    expect(
      decideWorkforceSessionAdministration({
        actor: manager,
        targetBusinessId: 'business-a',
        targetRole: 'operator',
        targetLocationIds: ['location-a'],
      }),
    ).toEqual({ kind: 'allowed' });
    expect(
      decideWorkforceSessionAdministration({
        actor: manager,
        targetBusinessId: 'business-a',
        targetRole: 'operator',
        targetLocationIds: ['location-a', 'location-b'],
      }),
    ).toEqual({ kind: 'denied', reason: 'outside_location' });
    expect(
      decideWorkforceSessionAdministration({
        actor: manager,
        targetBusinessId: 'business-a',
        targetRole: 'manager',
        targetLocationIds: ['location-a'],
      }),
    ).toEqual({
      kind: 'denied',
      reason: 'manager_target_forbidden',
    });
    expect(
      decideWorkforceSessionAdministration({
        actor: owner,
        targetBusinessId: 'business-a',
        targetRole: 'owner',
        targetLocationIds: [],
      }),
    ).toEqual({ kind: 'allowed' });
  });

  it('keeps privileged grants ineffective until MFA is enabled', () => {
    const common = {
      state: 'active' as const,
      membershipState: 'active' as const,
      now: new Date('2026-07-29T12:00:00.000Z'),
      startsAt: new Date('2026-07-29T11:00:00.000Z'),
      endsAt: null,
    };
    expect(
      isWorkforceGrantEffective({
        ...common,
        role: 'manager',
        mfaEnabled: false,
      }),
    ).toBe(false);
    expect(
      isWorkforceGrantEffective({
        ...common,
        role: 'manager',
        mfaEnabled: true,
      }),
    ).toBe(true);
    expect(
      isWorkforceGrantEffective({
        ...common,
        role: 'operator',
        mfaEnabled: false,
      }),
    ).toBe(true);
    expect(
      isWorkforceGrantEffective({
        ...common,
        startsAt: null,
        role: 'operator',
        mfaEnabled: false,
      }),
    ).toBe(true);
  });
});
