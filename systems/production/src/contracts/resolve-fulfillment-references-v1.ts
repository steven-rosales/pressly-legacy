export const resolveProductionFulfillmentReferencesV1CapabilityContract =
  Object.freeze({
    id: 'production.resolve-fulfillment-references.v1',
    version: 1,
    consistency: 'single-production-read',
  } as const);

export type ProductionFulfillmentReferenceV1 = Readonly<{
  referenceId: string;
  productionOrderId: string | null;
  orderDemandId: string | null;
}>;

export type ResolvedProductionFulfillmentReferenceV1 = Readonly<{
  fulfillmentId: string;
}>;

export type ResolveProductionFulfillmentReferencesV1Capability = Readonly<{
  contract: typeof resolveProductionFulfillmentReferencesV1CapabilityContract;
  resolve: (
    references: readonly ProductionFulfillmentReferenceV1[],
  ) => Promise<
    ReadonlyMap<string, ResolvedProductionFulfillmentReferenceV1 | null>
  >;
}>;
