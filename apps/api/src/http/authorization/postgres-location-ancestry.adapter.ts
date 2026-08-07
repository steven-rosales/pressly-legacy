import type { LocationAncestryPort } from '@pressly/authorization';
import { type Database } from '@pressly/db/client';
import { asc, eq, inArray } from '@pressly/db/query';
import * as business from '@pressly/db/schema/business';
import { notFoundError } from '@pressly/errors/factories';

export const makePostgresLocationAncestryAdapter = (
  db: Database,
): LocationAncestryPort => ({
  resolveBusinessId: async (locationId) => {
    const [location] = await db
      .select({ businessId: business.productionLocations.businessId })
      .from(business.productionLocations)
      .where(eq(business.productionLocations.id, locationId))
      .limit(1);
    if (location === undefined)
      throw notFoundError({
        code: 'production_location_not_found',
        message: 'Production location has no business ancestry.',
        safeMessage: 'The production location was not found.',
      });
    return location.businessId;
  },

  listLocationIdsForBusinesses: async (businessIds) => {
    const uniqueBusinessIds = [...new Set(businessIds)];
    if (uniqueBusinessIds.length === 0) return [];

    const locations = await db
      .select({ id: business.productionLocations.id })
      .from(business.productionLocations)
      .where(
        inArray(business.productionLocations.businessId, uniqueBusinessIds),
      )
      .orderBy(asc(business.productionLocations.id));
    return locations.map(({ id }) => id);
  },
});
