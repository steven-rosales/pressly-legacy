import { describe, expect, it, vi } from 'vitest';
import type { ListIncomingOrderProposalsRepository } from '../../../../src/features/intake/list-incoming-order-proposals/list-incoming-order-proposals.port.ts';
import { makeListIncomingOrderProposals } from '../../../../src/features/intake/list-incoming-order-proposals/list-incoming-order-proposals.usecase.ts';

describe('list incoming Order proposals', () => {
  it('passes the selected lifecycle view through pagination', async () => {
    const list = vi.fn(async () => ({
      kind: 'invalid_cursor' as const,
    }));
    const repo: ListIncomingOrderProposalsRepository = { list };
    const outcome = await makeListIncomingOrderProposals(repo)({
      locationId: 'east',
      limit: 50,
      cursor: 'not-a-cursor',
      view: 'source_closed',
    });

    expect(list).toHaveBeenCalledWith({
      locationId: 'east',
      limit: 50,
      cursor: 'not-a-cursor',
      view: 'source_closed',
    });
    expect(outcome).toMatchObject({
      tag: 'err',
      error: {
        kind: 'validation',
        code: 'incoming_order_proposal_cursor_invalid',
      },
    });
  });
});
