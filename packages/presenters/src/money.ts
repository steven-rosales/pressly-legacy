export const formatMoney = (cents: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
