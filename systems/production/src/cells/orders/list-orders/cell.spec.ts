import { describe, expect, it } from 'vitest';
import { listOrdersCellDeclaration } from './cell.ts';

describe('list-orders cell', () => {
  it('declares a location-authorized side-effect-free query', () => {
    expect(listOrdersCellDeclaration).toMatchObject({
      id: 'production.list-orders.v1',
      kind: 'query',
      authorization: { capability: 'production:read', timing: 'after-input' },
      consistency: { transaction: 'none', concurrency: 'none' },
      idempotency: { required: false },
    });
  });
});
