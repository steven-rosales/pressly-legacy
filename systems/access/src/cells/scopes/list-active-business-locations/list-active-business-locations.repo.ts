import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq } from '@pressly/postgres/query';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import type { ListActiveBusinessLocationsStore } from './list-active-business-locations.port.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeListActiveBusinessLocationsStore = (
  db: PostgresDatabase,
  business: AccessSchema,
): ListActiveBusinessLocationsStore => ({
  listActiveLocations: (businessId) =>
    runDatabaseOperation(() =>
      db
        .select({
          id: business.accessProductionLocations.id,
          name: business.accessProductionLocations.name,
          timezone: business.accessProductionLocations.timezone,
        })
        .from(business.accessProductionLocations)
        .where(
          and(
            eq(business.accessProductionLocations.businessId, businessId),
            eq(business.accessProductionLocations.isActive, true),
          ),
        )
        .orderBy(asc(business.accessProductionLocations.name)),
    ),
});
