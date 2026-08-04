import { describe, expect, it } from 'vitest';
import { jsonValueSchema } from '../src/zod.ts';

describe('strict JSON value schema', () => {
  it('accepts recursive JSON and preserves its proven type', () => {
    expect(
      jsonValueSchema.parse({ source: 'cents', items: [1, true, null] }),
    ).toEqual({ source: 'cents', items: [1, true, null] });
  });

  it.each([
    undefined,
    { omitted: undefined },
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date('2026-08-03T00:00:00.000Z'),
  ])('rejects non-JSON input %#', (value) => {
    expect(jsonValueSchema.safeParse(value).success).toBe(false);
  });
});
