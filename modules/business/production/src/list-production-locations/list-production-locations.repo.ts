import {
  and,
  asc,
  eq,
  inArray,
  laundryProduction,
  type Database,
} from '@pressly/db';
import { mapProductionLocation } from './list-production-locations.mapper.ts';
import type { ListProductionLocationsRepository } from './list-production-locations.port.ts';

export const makeListProductionLocationsRepository = (
  db: Database,
): ListProductionLocationsRepository => ({
  listLocations: async ({ includeInactive, allowedLocationIds }) => {
    if (allowedLocationIds !== null && allowedLocationIds.length === 0)
      return [];

    const rows = await db
      .select({
        id: laundryProduction.productionLocations.id,
        name: laundryProduction.productionLocations.name,
        timezone: laundryProduction.productionLocations.timezone,
        isActive: laundryProduction.productionLocations.isActive,
      })
      .from(laundryProduction.productionLocations)
      .where(
        and(
          includeInactive
            ? undefined
            : eq(laundryProduction.productionLocations.isActive, true),
          allowedLocationIds === null
            ? undefined
            : inArray(laundryProduction.productionLocations.id, [
                ...allowedLocationIds,
              ]),
        ),
      )
      .orderBy(
        asc(laundryProduction.productionLocations.name),
        asc(laundryProduction.productionLocations.id),
      );

    return rows.map(mapProductionLocation);
  },
});
