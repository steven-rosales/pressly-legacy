import { describe, expect, it } from 'vitest';
import { proposeIncomingOrderCellDeclaration } from './cell.ts';

describe('propose incoming Order cell declaration', () => {
  it('is a source-partitioned transactional command', () => {
    expect(proposeIncomingOrderCellDeclaration).toMatchObject({
      id: 'orders.propose-incoming-order.v1',
      kind: 'command',
      authentication: 'none',
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
      },
      idempotency: { required: false },
      surfaces: [],
      emits: [],
      consumes: [],
    });
    expect(
      proposeIncomingOrderCellDeclaration.consistency.concurrencyKey?.({
        source: 'cents',
        externalOrderId: 'order-1',
      } as never),
    ).toBe('cents:order-1');
  });
});
