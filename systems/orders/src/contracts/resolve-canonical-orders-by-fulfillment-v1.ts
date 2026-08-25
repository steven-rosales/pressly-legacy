export const resolveCanonicalOrdersByFulfillmentV1CapabilityContract =
  Object.freeze({
    id: 'orders.resolve-canonical-orders-by-fulfillment.v1',
    version: 1,
  } as const);

export type CanonicalOrderFulfillmentReferenceV1 = Readonly<{
  referenceId: string;
  fulfillmentId: string;
}>;

export type CanonicalOrderByFulfillmentV1 = Readonly<{
  canonicalOrderId: string;
  canonicalFulfillmentId: string;
  displayNumber: string | null;
  customer: Readonly<{
    resolution: 'resolved' | 'not_provided' | 'pending' | 'conflict';
    userId: string | null;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    phone: string | null;
  }>;
  commercialState: 'open' | 'completed' | 'canceled';
  admissionState: 'unreleased' | 'released' | 'withdrawn';
  versions: Readonly<{ order: number; fulfillment: number }>;
}>;

/**
 * Resolves exact canonical Orders facts from fulfillment identities in one
 * owner-local query over Orders-owned customer snapshots. No relation escapes
 * the capability.
 */
export type ResolveCanonicalOrdersByFulfillmentV1Capability = Readonly<{
  contract: typeof resolveCanonicalOrdersByFulfillmentV1CapabilityContract;
  execute: (
    references: readonly CanonicalOrderFulfillmentReferenceV1[],
  ) => Promise<ReadonlyMap<string, CanonicalOrderByFulfillmentV1 | null>>;
}>;
