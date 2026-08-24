import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makePreviewOrderBacklogCell } from './cell.ts';

describe('preview order backlog cell', () => {
  it('declares a selected headless non-transactional query', () => {
    const cell = makePreviewOrderBacklogCell({
      repo: { loadSnapshot: vi.fn() },
      policy: productionRules,
      clock: { now: () => new Date() },
    });
    expect(cell).toMatchObject({
      id: 'production.preview-order-backlog.v1',
      kind: 'query',
      authentication: 'none',
      authorization: null,
      consistency: { transaction: 'none', concurrency: 'none' },
      surfaces: [],
      observability: { operation: 'production.preview_order_backlog' },
    });
  });
});
