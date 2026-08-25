import { describe, expect, it } from 'vitest';
import { utcIsoStringSchema } from '../src/utc-iso.ts';

describe('UTC ISO string schema', () => {
  it.each([
    '2026-06-19T12:30:45Z',
    '2026-06-19T12:30:45.7Z',
    '2026-06-19T12:30:45.123Z',
    '2028-02-29T23:59:59.999Z',
  ])('accepts valid canonical UTC instant %s', (value) => {
    expect(utcIsoStringSchema.parse(value)).toBe(value);
  });

  it.each([
    '2026-02-29T12:30:45Z',
    '2026-06-19T12:30:45.1234Z',
    '2026-06-19T12:30:45.123-04:00',
    '2026-06-19t12:30:45Z',
    '2026-06-19T24:00:00Z',
  ])('rejects non-canonical or invalid instant %s', (value) => {
    expect(utcIsoStringSchema.safeParse(value).success).toBe(false);
  });
});
