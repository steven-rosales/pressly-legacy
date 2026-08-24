export const orderLocationFactsV1CapabilityContract = Object.freeze({
  id: 'access.order-location-facts.v1',
  version: 1,
  execution: 'owner-owned',
} as const);

export type OrderLocationFactsV1Input = Readonly<{ locationId: string }>;

export type OrderLocationFactsV1 = Readonly<{
  businessId: string;
  isActive: boolean;
}>;

export type OrderLocationFactsV1Capability = Readonly<{
  contract: typeof orderLocationFactsV1CapabilityContract;
  execute: (
    input: OrderLocationFactsV1Input,
  ) => Promise<OrderLocationFactsV1 | null>;
}>;
