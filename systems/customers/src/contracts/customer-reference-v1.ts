export const customerReferenceV1CapabilityContract = Object.freeze({
  id: 'customers.customer-reference.v1',
  version: 1,
  execution: 'owner-owned',
} as const);

export type CustomerReferenceV1 = Readonly<{
  customerId: string;
  businessId: string;
  version: number;
  active: boolean;
  profile: Readonly<{
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    phone: string | null;
    email: string | null;
  }>;
}>;

export type CustomerReferenceV1Input = Readonly<{
  businessId: string;
  customerId: string;
}>;

export type CustomerReferenceV1Capability = Readonly<{
  contract: typeof customerReferenceV1CapabilityContract;
  execute: (
    input: CustomerReferenceV1Input,
  ) => Promise<CustomerReferenceV1 | null>;
}>;
