import { describe, expect, it } from 'vitest';
import { uuidIdSource } from '../src/node.ts';

describe('uuidIdSource', () => {
  it('provides immutable UUID generation behind the IdSource port', () => {
    expect(Object.isFrozen(uuidIdSource)).toBe(true);
    expect(uuidIdSource.next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
