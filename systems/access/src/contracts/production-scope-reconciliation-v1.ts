export const productionScopeReconciliationV1CapabilityContract = Object.freeze({
  id: 'access.production-scope-reconciliation.v1',
  version: 1,
  transaction: 'owner-owned',
  result: 'typed-location-facts',
} as const);

export type ProductionScopeLocationV1 = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export type ListProductionScopeLocationsV1Input = Readonly<{
  includeInactive: boolean;
  locationIds: readonly string[] | null;
}>;

/**
 * Access-owned canonical location reads for Production. Access executes every
 * read on its own database dependency; consumers receive data only.
 */
export type ProductionScopeReconciliationV1Capability = Readonly<{
  contract: typeof productionScopeReconciliationV1CapabilityContract;
  load: (
    input: Readonly<{ locationId: string }>,
  ) => Promise<ProductionScopeLocationV1 | null>;
  list: (
    input: ListProductionScopeLocationsV1Input,
  ) => Promise<readonly ProductionScopeLocationV1[]>;
}>;
