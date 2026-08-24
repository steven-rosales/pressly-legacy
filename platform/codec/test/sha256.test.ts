import { describe, expect, it } from 'vitest';
import { sha256HexSchema } from '../src/sha256.ts';

describe('SHA-256 hex schema', () => {
  it('accepts exactly 32 bytes encoded as canonical lowercase hex', () => {
    expect(sha256HexSchema.parse('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it.each(['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)])(
    'rejects non-canonical digest %s',
    (value) => {
      expect(sha256HexSchema.safeParse(value).success).toBe(false);
    },
  );
});
