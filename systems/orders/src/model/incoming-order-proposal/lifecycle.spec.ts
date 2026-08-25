import { describe, expect, it } from 'vitest';
import { decideIncomingOrderProposal } from './lifecycle.ts';

describe('incoming Order proposal lifecycle', () => {
  it.each([
    ['pending', 'accept', 'accepted'],
    ['pending', 'reject', 'rejected'],
    ['pending', 'source_close', 'source_closed'],
    ['source_closed', 'restore', 'restored_pending'],
    ['restored_pending', 'accept', 'accepted'],
    ['restored_pending', 'reject', 'rejected'],
  ] as const)('allows %s --%s--> %s', (from, event, to) => {
    expect(decideIncomingOrderProposal(from, event)).toEqual({
      kind: 'allowed',
      from,
      to,
      event,
    });
  });

  it('keeps accepted and rejected terminal and protects restored work from source closure', () => {
    expect(decideIncomingOrderProposal('accepted', 'source_close')).toEqual({
      kind: 'denied',
      from: 'accepted',
      event: 'source_close',
      allowedEvents: [],
    });
    expect(decideIncomingOrderProposal('rejected', 'restore')).toEqual({
      kind: 'denied',
      from: 'rejected',
      event: 'restore',
      allowedEvents: [],
    });
    expect(
      decideIncomingOrderProposal('restored_pending', 'source_close'),
    ).toMatchObject({
      kind: 'denied',
      from: 'restored_pending',
      event: 'source_close',
      allowedEvents: ['accept', 'reject'],
    });
  });
});
