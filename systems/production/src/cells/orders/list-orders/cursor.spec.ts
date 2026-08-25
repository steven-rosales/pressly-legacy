import { describe, expect, it } from 'vitest';
import { decodeOrderCursor, encodeOrderCursor } from './cursor.ts';

describe('list-orders cursor', () => {
  it('uses the opaque UUID cursor and rejects malformed values', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const cursor = encodeOrderCursor(id);
    expect(cursor).toBe('MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAx');
    expect(decodeOrderCursor(cursor)).toBe(id);
    expect(decodeOrderCursor('not-a-valid-order-cursor')).toBeNull();
  });
});
