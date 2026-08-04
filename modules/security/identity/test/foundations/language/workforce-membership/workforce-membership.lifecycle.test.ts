import { describe, expect, it } from 'vitest';
import {
  allowedWorkforceMembershipEvents,
  decideWorkforceMembership,
  workforceMembershipEvents,
  workforceMembershipGraph,
  workforceMembershipStates,
} from '../../../../src/foundations/language/workforce-membership/workforce-membership.lifecycle.ts';

describe('workforce membership lifecycle', () => {
  it('defines suspension, reactivation, and terminal membership edges', () => {
    expect(workforceMembershipGraph).toEqual([
      { from: 'active', event: 'suspend', to: 'suspended' },
      { from: 'suspended', event: 'reactivate', to: 'active' },
      { from: 'active', event: 'end', to: 'ended' },
      { from: 'suspended', event: 'end', to: 'ended' },
    ]);
    expect(workforceMembershipStates).toEqual(['active', 'suspended', 'ended']);
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
});
