import type { Result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import {
  addMoney,
  compareMoney,
  createMoney,
  maxMoney,
  minMoney,
  money,
  subtractMoney,
  type Money,
  type MoneyFailure,
} from '../src/money.js';

const valueOf = <Value>(outcome: Result<Value, MoneyFailure>): Value =>
  outcome.tag === 'ok'
    ? outcome.value
    : expect.fail(`Expected money result to succeed: ${outcome.error.code}`);

const usd = (minorUnits: number): Money =>
  valueOf(createMoney(minorUnits, 'USD'));

describe('Money', () => {
  it('constructs immutable safe-integer minor-unit values', () => {
    const value = valueOf(createMoney(-0, 'USD'));

    expect(value).toEqual({ minorUnits: 0, currency: 'USD' });
    expect(Object.isFrozen(value)).toBe(true);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects invalid minor units: %s',
    (minorUnits) => {
      expect(createMoney(minorUnits, 'USD')).toEqual({
        tag: 'err',
        error: expect.objectContaining({
          code: 'money_minor_units_invalid',
          minorUnits,
        }),
      });
    },
  );

  it.each(['usd', 'US', 'USDD', 'U1D', ''])(
    'rejects currency %s',
    (currency) => {
      expect(createMoney(100, currency)).toEqual({
        tag: 'err',
        error: expect.objectContaining({
          code: 'money_currency_invalid',
          currency,
        }),
      });
    },
  );

  it('adds and subtracts same-currency values', () => {
    expect(valueOf(addMoney(usd(700), usd(250)))).toEqual({
      minorUnits: 950,
      currency: 'USD',
    });
    expect(valueOf(money.subtract(usd(700), usd(250)))).toEqual({
      minorUnits: 450,
      currency: 'USD',
    });
  });

  it('reports overflow without constructing an unsafe value', () => {
    expect(addMoney(usd(Number.MAX_SAFE_INTEGER), usd(1))).toEqual({
      tag: 'err',
      error: expect.objectContaining({
        code: 'money_minor_units_overflow',
        operation: 'add',
      }),
    });
    expect(subtractMoney(usd(Number.MIN_SAFE_INTEGER), usd(1))).toEqual({
      tag: 'err',
      error: expect.objectContaining({
        code: 'money_minor_units_overflow',
        operation: 'subtract',
      }),
    });
  });

  it('compares and selects minima and maxima declaratively', () => {
    const low = usd(100);
    const equalLow = usd(100);
    const high = usd(200);

    expect(valueOf(compareMoney(low, high))).toBe(-1);
    expect(valueOf(compareMoney(high, low))).toBe(1);
    expect(valueOf(compareMoney(low, equalLow))).toBe(0);
    expect(valueOf(minMoney(low, high))).toBe(low);
    expect(valueOf(maxMoney(low, high))).toBe(high);
    expect(valueOf(minMoney(low, equalLow))).toBe(low);
    expect(valueOf(maxMoney(low, equalLow))).toBe(low);
  });

  it.each([
    ['add', addMoney],
    ['subtract', subtractMoney],
    ['compare', compareMoney],
    ['min', minMoney],
    ['max', maxMoney],
  ] as const)('rejects a currency mismatch for %s', (_name, operation) => {
    const dollars = valueOf(createMoney(100, 'USD'));
    const euros = valueOf(createMoney(100, 'EUR'));
    const outcome = operation(dollars, euros);

    expect(outcome).toEqual({
      tag: 'err',
      error: {
        code: 'money_currency_mismatch',
        message: 'Money operations require matching currencies.',
        leftCurrency: 'USD',
        rightCurrency: 'EUR',
      },
    });
  });
});
