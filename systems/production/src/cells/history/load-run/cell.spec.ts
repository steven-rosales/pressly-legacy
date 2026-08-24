import { describe, expect, it, vi } from 'vitest';
import { makeLoadHistoryRunCell } from './cell.ts';

describe('load history run cell', () => {
  it('declares a selected headless repeatable-read capability', () => {
    const cell = makeLoadHistoryRunCell({
      repo: { load: vi.fn() },
      clock: { now: () => new Date() },
    });
    expect(cell).toMatchObject({
      id: 'production.load-history-run.v1',
      kind: 'query',
      authentication: 'none',
      authorization: null,
      consistency: { transaction: 'required', concurrency: 'none' },
      surfaces: [],
      observability: { operation: 'production.load_history_run' },
    });
  });
});
