import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical-json.ts';

describe('canonicalJson', () => {
  it('sorts object keys recursively, preserves arrays, and normalizes dates', () => {
    expect(
      canonicalJson({
        z: [{ b: 2, a: 1 }],
        a: { d: 4, c: new Date('2026-07-21T12:00:00.000Z') },
      }),
    ).toBe('{"a":{"c":"2026-07-21T12:00:00.000Z","d":4},"z":[{"a":1,"b":2}]}');
  });
});
