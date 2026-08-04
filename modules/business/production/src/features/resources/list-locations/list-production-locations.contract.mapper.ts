export {
  listProductionLocationsQuerySchema,
  listProductionLocationsResultSchema,
} from '@pressly/contracts/production';
import type { ListProductionLocationsResult } from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type { ProductionLocations } from './list-production-locations.model.ts';

export const toListProductionLocationsResult = (
  locations: ProductionLocations,
): ListProductionLocationsResult => ({
  items: locations.items.map((location) => ({
    id: location.id,
    name: location.name,
    timezone: location.timezone,
    isActive: location.isActive,
  })),
  asOf: utcIsoFromDate(locations.asOf),
});
