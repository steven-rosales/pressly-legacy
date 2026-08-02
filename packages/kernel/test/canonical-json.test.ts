import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical-json.ts';
import { canonicalSha256 } from '../src/node.ts';

describe('canonicalJson', () => {
  it('sorts object keys recursively, preserves arrays, and normalizes dates', () => {
    expect(
      canonicalJson({
        z: [{ b: 2, a: 1 }],
        a: { d: 4, c: new Date('2026-07-21T12:00:00.000Z') },
      }),
    ).toBe('{"a":{"c":"2026-07-21T12:00:00.000Z","d":4},"z":[{"a":1,"b":2}]}');
  });

  it('produces the same SHA-256 digest for structurally equivalent values', () => {
    expect(canonicalSha256({ z: 2, a: { y: 1, x: 0 } })).toBe(
      canonicalSha256({ a: { x: 0, y: 1 }, z: 2 }),
    );
  });
});
