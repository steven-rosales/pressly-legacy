import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq, inArray } from '@pressly/postgres/query';
import { notFoundError } from '@pressly/errors/factories';
import type { LocationAncestryPort } from '../../model/ports/location-ancestry/location-ancestry.port.ts';
import type { AccessSchema } from '../../schema/public.ts';

/**
 * Access-owned adapter for canonical business/location ancestry. It receives
 * the composed Access schema segment and never imports a peer-system schema or
 * mutates Production live-revision state.
 */
export const makePostgresLocationAncestry = (
  db: PostgresDatabase,
  business: Pick<AccessSchema, 'accessProductionLocations'>,
): LocationAncestryPort => ({
  resolveBusinessId: async (locationId) => {
    const [location] = await db
      .select({ businessId: business.accessProductionLocations.businessId })
      .from(business.accessProductionLocations)
      .where(eq(business.accessProductionLocations.id, locationId))
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
      .select({ id: business.accessProductionLocations.id })
      .from(business.accessProductionLocations)
      .where(
        inArray(
          business.accessProductionLocations.businessId,
          uniqueBusinessIds,
        ),
      )
      .orderBy(asc(business.accessProductionLocations.id));

    return locations.map(({ id }) => id);
  },
});
