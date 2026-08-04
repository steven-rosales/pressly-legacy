import type { Database } from '@pressly/db/client';
import { and, asc, eq } from '@pressly/db/query';
import * as business from '@pressly/db/schema/business';
import type { ProcessorAccessLocationsPort } from '../../../ports/processor-access-locations/processor-access-locations.port.ts';

export const makePostgresProcessorAccessLocations = (
  db: Database,
): ProcessorAccessLocationsPort => ({
  listActive: async () =>
    db
      .select({
        id: business.productionLocations.id,
        businessId: business.productionLocations.businessId,
        name: business.productionLocations.name,
        timezone: business.productionLocations.timezone,
      })
      .from(business.productionLocations)
      .innerJoin(
        business.businessAccounts,
        eq(
          business.businessAccounts.id,
          business.productionLocations.businessId,
        ),
      )
      .where(
        and(
          eq(business.productionLocations.isActive, true),
          eq(business.businessAccounts.status, 'active'),
        ),
      )
      .orderBy(
        asc(business.productionLocations.businessId),
        asc(business.productionLocations.name),
      ),
});
