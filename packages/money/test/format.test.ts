import { describe, expect, it } from 'vitest';
import { createMoney } from '../src/money.js';
import { formatMoney } from '../src/format.js';

describe('formatMoney', () => {
  it('formats cents as localized currency', () => {
    expect(formatMoney(495, 'USD')).toBe('$4.95');
  });

  it('also formats a validated Money value', () => {
    const value = createMoney(495, 'USD');
    expect(value.tag).toBe('ok');
    if (value.tag === 'ok') expect(formatMoney(value.value)).toBe('$4.95');
  });
});
