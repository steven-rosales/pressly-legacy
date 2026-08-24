import type { ActiveBusinessLocations } from './list-active-business-locations.model.ts';
import type { ListActiveBusinessLocationsStore } from './list-active-business-locations.port.ts';

export type ListActiveBusinessLocations = (
  businessId: string,
) => Promise<ActiveBusinessLocations>;

export const makeListActiveBusinessLocations = (
  store: ListActiveBusinessLocationsStore,
): ListActiveBusinessLocations =>
  async function listActiveBusinessLocations(businessId) {
    const locations = await store.listActiveLocations(businessId);
    return { locations: locations.map((location) => ({ ...location })) };
  };
