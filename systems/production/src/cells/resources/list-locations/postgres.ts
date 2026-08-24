import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type { ListLocationsRepository } from './types.ts';

export const makeListLocationsPostgresRepository = (
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): ListLocationsRepository => ({
  list: async ({ includeInactive, allowedLocationIds }) => {
    if (allowedLocationIds !== null && allowedLocationIds.length === 0)
      return [];

    return (
      await productionScopeReconciliationV1.list({
        includeInactive,
        locationIds: allowedLocationIds,
      })
    ).map(({ id, name, timezone, isActive }) => ({
      id,
      name,
      timezone,
      isActive,
    }));
  },
});
