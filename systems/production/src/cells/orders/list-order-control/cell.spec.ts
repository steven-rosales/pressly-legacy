import { describe, expect, it, vi } from 'vitest';
import { makeListOrderControlCell } from './cell.ts';

describe('list order control cell', () => {
  it('declares a selected headless non-transactional query', () => {
    const cell = makeListOrderControlCell({
      repo: { list: vi.fn() },
      clock: { now: () => new Date() },
    });
    expect(cell).toMatchObject({
      id: 'production.list-order-control.v1',
      kind: 'query',
      authentication: 'none',
      authorization: null,
      consistency: { transaction: 'none', concurrency: 'none' },
      surfaces: [],
      observability: { operation: 'production.list_order_control' },
    });
  });
});
