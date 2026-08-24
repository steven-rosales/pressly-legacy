import { describe, expect, it } from 'vitest';
import { makeWebCryptoIdempotencyAdapter } from '../../../src/runtime/web-crypto-idempotency.adapter.ts';

describe('processor idempotency identity', () => {
  it('returns the same bounded key for the same semantic command', async () => {
    const idempotency = makeWebCryptoIdempotencyAdapter(globalThis.crypto);
    const first = await idempotency.key({
      operation: 'record-order-intake',
      payload: { orderId: 'order-1', expectedVersion: 2, bagCount: 4 },
    });
    const retry = await idempotency.key({
      operation: 'record-order-intake',
      payload: { bagCount: 4, expectedVersion: 2, orderId: 'order-1' },
    });
    const changed = await idempotency.key({
      operation: 'record-order-intake',
      payload: { orderId: 'order-1', expectedVersion: 2, bagCount: 5 },
    });

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).toMatch(/^processor:v1:record-order-intake:[a-f0-9]{64}$/);
    expect(first.length).toBeLessThanOrEqual(200);
  });
});
