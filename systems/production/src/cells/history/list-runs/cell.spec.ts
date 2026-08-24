import { describe, expect, it } from 'vitest';
import { listHistoryRunsCellDeclaration } from './cell.ts';

describe('list-history-runs cell', () => {
  it('declares authorization and repeatable-read transaction intent', () => {
    expect(listHistoryRunsCellDeclaration).toMatchObject({
      id: 'production.list-history-runs.v1',
      kind: 'query',
      authorization: { capability: 'production:read', timing: 'after-input' },
      consistency: { transaction: 'required', concurrency: 'none' },
      idempotency: { required: false },
    });
  });
});
