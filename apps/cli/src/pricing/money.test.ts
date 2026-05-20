import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMoneyCents } from './money.ts';

describe('parseMoneyCents', () => {
  it('parses dollar values without floating-point math', () => {
    assert.deepEqual(parseMoneyCents('4.95'), { ok: true, value: 495 });
    assert.deepEqual(parseMoneyCents('$4.95'), { ok: true, value: 495 });
    assert.deepEqual(parseMoneyCents('4'), { ok: true, value: 400 });
    assert.deepEqual(parseMoneyCents('495c'), { ok: true, value: 495 });
  });

  it('rejects ambiguous money values', () => {
    const result = parseMoneyCents('4.999');

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.error.code, 'invalid_money_value');
    }
  });
});
