import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatMoney } from './money.ts';

describe('formatMoney', () => {
  it('formats cents as localized currency', () => {
    assert.equal(formatMoney(495, 'USD'), '$4.95');
  });
});
