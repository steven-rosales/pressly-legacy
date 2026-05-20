import {
  err,
  ok,
  validationError,
  type AppError,
  type Result,
} from '@pressly/errors';

export const parseMoneyCents = (value: string): Result<number, AppError> => {
  const trimmed = value.trim();
  const raw = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;

  if (/^\d+c$/i.test(raw)) return ok(Number(raw.slice(0, -1)));

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw))
    return err(
      validationError({
        code: 'invalid_money_value',
        message: `Invalid money value: ${value}.`,
        safeMessage: 'Use a money value like 4.95, $4.95, or 495c.',
        details: { value },
      }),
    );

  const [dollars = '0', cents = ''] = raw.split('.');
  return ok(Number(dollars) * 100 + Number(cents.padEnd(2, '0')));
};

export const formatMoney = (cents: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
