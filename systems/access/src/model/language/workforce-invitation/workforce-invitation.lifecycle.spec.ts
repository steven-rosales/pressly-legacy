import { describe, expect, it } from 'vitest';
import {
  allowedWorkforceInvitationEvents,
  decideWorkforceInvitation,
  workforceInvitationEvents,
  workforceInvitationGraph,
  workforceInvitationStates,
} from './workforce-invitation.lifecycle.ts';

describe('workforce invitation lifecycle', () => {
  it('defines the complete graph and denies every terminal event', () => {
    expect(workforceInvitationGraph).toEqual([
      { from: 'pending', event: 'accept', to: 'accepted' },
      { from: 'pending', event: 'revoke', to: 'revoked' },
      { from: 'pending', event: 'expire', to: 'expired' },
    ]);
    expect(workforceInvitationStates).toEqual([
      'pending',
      'accepted',
      'revoked',
      'expired',
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
});
