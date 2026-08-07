import { result, type Result } from '@pressly/kernel';

declare const moneyBrand: unique symbol;

/**
 * An immutable monetary amount expressed in the smallest unit used by its
 * currency. Construct values with createMoney so the integer and currency
 * invariants hold before arithmetic begins.
 */
export type Money = Readonly<{
  minorUnits: number;
  currency: string;
  [moneyBrand]: true;
}>;

export type MoneyComparison = -1 | 0 | 1;

export type MoneyFailure =
  | Readonly<{
      code: 'money_minor_units_invalid';
      message: string;
      minorUnits: number;
    }>
  | Readonly<{
      code: 'money_currency_invalid';
      message: string;
      currency: string;
    }>
  | Readonly<{
      code: 'money_currency_mismatch';
      message: string;
      leftCurrency: string;
      rightCurrency: string;
    }>
  | Readonly<{
      code: 'money_minor_units_overflow';
      message: string;
      operation: 'add' | 'subtract';
      leftMinorUnits: number;
      rightMinorUnits: number;
    }>;

const currencyCodePattern = /^[A-Z]{3}$/;

export const createMoney = (
  minorUnits: number,
  currency: string,
): Result<Money, MoneyFailure> => {
  if (!Number.isSafeInteger(minorUnits))
    return result.err({
      code: 'money_minor_units_invalid',
      message: 'Money minor units must be a safe integer.',
      minorUnits,
    });

  if (!currencyCodePattern.test(currency))
    return result.err({
      code: 'money_currency_invalid',
      message: 'Money currency must be a three-letter uppercase code.',
      currency,
    });

  return result.ok(
    Object.freeze({
      minorUnits: Object.is(minorUnits, -0) ? 0 : minorUnits,
      currency,
    }) as Money,
  );
};

const currencyMismatch = (left: Money, right: Money): MoneyFailure | null =>
  left.currency === right.currency
    ? null
    : {
        code: 'money_currency_mismatch',
        message: 'Money operations require matching currencies.',
        leftCurrency: left.currency,
        rightCurrency: right.currency,
      };

const calculate = (
  operation: 'add' | 'subtract',
  left: Money,
  right: Money,
): Result<Money, MoneyFailure> => {
  const mismatch = currencyMismatch(left, right);
  if (mismatch !== null) return result.err(mismatch);

  const minorUnits =
    operation === 'add'
      ? left.minorUnits + right.minorUnits
      : left.minorUnits - right.minorUnits;

  if (!Number.isSafeInteger(minorUnits))
    return result.err({
      code: 'money_minor_units_overflow',
      message: 'Money arithmetic exceeded the safe integer range.',
      operation,
      leftMinorUnits: left.minorUnits,
      rightMinorUnits: right.minorUnits,
    });

  return createMoney(minorUnits, left.currency);
};

export const addMoney = (
  left: Money,
  right: Money,
): Result<Money, MoneyFailure> => calculate('add', left, right);

export const subtractMoney = (
  left: Money,
  right: Money,
): Result<Money, MoneyFailure> => calculate('subtract', left, right);

export const compareMoney = (
  left: Money,
  right: Money,
): Result<MoneyComparison, MoneyFailure> => {
  const mismatch = currencyMismatch(left, right);
  if (mismatch !== null) return result.err(mismatch);

  return result.ok(
    left.minorUnits < right.minorUnits
      ? -1
      : left.minorUnits > right.minorUnits
        ? 1
        : 0,
  );
};

export const minMoney = (
  left: Money,
  right: Money,
): Result<Money, MoneyFailure> => {
  const comparison = compareMoney(left, right);
  return comparison.tag === 'err'
    ? comparison
    : result.ok(comparison.value <= 0 ? left : right);
};

export const maxMoney = (
  left: Money,
  right: Money,
): Result<Money, MoneyFailure> => {
  const comparison = compareMoney(left, right);
  return comparison.tag === 'err'
    ? comparison
    : result.ok(comparison.value >= 0 ? left : right);
};

/** Declarative namespace for pipelines that prefer one stable algebra value. */
export const money = Object.freeze({
  create: createMoney,
  add: addMoney,
  subtract: subtractMoney,
  compare: compareMoney,
  min: minMoney,
  max: maxMoney,
});
