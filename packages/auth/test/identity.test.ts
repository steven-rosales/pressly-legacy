import { describe, expect, it } from 'vitest';

import { normalizeEmail } from '../src/authentication/index.ts';

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lowercases email addresses', () => {
    expect(normalizeEmail('  Steven.Rosales@Example.COM  ')).toBe(
      'steven.rosales@example.com',
    );
  });
});
