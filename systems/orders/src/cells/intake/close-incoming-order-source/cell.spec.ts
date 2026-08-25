import { describe, expect, it } from 'vitest';
import { closeIncomingOrderSourceCellDeclaration } from './cell.ts';
import type { CloseIncomingOrderSourceCommand } from './types.ts';

const command = (): CloseIncomingOrderSourceCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId: 'source-order-1',
  terminalCode: 'completed',
  revision: {
    at: new Date('2026-08-22T16:05:00.000Z'),
    hash: 'b'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-22T16:05:01.000Z'),
    normalizedPayload: {
      order: { id: 'source-order-1', state: 'completed' },
    },
  },
});

describe('close incoming Order source cell declaration', () => {
  it('is selected, source-partitioned and carries the deployed derived identity', () => {
    expect(closeIncomingOrderSourceCellDeclaration).toMatchObject({
      id: 'orders.close-incoming-order-source.v1',
      kind: 'command',
      authentication: 'none',
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
      },
      idempotency: { required: true },
      surfaces: [],
      emits: [],
      consumes: [],
    });
    expect(
      closeIncomingOrderSourceCellDeclaration.consistency.concurrencyKey?.(
        command(),
      ),
    ).toBe('cents:source-order-1');
    expect(
      closeIncomingOrderSourceCellDeclaration.idempotency.key?.(command()),
    ).toBe(
      `incoming-order-source-close:cents:source-order-1:${'b'.repeat(64)}`,
    );
    expect(
      closeIncomingOrderSourceCellDeclaration.idempotency.fingerprint?.(
        command(),
      ),
    ).toMatch(/^[a-f0-9]{64}$/);
  });
});
