export const formatQuantity = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, '');
};
