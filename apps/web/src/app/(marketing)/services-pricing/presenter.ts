export const formatUsdShortFromCents = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export const formatUsdFromCents = (cents: number) =>
  `$${(cents / 100).toFixed(2)}`;

export const formatQuantity = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, '');
};
