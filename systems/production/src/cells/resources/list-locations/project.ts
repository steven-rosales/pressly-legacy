import type { ListProductionLocationsResult } from './boundary.ts';
import type { ProductionLocations } from './types.ts';

export const projectLocationsResult = (
  locations: ProductionLocations,
): ListProductionLocationsResult => ({
  items: locations.items.map((location) => ({ ...location })),
  asOf: locations.asOf.toISOString(),
});
