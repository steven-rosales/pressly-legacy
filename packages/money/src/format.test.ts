import { describe, expect, it } from 'vitest';
import { formatMoney } from './format.js';

describe('formatMoney', () => {
  it('formats cents as localized currency', () => {
    expect(formatMoney(495, 'USD')).toBe('$4.95');
  });
});
