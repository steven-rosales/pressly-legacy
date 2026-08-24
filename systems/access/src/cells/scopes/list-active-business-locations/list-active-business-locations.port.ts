import type { ActiveBusinessLocation } from './list-active-business-locations.model.ts';

export type ListActiveBusinessLocationsStore = Readonly<{
  listActiveLocations: (
    businessId: string,
  ) => Promise<readonly ActiveBusinessLocation[]>;
}>;
