import type { ActiveProductionLocations } from './list-active-production-locations.model.ts';
import type { ListActiveProductionLocationsStore } from './list-active-production-locations.port.ts';

export type ListActiveProductionLocations = (
  input: null,
) => Promise<ActiveProductionLocations>;

export const makeListActiveProductionLocations = (
  store: ListActiveProductionLocationsStore,
): ListActiveProductionLocations =>
  async function listActiveProductionLocations(_input) {
    const locations = await store.listActiveLocations();
    return { locations: locations.map((location) => ({ ...location })) };
  };
