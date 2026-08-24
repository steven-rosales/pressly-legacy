import { describe, expect, it } from 'vitest';
import {
  accessGrantEvents,
  accessGrantGraph,
  accessGrantStates,
  allowedAccessGrantEvents,
  decideAccessGrant,
} from './access-grant.lifecycle.ts';

describe('access grant lifecycle', () => {
  it('defines revocation and expiry as terminal decisions', () => {
    expect(accessGrantGraph).toEqual([
      { from: 'active', event: 'revoke', to: 'revoked' },
      { from: 'active', event: 'expire', to: 'expired' },
    ]);
    expect(accessGrantStates).toEqual(['active', 'revoked', 'expired']);
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
});
