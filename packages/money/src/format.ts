import type { Money } from './money.js';

export function formatMoney(cents: number, currency?: string): string;
export function formatMoney(value: Money): string;
export function formatMoney(
  value: number | Money,
  requestedCurrency = 'USD',
): string {
  const cents = typeof value === 'number' ? value : value.minorUnits;
  const currency =
    typeof value === 'number' ? requestedCurrency : value.currency;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
