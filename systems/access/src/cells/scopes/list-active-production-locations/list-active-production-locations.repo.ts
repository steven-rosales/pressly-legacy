import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq } from '@pressly/postgres/query';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import type { ListActiveProductionLocationsStore } from './list-active-production-locations.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeListActiveProductionLocationsStore = (
  db: PostgresDatabase,
  business: AccessSchema,
): ListActiveProductionLocationsStore => ({
  listActiveLocations: async () => {
    try {
      return await db
        .select({
          id: business.accessProductionLocations.id,
          businessId: business.accessProductionLocations.businessId,
          name: business.accessProductionLocations.name,
          timezone: business.accessProductionLocations.timezone,
        })
        .from(business.accessProductionLocations)
        .innerJoin(
          business.businessAccounts,
          eq(
            business.businessAccounts.id,
            business.accessProductionLocations.businessId,
          ),
        )
        .where(
          and(
            eq(business.accessProductionLocations.isActive, true),
            eq(business.businessAccounts.status, 'active'),
          ),
        )
        .orderBy(
          asc(business.accessProductionLocations.businessId),
          asc(business.accessProductionLocations.name),
        );
    } catch (error) {
      // The legacy Processor read reached the centralized API normalizer
      // unchanged. Normalize here to preserve that public 500 mapping rather
      // than adopting Access's authentication-specific database failure.
      throw normalizeUnknownError(error);
    }
  },
});
