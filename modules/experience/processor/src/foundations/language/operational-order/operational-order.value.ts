const cleanNamePart = (value: string | null): string | null => {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';
  return normalized.length === 0 ? null : normalized;
};

export const canonicalCustomerDisplayName = (input: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string | null => {
  const businessName = cleanNamePart(input.businessName);
  if (businessName !== null) return businessName;
  const personalName = [input.firstName, input.lastName]
    .map(cleanNamePart)
    .filter((part): part is string => part !== null)
    .join(' ');
  return personalName.length === 0 ? null : personalName;
};

export const productionOrderReferenceId = (productionOrderId: string): string =>
  `production:${productionOrderId}`;

export const orderDemandReferenceId = (orderDemandId: string): string =>
  `demand:${orderDemandId}`;
