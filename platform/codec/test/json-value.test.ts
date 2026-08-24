import { describe, expect, it } from 'vitest';
import { isJsonObject, isJsonValue } from '../src/json-value.ts';

describe('JSON value guards', () => {
  it('accepts finite recursive JSON values', () => {
    const value = {
      source: 'cents',
      retry: 2,
      active: true,
      optional: null,
      items: ['shirt', { quantity: 2 }],
    };

    expect(isJsonValue(value)).toBe(true);
    expect(isJsonObject(value)).toBe(true);
    expect(isJsonValue([value])).toBe(true);
  });

  it.each([
    undefined,
    1n,
    Symbol('not-json'),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date('2026-08-03T00:00:00.000Z'),
  ])('rejects non-JSON value %s', (value) => {
    expect(isJsonValue(value)).toBe(false);
  });

  it('rejects cyclic objects', () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(isJsonValue(value)).toBe(false);
  });

  it('distinguishes JSON objects from arrays and primitives', () => {
    expect(isJsonObject({ value: 1 })).toBe(true);
    expect(isJsonObject([1])).toBe(false);
    expect(isJsonObject('value')).toBe(false);
  });
});
