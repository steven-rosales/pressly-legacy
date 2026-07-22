export const orderSourceFields = [
  'customer',
  'displayNumber',
  'state',
  'dueAt',
  'currency',
  'totalAmountCents',
  'balanceDueCents',
] as const;

export type OrderSourceField = (typeof orderSourceFields)[number];

export const fulfillmentReleaseAuthorityField = (typeCode: string): string =>
  `fulfillment:${typeCode}:releaseState`;
