import { describe, expect, it } from 'vitest';
import { encodeJsonBody } from '../src/json-body.js';

describe('JSON request-body encoding', () => {
  it('encodes supported JSON values', () => {
    expect(encodeJsonBody({ value: 'ok' })).toEqual({
      tag: 'encoded',
      body: '{"value":"ok"}',
    });
  });

  it('rejects unsupported top-level values as data', () => {
    expect(encodeJsonBody(undefined)).toEqual({
      tag: 'rejected',
      reason: 'unsupported_top_level_value',
    });
  });

  it.each([
    1n,
    (() => {
      const cyclic: { self?: unknown } = {};
      cyclic.self = cyclic;
      return cyclic;
    })(),
  ])('captures serialization failure for %#', (value) => {
    const encoded = encodeJsonBody(value);

    expect(encoded).toMatchObject({
      tag: 'rejected',
      reason: 'serialization_failed',
      cause: expect.any(TypeError),
    });
  });
});
