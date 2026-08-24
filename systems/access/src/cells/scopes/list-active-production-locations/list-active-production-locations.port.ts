import type { ActiveProductionLocation } from './list-active-production-locations.model.ts';

export type ListActiveProductionLocationsStore = Readonly<{
  listActiveLocations: () => Promise<readonly ActiveProductionLocation[]>;
}>;
