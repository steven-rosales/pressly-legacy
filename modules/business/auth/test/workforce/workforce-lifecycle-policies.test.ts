import { describe, expect, it } from 'vitest';
import {
  accessGrantEvents,
  accessGrantGraph,
  accessGrantStates,
  allowedAccessGrantEvents,
  decideAccessGrant,
} from '../../src/workforce/access-grant.policy.ts';
import {
  allowedWorkforceInvitationEvents,
  decideWorkforceInvitation,
  workforceInvitationEvents,
  workforceInvitationGraph,
  workforceInvitationStates,
} from '../../src/workforce/workforce-invitation.policy.ts';
import {
  allowedWorkforceMembershipEvents,
  decideWorkforceMembership,
  workforceMembershipEvents,
  workforceMembershipGraph,
  workforceMembershipStates,
} from '../../src/workforce/workforce-membership.policy.ts';

describe('workforce lifecycle policies', () => {
  it('defines the complete invitation graph and denies every terminal event', () => {
    expect(workforceInvitationGraph).toEqual([
      { from: 'pending', event: 'accept', to: 'accepted' },
      { from: 'pending', event: 'revoke', to: 'revoked' },
      { from: 'pending', event: 'expire', to: 'expired' },
    ]);
    expect(allowedWorkforceInvitationEvents('pending')).toEqual([
      'accept',
      'revoke',
      'expire',
    ]);

    for (const terminal of ['accepted', 'revoked', 'expired'] as const) {
      expect(allowedWorkforceInvitationEvents(terminal)).toEqual([]);
      for (const event of workforceInvitationEvents)
        expect(decideWorkforceInvitation(terminal, event)).toEqual({
          kind: 'denied',
          from: terminal,
          event,
          allowedEvents: [],
        });
    }

    expect(decideWorkforceInvitation('pending', 'accept')).toMatchObject({
      kind: 'allowed',
      from: 'pending',
      to: 'accepted',
    });
  });

  it('defines suspension, reactivation, and terminal membership edges', () => {
    expect(workforceMembershipGraph).toEqual([
      { from: 'active', event: 'suspend', to: 'suspended' },
      { from: 'suspended', event: 'reactivate', to: 'active' },
      { from: 'active', event: 'end', to: 'ended' },
      { from: 'suspended', event: 'end', to: 'ended' },
    ]);
    expect(allowedWorkforceMembershipEvents('active')).toEqual([
      'suspend',
      'end',
    ]);
    expect(allowedWorkforceMembershipEvents('suspended')).toEqual([
      'reactivate',
      'end',
    ]);
    expect(allowedWorkforceMembershipEvents('ended')).toEqual([]);

    for (const event of workforceMembershipEvents)
      expect(decideWorkforceMembership('ended', event)).toEqual({
        kind: 'denied',
        from: 'ended',
        event,
        allowedEvents: [],
      });

    expect(decideWorkforceMembership('active', 'reactivate')).toEqual({
      kind: 'denied',
      from: 'active',
      event: 'reactivate',
      allowedEvents: ['suspend', 'end'],
    });
  });

  it('defines revocation and expiry as terminal access-grant decisions', () => {
    expect(accessGrantGraph).toEqual([
      { from: 'active', event: 'revoke', to: 'revoked' },
      { from: 'active', event: 'expire', to: 'expired' },
    ]);
    expect(allowedAccessGrantEvents('active')).toEqual(['revoke', 'expire']);

    for (const terminal of ['revoked', 'expired'] as const) {
      expect(allowedAccessGrantEvents(terminal)).toEqual([]);
      for (const event of accessGrantEvents)
        expect(decideAccessGrant(terminal, event)).toEqual({
          kind: 'denied',
          from: terminal,
          event,
          allowedEvents: [],
        });
    }
  });

  it('declares every known state exactly once', () => {
    expect(workforceInvitationStates).toEqual([
      'pending',
      'accepted',
      'revoked',
      'expired',
    ]);
    expect(workforceMembershipStates).toEqual(['active', 'suspended', 'ended']);
    expect(accessGrantStates).toEqual(['active', 'revoked', 'expired']);
  });
});
