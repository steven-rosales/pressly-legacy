import { describe, expect, it } from 'vitest';
import { listLocationsCellDeclaration } from './cell.ts';

describe('list-locations cell', () => {
  it('leaves authentication and async location-scope resolution host-owned', () => {
    expect(listLocationsCellDeclaration).toMatchObject({
      id: 'production.list-locations.v1',
      kind: 'query',
      authentication: 'required',
      authorization: null,
      consistency: { transaction: 'none', concurrency: 'none' },
      idempotency: { required: false },
    });
  });
});
