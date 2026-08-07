import { describe, expect, it } from 'vitest';
import { makeSequenceIdSource } from '../src/id-source.ts';

describe('makeSequenceIdSource', () => {
  it('returns deterministic IDs in declaration order and fails on exhaustion', () => {
    const ids = makeSequenceIdSource(['id-1', 'id-2'] as const);

    expect(ids.next()).toBe('id-1');
    expect(ids.next()).toBe('id-2');
    expect(() => ids.next()).toThrowError(
      expect.objectContaining({ code: 'test_id_sequence_exhausted' }),
    );
  });
});
